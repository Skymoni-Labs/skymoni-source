package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/gin-gonic/gin"
)

const (
	channelHealthSampleSize     = 2
	channelHealthFailureRounds  = 3
	channelHealthPolicyVersion  = 2
	healthProbeOutputTokenLimit = 64
)

type healthProbeContextKey struct{}

func channelHealthInterval(pool model.ChannelHealthPool, state model.ChannelHealthState) int64 {
	if pool.Auto && state.Failures >= channelHealthFailureRounds {
		switch state.Failures - channelHealthFailureRounds {
		case 0:
			return 900
		case 1:
			return 1800
		default:
			return 3600
		}
	}
	if state.Failures > 0 {
		return 300
	}
	return 1800
}

// A shared upstream pool may serve more than one published site alias.
func channelHealthProbeModel(pool model.ChannelHealthPool, channel model.Channel) string {
	aliases := channelHealthProbeModels(pool, channel)
	if len(aliases) > 0 {
		return aliases[0]
	}
	return ""
}

func channelHealthProbeModels(pool model.ChannelHealthPool, channel model.Channel) []string {
	mapping := map[string]string{}
	if channel.ModelMapping != nil && *channel.ModelMapping != "" {
		if json.Unmarshal([]byte(*channel.ModelMapping), &mapping) != nil {
			return nil
		}
	}
	aliases := []string{}
	for _, alias := range channel.GetModels() {
		upstream := alias
		if mapped, ok := mapping[alias]; ok {
			upstream = mapped
		}
		if upstream == pool.UpstreamModel {
			aliases = append(aliases, alias)
		}
	}
	return aliases
}

type healthProbeLimits struct {
	MaxOutputTokens    int
	OutputBudgetTokens int
	LogLabel           string
}

func channelHealthProbeLimits(pool model.ChannelHealthPool) healthProbeLimits {
	limits := healthProbeLimits{MaxOutputTokens: 1, OutputBudgetTokens: 8}
	if pool.ProbeMaxOutputTokens >= 1 && pool.ProbeMaxOutputTokens <= healthProbeOutputTokenLimit {
		limits.MaxOutputTokens = pool.ProbeMaxOutputTokens
	}
	limits.OutputBudgetTokens = max(limits.OutputBudgetTokens, limits.MaxOutputTokens)
	if pool.ProbeOutputBudgetTokens >= limits.MaxOutputTokens && pool.ProbeOutputBudgetTokens <= healthProbeOutputTokenLimit {
		limits.OutputBudgetTokens = pool.ProbeOutputBudgetTokens
	}
	return limits
}

func healthProbeUsageOverBudget(input, output, outputBudget int) bool {
	return input > 128 || output > outputBudget
}

func minimalHealthProbeBody(raw []byte, maxTokens int) ([]byte, error) {
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, err
	}
	body["max_tokens"] = maxTokens
	body["stream"] = false
	body["messages"] = []map[string]string{{"role": "user", "content": "reply ok"}}
	body["thinking"] = map[string]string{"type": "disabled"}
	delete(body, "max_completion_tokens")
	delete(body, "stream_options")
	if name, _ := body["model"].(string); strings.HasPrefix(name, "gpt-6") {
		body["max_completion_tokens"] = maxTokens
		body["reasoning_effort"] = "low"
		delete(body, "max_tokens")
		delete(body, "thinking")
	}
	return json.Marshal(body)
}

// The worker only runs on the master. There is no email/report integration.
func InitChannelHealth() {
	if !common.IsMasterNode {
		return
	}
	go runModelHealthWorker()
	go func() {
		time.Sleep(30 * time.Second)
		for {
			func() {
				defer func() {
					if recover() != nil {
						common.SysError("sample channel health round failed")
					}
				}()
				runChannelHealthRound()
			}()
			time.Sleep(30 * time.Second)
		}
	}()
}

