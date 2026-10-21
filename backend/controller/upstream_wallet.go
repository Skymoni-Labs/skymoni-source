package controller

import (
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type walletChannel struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	BaseURL      string `json:"base_url"`
	Models       string `json:"models"`
	ModelMapping string `json:"model_mapping"`
	WalletID     int    `json:"wallet_id"`
}
type walletCacheState struct {
	Wallets  map[int]model.UpstreamWallet
	Channels map[int]walletChannel
	Costs    map[string][]UpstreamCost
}

var upstreamWalletCache struct {
	sync.RWMutex
	state walletCacheState
}
var upstreamWalletRefresh sync.Mutex

func refreshUpstreamWalletCache() error {
	upstreamWalletRefresh.Lock()
	defer upstreamWalletRefresh.Unlock()
	wallets := []model.UpstreamWallet{}
	var bindings []model.UpstreamWalletBinding
	channels := []walletChannel{}
	if err := model.DB.Find(&wallets).Error; err != nil {
		return err
	}
	if err := model.DB.Find(&bindings).Error; err != nil {
		return err
	}
	state := walletCacheState{Wallets: map[int]model.UpstreamWallet{}, Channels: map[int]walletChannel{}, Costs: map[string][]UpstreamCost{}}
	for _, w := range wallets {
		state.Wallets[w.ID] = w
	}
	ids := make([]int, 0, len(bindings))
	byChannel := map[int]int{}
	for _, b := range bindings {
		ids = append(ids, b.ChannelID)
		byChannel[b.ChannelID] = b.WalletID
	}
	if len(ids) > 0 {
		if err := model.DB.Table("channels").Select("id, name, base_url, models, model_mapping").Where("id IN ?", ids).Scan(&channels).Error; err != nil {
			return err
		}
	}
	for _, ch := range channels {
		ch.WalletID = byChannel[ch.ID]
		state.Channels[ch.ID] = ch
	}
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap["SkymoniUpstreamCosts"]
	common.OptionMapRWMutex.RUnlock()
	if raw != "" {
		if err := common.UnmarshalJsonStr(raw, &state.Costs); err != nil {
			return err
		}
	}
	upstreamWalletCache.Lock()
	upstreamWalletCache.state = state
	upstreamWalletCache.Unlock()
	return nil
}

func InitUpstreamWallet() {
	if err := refreshUpstreamWalletCache(); err != nil {
		common.SysError("upstream wallet cache initialization failed")
		return
	}
	model.SetUpstreamWalletEstimator(estimateUpstreamWalletLog)
	go func() {
		for {
			time.Sleep(30 * time.Second)
			if err := refreshUpstreamWalletCache(); err != nil {
				common.SysError("upstream wallet cache refresh failed")
			}
			if err := model.RepairUpstreamWalletLogs(); err != nil {
				common.SysError("upstream wallet ledger repair failed")
			}
		}
	}()
}

func estimateUpstreamWalletLog(log *model.Log) *model.UpstreamWalletSnapshot {
	if log == nil || (log.Type != model.LogTypeConsume && log.Type != model.LogTypeError && log.Type != model.LogTypeRefund) {
		return nil
	}
	upstreamWalletCache.RLock()
	state := upstreamWalletCache.state
	upstreamWalletCache.RUnlock()
	channel, ok := state.Channels[log.ChannelId]
	if !ok {
		return nil
	}
	wallet, ok := state.Wallets[channel.WalletID]
	if !ok {
		return nil
	}
	if wallet.CalibratedAt == 0 {
		return nil
	}
	s := &model.UpstreamWalletSnapshot{WalletID: wallet.ID, Revision: wallet.Revision, Status: "pending"}
	if log.Type != model.LogTypeConsume {
		s.Note = "失败或退款请求，上游实际扣款待核对"
		return s
	}
	var other map[string]any
	_ = common.UnmarshalJsonStr(log.Other, &other)
	if other["is_task"] == true {
		s.Note = "异步任务最终成本待核对"
		return s
	}
	candidates := []string{log.ModelName}
	var mappings map[string]string
	_ = common.UnmarshalJsonStr(channel.ModelMapping, &mappings)
	upstream := log.ModelName
	if target := mappings[log.ModelName]; target != "" {
		candidates = append(candidates, target)
		upstream = target
	}
	if target, _ := other["upstream_model_name"].(string); target != "" {
		candidates = append(candidates, target)
		upstream = target
	}
	chosen, reason := selectUpstreamWalletCost(state.Costs, candidates, wallet.Provider, upstream, channel.ID)
	if reason != "" {
		s.Note = reason
		return s
	}
	cost, reason := calculateWalletCost(log, other, chosen)
	if reason != "" {
		s.Note = reason
		return s
	}
	s.Cost = cost
	s.Status = "priced"
	s.Note = fmt.Sprintf("%s · %s · 分组倍率 %g", chosen.Provider, chosen.Group, walletRatio(chosen.GroupRatio))
	return s
}

