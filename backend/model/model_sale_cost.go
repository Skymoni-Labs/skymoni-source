package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
	"gorm.io/gorm"
)

// Sale guards use paid-credit revenue, not its legacy USD display label.
// The selected 9.9 CNY / 99 credit package basis is CNY 0.10 per credit. A smaller value is allowed
// for discounted credit packages; a larger value cannot relax this floor.
type ModelSalePolicy struct {
	CNYPerCredit    float64 `json:"cny_per_credit"`
	CNYPerUSD       float64 `json:"cny_per_usd"`
	MinimumMargin   float64 `json:"minimum_margin_percent"`
	CostBuffer      float64 `json:"cost_buffer_percent"`
	RevenueReserve  float64 `json:"revenue_reserve_percent"`
	MaxCostAgeHours int     `json:"max_cost_age_hours"`
}

func DefaultModelSalePolicy() ModelSalePolicy { return ModelSalePolicy{.1, 7.3, 20, 10, 5, 48} }

// The administrator selected the 9.9 / 99 package as the revenue basis.
// Runtime configuration supplies actual upstream credit purchase conversion.
// Fees and operating subsidies belong in RevenueReserve, not bulk-package pricing.
func saleCashCostBasis(policy ModelSalePolicy) (float64, map[string]float64, error) {
	cash := min(policy.CNYPerCredit, 9.9/99.0)
	conversion := map[string]float64{}
	path := os.Getenv("SKYMONI_UPSTREAM_SYNC_CONFIG")
	if path == "" {
		return cash, conversion, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, nil, errors.New("现金收入与上游采购换算配置无法读取")
	}
	var cfg struct {
		Net   float64            `json:"net_cny_per_dollar"`
		Costs map[string]float64 `json:"costs"`
	}
	if err = common.Unmarshal(data, &cfg); err != nil {
		return 0, nil, errors.New("现金收入核验配置无效")
	}
	// Revenue uses the user-selected 9.9 / 99 package basis. Fees are covered
	// by RevenueReserve; bulk-package discounts do not reduce this basis.
	for provider, v := range cfg.Costs {
		if v <= 0 || math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, nil, errors.New("上游采购换算配置无效")
		}
		conversion[provider] = v
	}
	return cash, conversion, nil
}
func (p ModelSalePolicy) Validate() error {
	for _, v := range []float64{p.CNYPerCredit, p.CNYPerUSD, p.MinimumMargin, p.CostBuffer, p.RevenueReserve} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errors.New("保本参数必须为有限数值")
		}
	}
	if p.CNYPerCredit <= 0 || p.CNYPerCredit > .1 || p.CNYPerUSD < 4 || p.CNYPerUSD > 15 || p.MinimumMargin < 10 || p.MinimumMargin > 80 || p.CostBuffer < 5 || p.CostBuffer > 100 || p.RevenueReserve < 5 || p.RevenueReserve > 50 || p.MaxCostAgeHours < 1 || p.MaxCostAgeHours > 72 {
		return errors.New("保本参数超出范围；额度收入最高按 ¥0.10、利润至少 10%、成本缓冲和收入预留至少 5%")
	}
	return nil
}

type saleCostTier struct {
	Min     *int64   `json:"min_tokens"`
	Max     *int64   `json:"max_tokens"`
	Input   *float64 `json:"input_per_million"`
	Output  *float64 `json:"output_per_million"`
	Read    *float64 `json:"cache_read_per_million"`
	Write   *float64 `json:"cache_write_per_million"`
	Write1h *float64 `json:"cache_write_1h_per_million"`
}
type saleCost struct {
	Source         string                    `json:"source"`
	TimePricing    *ModelSaleCostTimePricing `json:"time_pricing,omitempty"`
	ChannelID      int                       `json:"channel_id"`
	ChannelVersion string                    `json:"channel_version"`
	SourceModel    string                    `json:"source_model"`
	Provider       string                    `json:"provider"`
	ObservedAt     string                    `json:"observed_at"`
	Billing        string                    `json:"billing_type"`
	Note           string                    `json:"note"`
	GroupRatio     *float64                  `json:"group_ratio"`
	Request        *float64                  `json:"request_usd"`
	Input          *float64                  `json:"input_usd_per_million"`
	Output         *float64                  `json:"output_usd_per_million"`
	Read           *float64                  `json:"cache_read_per_million"`
	Write          *float64                  `json:"cache_write_per_million"`
	Write1h        *float64                  `json:"cache_write_1h_per_million"`
	Tiers          []saleCostTier            `json:"tiers"`
}