func runChannelHealthRound() {
	var config model.ChannelHealthConfig
	if model.ReadChannelHealthJSON(model.ChannelHealthConfigKey, &config) != nil || !config.Enabled || len(config.Pools) == 0 {
		return
	}
	now := time.Now().Unix()
	if !model.ClaimChannelHealthRound(now, len(config.Pools)) {
		return
	}
	defer model.ReleaseChannelHealthRound(now, len(config.Pools))
	userID, err := resolveChannelTestUserID(nil)
	if err != nil {
		return
	}
	for _, pool := range config.Pools {
		state := model.ReadChannelHealthState(pool.ID)
		if resetChannelHealthPolicy(&state) {
			if model.SaveChannelHealthState(pool.ID, state) != nil {
				continue
			}
		}
		if now-max(state.LastAt, state.LastAttemptAt) < channelHealthInterval(pool, state) {
			continue
		}
		channels, err := model.ValidChannelHealthChannels(pool)
		if err != nil {
			continue
		}
		if len(channels) != len(pool.Channels) || len(channels) == 0 {
			state.Status = "unknown"
			state.Action = "配置已变化，暂停检测与自动启停"
			state.LastAt = now
			_ = model.SaveChannelHealthState(pool.ID, state)
			continue
		}
		published, err := model.IsModelPublished(pool.Model)
		if err != nil || !published {
			state.Status = "unknown"
			state.Action = "模型未发布，暂停付费检测与恢复"
			state.LastAt = now
			_ = model.SaveChannelHealthState(pool.ID, state)
			continue
		}
		ids := make([]int, 0, len(channels))
		probeModels := make(map[int]string, len(channels))
		publishedAliases := map[string]bool{}
		probeModelsValid := true
		for _, c := range channels {
			ids = append(ids, c.Id)
			alias := channelHealthProbeModel(pool, c)
			open, checked := publishedAliases[alias]
			if !checked && alias != "" {
				var err error
				open, err = model.IsModelPublished(alias)
				if err != nil {
					probeModelsValid = false
					break
				}
				publishedAliases[alias] = open
			}
			if !open {
				probeModelsValid = false
				break
			}
			probeModels[c.Id] = alias
		}
		if !probeModelsValid {
			state.Status = "unknown"
			state.Action = "模型未发布或上游映射不匹配，暂停该池检测与恢复"
			state.LastAttemptAt = now
			_ = model.SaveChannelHealthState(pool.ID, state)
			continue
		}
		logs, err := model.RecentChannelHealthLogs(ids, now-300)
		if err != nil {
			continue
		} // A storage failure must not disable upstreams.
		logs = channelHealthModelLogs(pool, channels, logs)
		budgetDeferred := false
		point, complete := collectChannelHealthSamples(&state, channels, logs, now, pool.ChannelAccounts, func(channel model.Channel) healthSample {
			reserved, err := model.ReserveHealthProbe(time.Now().Unix())
			if err != nil || !reserved {
				budgetDeferred = true
				return healthSample{skipped: true}
			}
			ctx, cancel := context.WithTimeout(context.WithValue(context.Background(), healthProbeContextKey{}, channelHealthProbeLimits(pool)), 45*time.Second)
			defer cancel()
			started := time.Now()
			probeModel := probeModels[channel.Id]
			result := testChannel(ctx, &channel, userID, probeModel, "", false)
			sample := healthSample{success: result.localErr == nil && result.newAPIError == nil, latency: time.Since(started).Milliseconds(), overBudget: result.healthBudgetExceeded}
			if !sample.success && result.context != nil {
				// Unknown upstream charges remain pending in the normal wallet ledger.
				model.RecordErrorLog(result.context, userID, channel.Id, probeModel, "线路抽样检测", "线路抽样检测失败（上游费用待核对）", 0, int(sample.latency/1000), false, result.context.GetString("group"), model.NewLogOther())
			}
			return sample
		})
		if complete && advanceChannelHealth(&state, point) {
			state.Action = "仅抽样观察"
			if pool.Auto {
				enable, apply := channelHealthTransition(state)
				if apply {
					n, err := model.ApplyChannelHealth(pool, enable)
					if err != nil {
						state.Action = "自动启停未完成，将重试"
					} else if n == 0 {
						state.Action = "已完成分组判断，维持当前渠道状态（保留人工关闭）"
					} else if enable {
						state.Action = "本轮成功率达到50%，已启用该组（本轮变更 " + strconv.Itoa(n) + " 条）"
					} else {
						state.Action = "连续三轮成功率低于50%，已关闭该组（本轮变更 " + strconv.Itoa(n) + " 条）"
					}
				} else {
					state.Action = "成功率低于50%：连续 " + strconv.Itoa(state.Failures) + "/3 轮，暂不关闭"
				}
			}
		} else {
			state.Action = "有效样本不足，本轮不计入启停判断"
		}
		if state.BudgetPaused {
			if state.PauseReason == "owner_real_traffic_only" {
				state.Action += "；按用户设置，仅复用真实请求"
			} else {
				state.Action += "；上游计量超出预算，暂停付费探测，等待真实请求"
			}
		}
		if budgetDeferred {
			state.Action = "主动检测预算暂不可用，继续复用真实请求，次日自动恢复日预算"
		}
		if err := model.SaveChannelHealthState(pool.ID, state); err != nil {
			common.SysError("sample channel health state save failed")
		}
	}
}