// A model may have different supplier groups on many channels. Only the quote
// for the channel that actually served this request can debit its bound wallet.
// Old unbound quotes remain usable when exactly one matches; another channel's
// quote, ambiguous groups and missing prices never silently become a debit.
func selectUpstreamWalletCost(costs map[string][]UpstreamCost, names []string, provider, upstream string, channelID int) (UpstreamCost, string) {
	bound, legacy := []UpstreamCost{}, []UpstreamCost{}
	seenNames := map[string]bool{}
	seenQuotes := map[string]bool{}
	for _, name := range names {
		if seenNames[name] {
			continue
		}
		seenNames[name] = true
		for _, quote := range costs[name] {
			if !strings.EqualFold(strings.TrimSpace(quote.Provider), strings.TrimSpace(provider)) || (quote.SourceModel != "" && quote.SourceModel != upstream) {
				continue
			}
			if quote.ChannelID != 0 && quote.ChannelID != channelID {
				continue
			}
			// Alias and upstream observations of the same price can have
			// different fetch times or provenance without conflicting.
			identity := quote
			identity.Source = ""
			identity.ObservedAt = ""
			identity.Note = ""
			raw, err := common.Marshal(identity)
			if err != nil || seenQuotes[string(raw)] {
				continue
			}
			seenQuotes[string(raw)] = true
			if quote.ChannelID == channelID && channelID > 0 {
				bound = append(bound, quote)
			} else {
				legacy = append(legacy, quote)
			}
		}
	}
	if len(bound) == 1 {
		return bound[0], ""
	}
	if len(bound) > 1 {
		return UpstreamCost{}, "实际渠道存在多个上游分组报价，请核对成本绑定"
	}
	if len(legacy) == 1 {
		return legacy[0], ""
	}
	if len(legacy) > 1 {
		return UpstreamCost{}, "该模型有多个未绑定渠道的上游报价，请核对上游分组"
	}
	return UpstreamCost{}, "没有与账户、实际渠道和上游模型匹配的成本"
}

func walletRatio(v *float64) float64 {
	if v == nil {
		return 1
	}
	return *v
}
func walletNumber(other map[string]any, key string) float64 { v, _ := other[key].(float64); return v }
func validWalletCost(v float64) bool                        { return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 }