func ModelSaleCostChannelVersion(ch Channel, upstream string) string {
	address := ""
	if ch.BaseURL != nil {
		address = *ch.BaseURL
	}
	raw, _ := common.Marshal(map[string]any{"id": ch.Id, "key": ch.Key, "base_url": address, "group": ch.Group, "upstream": upstream})
	return fmt.Sprintf("%x", sha256.Sum256(raw))
}

type saleLeaf struct {
	Label    string
	Min, Max int64
	Prices   map[string]float64
	Request  bool
}

func saleNumber(n ast.Node) (float64, bool) {
	switch v := n.(type) {
	case *ast.IntegerNode:
		return float64(v.Value), true
	case *ast.FloatNode:
		return v.Value, true
	}
	return 0, false
}
func saleLinear(n ast.Node) (map[string]float64, error) {
	if b, ok := n.(*ast.BinaryNode); ok {
		if b.Operator == "+" {
			a, e := saleLinear(b.Left)
			if e != nil {
				return nil, e
			}
			c, e := saleLinear(b.Right)
			if e != nil {
				return nil, e
			}
			for k, v := range c {
				a[k] += v
			}
			return a, nil
		}
		if b.Operator == "*" {
			id, ok := b.Left.(*ast.IdentifierNode)
			v, num := saleNumber(b.Right)
			if !ok || !num {
				id, ok = b.Right.(*ast.IdentifierNode)
				v, num = saleNumber(b.Left)
			}
			if ok && num && v >= 0 && !math.IsInf(v, 0) && strings.Contains("|p|c|cr|cc|cc1h|", "|"+id.Value+"|") {
				return map[string]float64{id.Value: v}, nil
			}
		}
	}
	return nil, errors.New("复杂计费表达式暂不自动降价；需要逐项核验成本")
}
func saleLeaves(expression string) ([]saleLeaf, error) {
	version, body := billingexpr.ParseExprVersion(expression)
	if version != 1 {
		return nil, errors.New("暂不支持此计费版本")
	}
	tree, err := parser.Parse(body)
	if err != nil {
		return nil, err
	}
	var walk func(ast.Node, int64, int64) ([]saleLeaf, error)
	walk = func(n ast.Node, lo, hi int64) ([]saleLeaf, error) {
		if cond, ok := n.(*ast.ConditionalNode); ok {
			// Time-only branches use the worst upstream cost, independent of time.
			if saleTimeCondition(cond.Cond) {
				a, e := walk(cond.Exp1, lo, hi)
				if e != nil {
					return nil, e
				}
				b, e := walk(cond.Exp2, lo, hi)
				return append(a, b...), e
			}
			comparison, ok := cond.Cond.(*ast.BinaryNode)
			if !ok {
				return nil, errors.New("仅自动核验按上下文长度分档的表达式")
			}
			id, ok := comparison.Left.(*ast.IdentifierNode)
			threshold, num := saleNumber(comparison.Right)
			if !ok || id.Value != "len" || !num || threshold < 0 || threshold >= float64(math.MaxInt64) || threshold != math.Trunc(threshold) || (comparison.Operator != "<=" && comparison.Operator != "<") {
				return nil, errors.New("时段、请求参数或复杂条件定价需要人工核验")
			}
			boundary := int64(threshold)
			if comparison.Operator == "<" {
				boundary--
			}
			a, e := walk(cond.Exp1, lo, min(hi, boundary))
			if e != nil {
				return nil, e
			}
			b, e := walk(cond.Exp2, max(lo, boundary+1), hi)
			return append(a, b...), e
		}
		if lo > hi {
			return nil, nil
		}
		call, ok := n.(*ast.CallNode)
		if !ok {
			return nil, errors.New("计费表达式缺少可核验的价格档")
		}
		id, ok := call.Callee.(*ast.IdentifierNode)
		if !ok || id.Value != "tier" || len(call.Arguments) != 2 {
			return nil, errors.New("计费档格式不支持")
		}
		label, ok := call.Arguments[0].(*ast.StringNode)
		if !ok {
			return nil, errors.New("计费档名称不支持")
		}
		leaf := saleLeaf{Label: label.Value, Min: lo, Max: hi}
		if fixed, ok := call.Arguments[1].(*ast.CallNode); ok {
			funcID, ok := fixed.Callee.(*ast.IdentifierNode)
			if !ok || funcID.Value != "fixed" || len(fixed.Arguments) != 1 {
				return nil, errors.New("按次格式不支持")
			}
			v, ok := saleNumber(fixed.Arguments[0])
			if !ok || v <= 0 {
				return nil, errors.New("按次价格无效")
			}
			leaf.Request = true
			leaf.Prices = map[string]float64{"request": v}
			return []saleLeaf{leaf}, nil
		}
		leaf.Prices, err = saleLinear(call.Arguments[1])
		if err != nil {
			return nil, err
		}
		if leaf.Prices["p"] <= 0 || leaf.Prices["c"] <= 0 {
			return nil, errors.New("输入或输出价格不完整")
		}
		return []saleLeaf{leaf}, nil
	}
	return walk(tree.Node, 0, math.MaxInt64)
}