func channelHealthModelLogs(pool model.ChannelHealthPool, channels []model.Channel, logs []model.Log) []model.Log {
	aliases := map[int]map[string]bool{}
	for _, channel := range channels {
		aliases[channel.Id] = map[string]bool{}
		for _, name := range channelHealthProbeModels(pool, channel) {
			aliases[channel.Id][name] = true
		}
	}
	filtered := make([]model.Log, 0, len(logs))
	for _, log := range logs {
		if aliases[log.ChannelId][log.ModelName] {
			filtered = append(filtered, log)
		}
	}
	return filtered
}

// Each round contains at most two distinct keys. Recent real observations are
// preferred; only missing keys incur a tiny probe. Logs arrive newest first.
type healthSample struct {
	success    bool
	latency    int64
	overBudget bool
	skipped    bool
}

func collectChannelHealthSamples(state *model.ChannelHealthState, channels []model.Channel, logs []model.Log, now int64, accounts map[int]string, probe func(model.Channel) healthSample) (model.ChannelHealthPoint, bool) {
	point := model.ChannelHealthPoint{At: now}
	state.LastAttemptAt = now
	if len(channels) == 0 {
		return point, false
	}
	target := min(channelHealthSampleSize, len(channels))
	recent := map[int]healthSample{}
	for _, log := range logs {
		if _, exists := recent[log.ChannelId]; exists {
			continue
		}
		if ok, counted := model.ChannelHealthLogOutcome(log); counted {
			recent[log.ChannelId] = healthSample{success: ok, latency: int64(log.UseTime) * 1000}
		}
	}
	selected := map[int]bool{}
	selectedAccounts := map[string]bool{}
	accountOf := func(id int) string {
		if account := accounts[id]; account != "" {
			return account
		}
		return strconv.Itoa(id)
	}
	var latency int64
	realCount, probeCount := 0, 0
	add := func(channel model.Channel, sample healthSample, index int) {
		selected[channel.Id] = true
		selectedAccounts[accountOf(channel.Id)] = true
		point.Count++
		if !sample.success {
			point.Failures++
		}
		latency += sample.latency
		state.Cursor = (index + 1) % len(channels)
	}
	start := ((state.Cursor % len(channels)) + len(channels)) % len(channels)
	for offset := 0; offset < len(channels) && point.Count < target; offset++ {
		index := (start + offset) % len(channels)
		channel := channels[index]
		if selectedAccounts[accountOf(channel.Id)] {
			continue
		}
		if sample, exists := recent[channel.Id]; exists {
			add(channel, sample, index)
			realCount++
		}
	}
	start = state.Cursor
	for offset := 0; offset < len(channels) && point.Count < target && !state.BudgetPaused; offset++ {
		index := (start + offset) % len(channels)
		channel := channels[index]
		if selected[channel.Id] || selectedAccounts[accountOf(channel.Id)] {
			continue
		}
		sample := probe(channel)
		if sample.skipped {
			break
		}
		add(channel, sample, index)
		probeCount++
		state.BudgetPaused = sample.overBudget
	}
	point.Source = "real"
	if probeCount > 0 {
		point.Source = "probe"
		if realCount > 0 {
			point.Source = "mixed"
		}
	}
	if point.Count > 0 {
		point.LatencyMs = latency / int64(point.Count)
	}
	return point, point.Count == target
}

func resetChannelHealthPolicy(state *model.ChannelHealthState) bool {
	if state.PolicyVersion == channelHealthPolicyVersion {
		return false
	}
	state.PolicyVersion = channelHealthPolicyVersion
	state.Successes, state.Failures = 0, 0
	state.Action = "已切换50%规则，等待新一轮抽样"
	return true
}

func channelHealthTransition(state model.ChannelHealthState) (enable, apply bool) {
	return state.Successes > 0, state.Successes > 0 || state.Failures >= channelHealthFailureRounds
}