func calculateWalletCost(log *model.Log, other map[string]any, quote UpstreamCost) (float64, string) {
	ratio := walletRatio(quote.GroupRatio)
	if !validWalletCost(ratio) {
		return 0, "上游分组倍率无效"
	}
	if quote.TimePricing != nil {
		_, peak, err := quote.TimePricing.Condition()
		if err != nil || log.CreatedAt <= 0 || log.UseTime < 0 || int64(log.UseTime) >= log.CreatedAt {
			return 0, "上游分时成本规则或请求时间待核对"
		}
		// Consume logs are timestamped at completion. Their duration is seconds
		// since request start, so a slow response must not change its price period.
		at := time.Unix(log.CreatedAt-int64(log.UseTime), 0).In(time.FixedZone("Asia/Shanghai", 8*60*60))
		weekday := at.Weekday()
		eligibleDay := !quote.TimePricing.WeekdaysOnly || (weekday >= time.Monday && weekday <= time.Friday)
		if eligibleDay && ((at.Hour() >= 9 && at.Hour() < 12) || (at.Hour() >= 14 && at.Hour() < 18)) {
			ratio *= peak
		}
	}
	if strings.Contains(strings.ToLower(log.ModelName), "image") {
		return 0, "图片数量及图片规格的上游成本待核对"
	}
	if quote.BillingType == "request" {
		if quote.RequestUSD == nil || !validWalletCost(*quote.RequestUSD) {
			return 0, "缺少按次成本"
		}
		// Async tasks are handled as pending before reaching this function.
		cost := *quote.RequestUSD * ratio
		if !validWalletCost(cost) {
			return 0, "上游按次成本超出有效范围"
		}
		return cost, ""
	}
	if quote.BillingType != "token" {
		return 0, "此计费方式暂未取得可核验的上游成本"
	}
	if other["image"] == true || other["audio_input_seperate_price"] == true || walletNumber(other, "audio_output_tokens") > 0 || walletNumber(other, "audio_input") > 0 || walletNumber(other, "audio_output") > 0 {
		return 0, "图像或音频成本待核对"
	}
	if tools, ok := other["tool_surcharges"].([]any); ok && len(tools) > 0 {
		return 0, "工具调用附加成本待核对"
	}
	prompt := float64(log.PromptTokens)
	output := float64(log.CompletionTokens)
	cache := walletNumber(other, "cache_tokens")
	write := walletNumber(other, "cache_write_tokens")
	if write == 0 {
		write = walletNumber(other, "cache_creation_tokens")
	}
	write1h := walletNumber(other, "cache_creation_tokens_1h")
	if walletNumber(other, "cache_creation_tokens_5m")+write1h > 0 {
		write = walletNumber(other, "cache_creation_tokens_5m") + write1h
	}
	total := prompt
	if other["usage_semantic"] == "anthropic" {
		total = prompt + cache + write
	} else {
		if normalized := walletNumber(other, "input_tokens_total"); normalized > 0 {
			total = normalized
			prompt = normalized
		}
		prompt -= cache + write
	}
	if prompt < 0 || write1h > write || !validWalletCost(total) || !validWalletCost(output) || !validWalletCost(cache) || !validWalletCost(write) {
		return 0, "Token 用量口径不完整"
	}
	if total+output == 0 {
		return 0, "未返回可核验的 Token 用量"
	}
	inputPrice, outputPrice, readPrice, writePrice, hourPrice := quote.InputUSDPerMillion, quote.OutputUSDPerMillion, quote.CacheRead, quote.CacheWrite, quote.CacheWrite1h
	if len(quote.Tiers) > 0 {
		matched := false
		for _, tier := range quote.Tiers {
			if (tier.MinTokens == nil || total >= float64(*tier.MinTokens)) && (tier.MaxTokens == nil || total <= float64(*tier.MaxTokens)) {
				inputPrice, outputPrice, readPrice, writePrice, hourPrice = tier.InputPerMillion, tier.OutputPerMillion, tier.CacheReadPerMillion, tier.CacheWritePerMillion, tier.CacheWrite1hPerMillion
				matched = true
				break
			}
		}
		if !matched {
			return 0, "用量未匹配任何上游价格阶梯"
		}
	}
	sum := 0.0
	for _, item := range []struct {
		tokens float64
		price  *float64
	}{{prompt, inputPrice}, {output, outputPrice}, {cache, readPrice}, {write - write1h, writePrice}, {write1h, hourPrice}} {
		if item.tokens == 0 {
			continue
		}
		if item.price == nil || !validWalletCost(*item.price) {
			return 0, "缺少输入、输出或缓存成本"
		}
		sum += item.tokens * *item.price / 1e6
	}
	sum *= ratio
	if !validWalletCost(sum) {
		return 0, "上游成本超出有效范围"
	}
	return sum, ""
}