// Request-sensitive conditions and unreviewed clocks remain unsupported.
func saleTimeCondition(n ast.Node) bool {
	switch v := n.(type) {
	case *ast.UnaryNode:
		return v.Operator == "!" && saleTimeCondition(v.Node)
	case *ast.BinaryNode:
		if v.Operator == "&&" || v.Operator == "||" || v.Operator == "and" || v.Operator == "or" {
			return saleTimeCondition(v.Left) && saleTimeCondition(v.Right)
		}
		if v.Operator != "==" && v.Operator != "!=" && v.Operator != ">=" && v.Operator != "<=" && v.Operator != ">" && v.Operator != "<" {
			return false
		}
		call, ok := v.Left.(*ast.CallNode)
		number, numeric := saleNumber(v.Right)
		if !ok || !numeric || number != math.Trunc(number) || number < 0 || number > 9999 || len(call.Arguments) != 1 {
			return false
		}
		id, ok := call.Callee.(*ast.IdentifierNode)
		if !ok || (id.Value != "weekday" && id.Value != "hour" && id.Value != "month" && id.Value != "day" && id.Value != "year") {
			return false
		}
		zone, ok := call.Arguments[0].(*ast.StringNode)
		return ok && zone.Value == "Asia/Shanghai"
	}
	return false
}