func advanceChannelHealth(state *model.ChannelHealthState, point model.ChannelHealthPoint) bool {
	if point.Count <= 0 || point.Failures < 0 || point.Failures > point.Count {
		return false
	}
	resetChannelHealthPolicy(state)
	point.Success = (point.Count-point.Failures)*2 >= point.Count
	state.LastAt = point.At
	if point.Success {
		state.Successes++
		state.Failures = 0
	} else {
		state.Successes = 0
		state.Failures++
	}
	state.Status = "degraded"
	if point.Failures == 0 {
		state.Status = "available"
	}
	if point.Failures == point.Count {
		state.Status = "unavailable"
	}
	state.History = append(state.History, point)
	if len(state.History) > 60 {
		state.History = state.History[len(state.History)-60:]
	}
	return true
}

func GetUpstreamChannelHealth(c *gin.Context) {
	var config model.ChannelHealthConfig
	_ = model.ReadChannelHealthJSON(model.ChannelHealthConfigKey, &config)
	rows := make([]gin.H, 0, len(config.Pools))
	for _, p := range config.Pools {
		channels, err := model.ValidChannelHealthChannels(p)
		if err != nil {
			c.JSON(500, gin.H{"success": false, "message": "读取渠道状态失败"})
			return
		}
		enabled := 0
		for _, ch := range channels {
			if ch.Status == 1 {
				enabled++
			}
		}
		state := model.ReadChannelHealthState(p.ID)
		limits := channelHealthProbeLimits(p)
		if time.Now().Unix()-state.LastAt > max(channelHealthInterval(p, state)*3, 900) {
			state.Status = "unknown"
		}
		rows = append(rows, gin.H{"id": p.ID, "provider": p.Provider, "account": p.Account, "upstream_model": p.UpstreamModel, "upstream_group": p.UpstreamGroup, "multiplier": p.Multiplier, "auto": p.Auto, "interval_seconds": channelHealthInterval(p, state), "probe_max_output_tokens": limits.MaxOutputTokens, "probe_output_budget_tokens": limits.OutputBudgetTokens, "channels": len(p.Channels), "matched": len(channels), "enabled": enabled, "state": state})
	}
	budget, err := model.ReadHealthProbeBudget(time.Now().Unix())
	if err != nil {
		c.JSON(500, gin.H{"success": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"enabled": config.Enabled, "interval_seconds": 1800, "sample_size": channelHealthSampleSize, "enable_success_rate": 0.5, "disable_rounds": channelHealthFailureRounds, "max_output_tokens": 1, "probe_budget": budget, "pools": rows, "server_time": time.Now().Unix()}})
}

func GetDeepSeekChannelHealth(c *gin.Context) {
	names, err := publishedDeepSeekHealthModels()
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": "读取模型状态失败"})
		return
	}
	rows := make([]gin.H, 0, len(names))
	now := time.Now().Unix()
	for _, name := range names {
		state := model.ReadModelHealthState(name)
		status := state.Status
		lastSource := ""
		if len(state.History) > 0 {
			lastSource = state.History[len(state.History)-1].Source
		}
		if state.LastAt == 0 || now-state.LastAt > modelHealthIntervalSeconds*3 || (state.BudgetPaused && lastSource != "real") {
			status = "unknown"
		}
		var routes int64
		if err := model.DB.Model(&model.Ability{}).Where("model = ? AND enabled = ?", name, true).Count(&routes).Error; err != nil {
			c.JSON(500, gin.H{"success": false})
			return
		}
		if routes == 0 {
			status = "unavailable"
		}
		// Preserve the metrics shape for already-loaded frontend versions.
		metrics, err := perfmetrics.Query(perfmetrics.QueryParams{Model: name, Hours: 24})
		if err != nil {
			c.JSON(500, gin.H{"success": false, "message": "读取模型状态失败"})
			return
		}
		samples := state.History
		if samples == nil {
			samples = []model.ChannelHealthPoint{}
		}
		rows = append(rows, gin.H{"model": name, "status": status, "last_at": state.LastAt, "interval_seconds": modelHealthInterval(state), "probe_paused": state.BudgetPaused, "metrics": gin.H{"summary": metrics.Summary, "series": metrics.Series}, "samples": samples})
	}
	budget, err := model.ReadHealthProbeBudget(now)
	if err != nil {
		c.JSON(500, gin.H{"success": false})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"models": rows, "server_time": now, "refresh_seconds": 60, "probe_interval_seconds": modelHealthIntervalSeconds, "probe_daily_limit": budget.Limit, "probe_budget_exhausted": budget.Used >= budget.Limit, "sample_size": 1, "max_output_tokens": 1}})
}