func GetUpstreamWallets(c *gin.Context) {
	if err := model.RepairUpstreamWalletLogs(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "本地成本账本暂时无法更新"})
		return
	}
	wallets := []model.UpstreamWallet{}
	var bindings []model.UpstreamWalletBinding
	channels := []walletChannel{}
	if model.DB.Order("id ASC").Find(&wallets).Error != nil || model.DB.Find(&bindings).Error != nil || model.DB.Table("channels").Select("id,name,base_url,models,model_mapping").Order("id ASC").Scan(&channels).Error != nil {
		c.JSON(500, gin.H{"success": false, "message": "无法读取上游账户"})
		return
	}
	assigned := map[int]int{}
	for _, b := range bindings {
		assigned[b.ChannelID] = b.WalletID
	}
	for i := range channels {
		channels[i].WalletID = assigned[channels[i].ID]
	}
	conversions := map[string]float64{}
	if cfg, err := loadUpstreamSyncConfig(); err == nil && cfg.NetCNYPerDollar > 0 {
		for p, rate := range cfg.Costs {
			conversions[p] = rate / cfg.NetCNYPerDollar
		}
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"wallets": wallets, "channels": channels, "usage_logging_enabled": common.LogConsumeEnabled, "recovery_enabled": model.DB == model.LOG_DB, "suggested_conversions": conversions}})
}

func CreateUpstreamWallet(c *gin.Context) {
	var request struct {
		model.UpstreamWallet
		ChannelIDs []int `json:"channel_ids"`
	}
	if c.ShouldBindJSON(&request) != nil {
		c.JSON(400, gin.H{"success": false, "message": "账户配置无效"})
		return
	}
	request.Name = strings.TrimSpace(request.Name)
	request.Provider = strings.TrimSpace(request.Provider)
	request.Unit = strings.TrimSpace(request.Unit)
	if request.Provider == "" || len(request.Provider) > 40 || request.Unit == "" || len(request.Unit) > 40 || request.CalibratedAt < 0 || request.CalibratedAt > time.Now().Unix() || (request.CalibratedAt == 0 && request.Remaining != 0) {
		c.JSON(400, gin.H{"success": false, "message": "请填写币种、成本来源和核验时间"})
		return
	}
	if err := model.SaveUpstreamWallet(&request.UpstreamWallet, request.ChannelIDs); err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	_ = refreshUpstreamWalletCache()
	recordManageAudit(c, "upstream_wallet.create", map[string]any{"wallet_id": request.ID, "name": request.Name, "channel_ids": request.ChannelIDs})
	c.JSON(200, gin.H{"success": true, "data": request.UpstreamWallet})
}

func AdjustUpstreamWallet(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var request struct {
		Revision int     `json:"revision"`
		Kind     string  `json:"kind"`
		Amount   float64 `json:"amount"`
		Note     string  `json:"note"`
	}
	if id <= 0 || c.ShouldBindJSON(&request) != nil || len(request.Note) > 500 {
		c.JSON(400, gin.H{"success": false, "message": "余额调整无效"})
		return
	}
	if err := model.AdjustUpstreamWallet(id, request.Revision, request.Kind, request.Amount, time.Now().Unix(), request.Note); err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	_ = refreshUpstreamWalletCache()
	recordManageAudit(c, "upstream_wallet."+request.Kind, map[string]any{"wallet_id": id, "amount": request.Amount, "note": request.Note})
	c.JSON(200, gin.H{"success": true})
}

func GetUpstreamWalletHistory(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	events := []model.UpstreamWalletEvent{}
	if id <= 0 || model.DB.Where("wallet_id = ?", id).Order("id DESC").Limit(100).Find(&events).Error != nil {
		c.JSON(400, gin.H{"success": false, "message": "无法读取成本明细"})
		return
	}
	sort.SliceStable(events, func(i, j int) bool { return events[i].ID > events[j].ID })
	c.JSON(200, gin.H{"success": true, "data": events})
}