type ModelSalePriceLine struct {
	OfficialCNY float64 `json:"official_cny,omitempty"`
	Tier        string  `json:"tier"`
	Component   string  `json:"component"`
	SaleCNY     float64 `json:"sale_cny"`
	CostCNY     float64 `json:"cost_cny"`
	FloorCNY    float64 `json:"floor_cny"`
	TargetCNY   float64 `json:"target_cny"`
}
type ModelSaleQuote struct {
	Basis                    string                        `json:"pricing_basis,omitempty"`
	OfficialSource           string                        `json:"official_source,omitempty"`
	OfficialFX               float64                       `json:"official_usd_cny,omitempty"`
	OfficialPrices           map[string]map[string]float64 `json:"official_prices_cny,omitempty"`
	MaximumCurrentMultiplier float64                       `json:"maximum_current_multiplier,omitempty"`
	CurrentRequestCNY        float64                       `json:"current_request_cny,omitempty"`
	MinimumRequestCNY        float64                       `json:"minimum_request_cny,omitempty"`
	TargetRequestCNY         float64                       `json:"target_request_cny,omitempty"`
	CurrentMultiplier        float64                       `json:"current_multiplier"`
	MinimumMultiplier        float64                       `json:"minimum_multiplier"`
	TargetMultiplier         float64                       `json:"target_multiplier"`
	CashCNYPerCredit         float64                       `json:"cash_cny_per_credit"`
	CostConversion           map[string]float64            `json:"cost_conversion"`
	Model                    string                        `json:"model"`
	Eligible                 bool                          `json:"eligible"`
	Reason                   string                        `json:"reason"`
	MaxDiscount              float64                       `json:"max_discount_percent"`
	Margin                   float64                       `json:"target_margin_percent"`
	Provider                 []string                      `json:"providers"`
	Groups                   []string                      `json:"groups"`
	ObservedAt               string                        `json:"observed_at"`
	Lines                    []ModelSalePriceLine          `json:"lines"`
}

func saleProvider(address string) string {
	u, e := url.Parse(address)
	if e != nil {
		return ""
	}
	h := strings.ToLower(u.Hostname())
	if h == "yylx.io" || strings.HasSuffix(h, ".yylx.io") {
		return "yylx"
	}
	if h == "2000.run" || strings.HasSuffix(h, ".2000.run") {
		return "2000run"
	}
	if h == "oranexa.top" {
		return "oranexa"
	}
	return ""
}
func saleOptionMaps(tx *gorm.DB) (map[string][]saleCost, map[string]float64, map[string]map[string]float64, error) {
	var rows []Option
	keys := []string{"SkymoniUpstreamCosts", "GroupRatio", "group_ratio_setting.group_ratio", "GroupGroupRatio", "group_ratio_setting.group_group_ratio"}
	if e := tx.Where(commonKeyCol+" IN ?", keys).Find(&rows).Error; e != nil {
		return nil, nil, nil, e
	}
	costs := map[string][]saleCost{}
	groups := map[string]float64{}
	overrides := map[string]map[string]float64{}
	for _, r := range rows {
		switch r.Key {
		case "SkymoniUpstreamCosts":
			if e := common.UnmarshalJsonStr(r.Value, &costs); e != nil {
				return nil, nil, nil, e
			}
		case "GroupRatio", "group_ratio_setting.group_ratio":
			var g map[string]float64
			if e := common.UnmarshalJsonStr(r.Value, &g); e != nil {
				return nil, nil, nil, e
			}
			for k, v := range g {
				if old, ok := groups[k]; !ok || v < old {
					groups[k] = v
				}
			}
		default:
			var gg map[string]map[string]float64
			if e := common.UnmarshalJsonStr(r.Value, &gg); e != nil {
				return nil, nil, nil, e
			}
			for user, g := range gg {
				if overrides[user] == nil {
					overrides[user] = map[string]float64{}
				}
				for k, v := range g {
					if old, ok := overrides[user][k]; !ok || v < old {
						overrides[user][k] = v
					}
				}
			}
		}
	}
	return costs, groups, overrides, nil
}
func quoteModelSale(tx *gorm.DB, name string, effective PricingValues, discount float64, policy ModelSalePolicy, now time.Time) (q ModelSaleQuote) {
	q.Model = name
	q.CurrentMultiplier = 1
	q.TargetMultiplier = 1 - discount/100
	q.Provider = []string{}
	q.Groups = []string{}
	q.Lines = []ModelSalePriceLine{}
	fail := func(reason string) ModelSaleQuote { q.Reason = reason; return q }
	if err := policy.Validate(); err != nil {
		return fail(err.Error())
	}
	cashPerCredit, conversion, err := saleCashCostBasis(policy)
	if err != nil {
		return fail(err.Error())
	}
	q.CashCNYPerCredit = cashPerCredit
	q.CostConversion = conversion
	if discount < 0 || discount >= 100 || math.IsNaN(discount) || math.IsInf(discount, 0) {
		return fail("降幅必须大于 0 且不超过 50%")
	}
	if effective["billing_setting.plugin_billing_expr"] != nil || effective["AudioRatio"] != nil || effective["AudioCompletionRatio"] != nil {
		return fail("插件或独立音频计费暂不自动降价")
	}
	var leaves []saleLeaf
	if expr, ok := effective["billing_setting.billing_expr"].(string); ok && effective["billing_setting.billing_mode"] == "tiered_expr" {
		var err error
		leaves, err = saleLeaves(expr)
		if err != nil {
			return fail(err.Error())
		}
	} else if v, ok := effective["ModelPrice"].(float64); ok && v > 0 {
		leaves = []saleLeaf{{Label: "按次", Min: 0, Max: math.MaxInt64, Prices: map[string]float64{"request": v}, Request: true}}
	} else {
		return fail("旧倍率和未明确分项的计费暂不自动降价")
	}
	costs, groups, overrides, err := saleOptionMaps(tx)
	if err != nil {
		return fail("成本或分组配置无法读取")
	}
	var channels []Channel
	if err = tx.Select("id", "key", "base_url", "models", "group", "model_mapping").Where("status = ?", common.ChannelStatusEnabled).Find(&channels).Error; err != nil {
		return fail("渠道配置无法读取")
	}
	providers := map[string]bool{}
	selected := []saleCost{}
	enabledGroups := map[string]bool{}
	for _, ch := range channels {
		listed := false
		for _, m := range strings.Split(ch.Models, ",") {
			if strings.TrimSpace(m) == name {
				listed = true
				break
			}
		}
		if !listed {
			continue
		}
		address := ""
		if ch.BaseURL != nil {
			address = *ch.BaseURL
		}
		provider := saleProvider(address)
		if provider == "" {
			return fail("有未核验成本来源的启用渠道，暂不降价")
		}
		providers[provider] = true
		mapped := name
		if ch.ModelMapping != nil && strings.TrimSpace(*ch.ModelMapping) != "" {
			var mapping map[string]string
			if e := common.UnmarshalJsonStr(*ch.ModelMapping, &mapping); e != nil {
				return fail("渠道模型映射无法核验")
			}
			if target := mapping[name]; target != "" {
				mapped = target
			}
		}
		matched := false
		for _, c := range costs[name] {
			if c.Provider == provider && c.SourceModel == mapped && c.ChannelID == ch.Id && c.ChannelVersion == ModelSaleCostChannelVersion(ch, mapped) {
				selected = append(selected, c)
				matched = true
			}
		}
		if !matched {
			return fail("渠道账户、模型映射或成本未匹配，请刷新上游成本后核验")
		}
		for _, g := range strings.Split(ch.Group, ",") {
			if strings.TrimSpace(g) != "" {
				enabledGroups[strings.TrimSpace(g)] = true
			}
		}
	}
	if len(providers) == 0 {
		return fail("没有启用渠道")
	}
	if len(enabledGroups) == 0 {
		return fail("启用渠道没有可核验的计费分组")
	}
	if enabledGroups["all"] {
		delete(enabledGroups, "all")
		for group := range groups {
			enabledGroups[group] = true
		}
		for _, override := range overrides {
			for group := range override {
				enabledGroups[group] = true
			}
		}
		if len(enabledGroups) == 0 {
			return fail("通配渠道没有可核验的分组倍率")
		}
	}
	ratio := math.Inf(1)
	for g := range enabledGroups {
		v, ok := groups[g]
		if !ok {
			v = 1
		}
		for _, userGroups := range overrides {
			if special, ok := userGroups[g]; ok {
				v = min(v, special)
			}
		}
		if v <= 0 || math.IsNaN(v) || math.IsInf(v, 0) {
			return fail("存在免费或无效分组倍率")
		}
		ratio = min(ratio, v)
		q.Groups = append(q.Groups, g)
	}
	sort.Strings(q.Groups)
	for provider := range providers {
		q.Provider = append(q.Provider, provider)
	}
	sort.Strings(q.Provider)
	maxFactor := 1.0
	minimumFactor := 0.0
	safe := true
	q.Margin = 100
	for _, leaf := range leaves {
		maximum := map[string]float64{}
		for _, c := range selected {
			costConversion := policy.CNYPerUSD
			if v, ok := conversion[c.Provider]; ok {
				costConversion = v
			}
			if c.Provider == "oranexa" && (conversion[c.Provider] <= 0 || c.Source != "https://oranexa.top/api/v1/model-plaza" || c.TimePricing == nil) {
				return fail("Oranexa 采购换算或分时成本来源未核验")
			}
			timeFactor, e := saleCostTimeFactor(c, effective, leaf)
			if e != nil {
				return fail(e.Error())
			}
			costConversion *= timeFactor
			observed, e := time.Parse(time.RFC3339, c.ObservedAt)
			if e != nil || observed.After(now.Add(5*time.Minute)) || now.Sub(observed) > time.Duration(policy.MaxCostAgeHours)*time.Hour {
				return fail("上游成本已过期或时间无效，请先同步成本")
			}
			if q.ObservedAt == "" || c.ObservedAt < q.ObservedAt {
				q.ObservedAt = c.ObservedAt
			}
			if c.Note != "" || c.GroupRatio == nil || *c.GroupRatio <= 0 || math.IsNaN(*c.GroupRatio) || math.IsInf(*c.GroupRatio, 0) {
				return fail("上游成本存在待核验说明或缺少分组倍率")
			}
			if leaf.Request {
				if c.Billing != "request" || c.Request == nil || *c.Request <= 0 || math.IsNaN(*c.Request) || math.IsInf(*c.Request, 0) {
					return fail("缺少按次成本")
				}
				maximum["request"] = max(maximum["request"], *c.Request**c.GroupRatio*costConversion)
				continue
			}
			if c.Billing != "token" {
				return fail("上游和本站计费方式不一致")
			}
			tiers := c.Tiers
			if len(tiers) == 0 {
				tiers = []saleCostTier{{Input: c.Input, Output: c.Output, Read: c.Read, Write: c.Write, Write1h: c.Write1h}}
			}
			cursor := leaf.Min
			sort.Slice(tiers, func(i, j int) bool {
				a, b := int64(0), int64(0)
				if tiers[i].Min != nil {
					a = *tiers[i].Min
				}
				if tiers[j].Min != nil {
					b = *tiers[j].Min
				}
				return a < b
			})
			matched := false
			for _, t := range tiers {
				lo, hi := int64(0), int64(math.MaxInt64)
				if t.Min != nil && *t.Min > 0 {
					lo = *t.Min + 1
				}
				if t.Max != nil {
					hi = *t.Max
				}
				if hi < leaf.Min || lo > leaf.Max {
					continue
				}
				if lo > cursor {
					return fail("成本分档范围存在空缺")
				}
				matched = true
				if hi == math.MaxInt64 {
					cursor = hi
				} else {
					cursor = max(cursor, hi+1)
				}
				components := map[string]*float64{"p": t.Input, "c": t.Output, "cr": t.Read, "cc": t.Write, "cc1h": t.Write1h}
				for k, sale := range leaf.Prices {
					if sale <= 0 {
						continue
					}
					v := components[k]
					if v == nil || *v < 0 || math.IsNaN(*v) || math.IsInf(*v, 0) {
						return fail("缺少 " + k + " 的可核验上游成本")
					}
					maximum[k] = max(maximum[k], *v**c.GroupRatio*costConversion)
				}
				for k, v := range components {
					if v != nil && *v > 0 && leaf.Prices[k] <= 0 {
						return fail("存在未收费的上游成本分项：" + k)
					}
				}
			}
			if !matched || cursor < leaf.Max {
				return fail("成本未覆盖全部上下文档")
			}
		}
		for component, saleCredit := range leaf.Prices {
			sale := saleCredit * ratio * cashPerCredit
			cost := maximum[component]
			net := sale * (1 - policy.RevenueReserve/100)
			floor := cost * (1 + policy.CostBuffer/100) / (1 - policy.MinimumMargin/100) / (1 - policy.RevenueReserve/100)
			target := sale * (1 - discount/100)
			minimumFactor = max(minimumFactor, floor/sale)
			if target+1e-9 < floor {
				safe = false
			}
			if sale <= 0 || math.IsNaN(sale) || math.IsInf(sale, 0) || math.IsNaN(cost) || math.IsInf(cost, 0) {
				return fail("价格或成本无效")
			}
			if cost > 0 {
				maxFactor = min(maxFactor, 1-floor/sale)
				q.Margin = min(q.Margin, (1-cost*(1+policy.CostBuffer/100)/(net*(1-discount/100)))*100)
			}
			q.Lines = append(q.Lines, ModelSalePriceLine{Tier: leaf.Label, Component: component, SaleCNY: sale, CostCNY: cost, FloorCNY: floor, TargetCNY: target})
		}
	}
	sort.Slice(q.Lines, func(i, j int) bool {
		return q.Lines[i].Tier+q.Lines[i].Component < q.Lines[j].Tier+q.Lines[j].Component
	})
	q.MinimumMultiplier = math.Ceil(minimumFactor*1000000) / 1000000
	q.MaxDiscount = min(100, math.Max(0, math.Floor(maxFactor*10000)/100))
	if !safe {
		return fail(fmt.Sprintf("利润空间不足，最低允许价格倍率 %.6f×（原价 = 1；已计收入预留和成本缓冲）", q.MinimumMultiplier))
	}
	q.Eligible = true
	q.Reason = "已核验输入、输出、缓存、分组倍率和启用渠道"
	return q
}

func ModelSaleQuotes(policy ModelSalePolicy, discount float64, now time.Time) ([]ModelSaleQuote, error) {
	return ModelSaleQuotesWithMultipliers(policy, discount, nil, now)
}

func ModelSaleQuotesWithMultipliers(policy ModelSalePolicy, discount float64, multipliers map[string]float64, now time.Time) ([]ModelSaleQuote, error) {
	if e := policy.Validate(); e != nil {
		return nil, e
	}
	pricing := GetPricing()
	names := []string{}
	for _, p := range pricing {
		names = append(names, p.ModelName)
	}
	snapshot, err := GetModelPricingSnapshot(names)
	if err != nil {
		return nil, err
	}
	quotes := []ModelSaleQuote{}
	for _, e := range snapshot.Entries {
		factor := 1 - discount/100
		if multipliers != nil {
			factor = 1
			if v, ok := multipliers[e.ModelName]; ok {
				factor = v
			}
		}
		if factor <= 0 || factor > 1 || math.IsNaN(factor) || math.IsInf(factor, 0) {
			return nil, errors.New("价格倍率必须大于 0、不超过 1")
		}
		quotes = append(quotes, quoteModelSale(DB, e.ModelName, e.Effective, (1-factor)*100, policy, now))
	}
	sort.Slice(quotes, func(i, j int) bool {
		if quotes[i].Eligible != quotes[j].Eligible {
			return quotes[i].Eligible
		}
		return quotes[i].Model < quotes[j].Model
	})
	return quotes, nil
}
