package model

import (
	_ "embed"
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
	"gorm.io/gorm"
	"math"
	"sort"
	"strings"
	"time"
)

// Reviewed public price references shared with the model square. Procurement
// costs are independent of these references and are never inferred from them.
//
//go:embed model_sale_official_reference.json
var saleOfficialJSON []byte

func saleOfficialPrices(name string, leaf saleLeaf, fx float64) (map[string]float64, string, error) {
	var refs struct {
		OpenAI   map[string][]float64 `json:"openai"`
		Claude   map[string][]float64 `json:"claude"`
		Domestic map[string]struct {
			Currency, Source, Kind string
			Tiers                  map[string]map[string]float64
		} `json:"domestic"`
	}
	if err := common.Unmarshal(saleOfficialJSON, &refs); err != nil {
		return nil, "", err
	}
	for _, suffix := range []string{"-token-pro", "-token-api", "-token"} {
		name = strings.TrimSuffix(name, suffix)
	}
	if name == "gpt-5.6" {
		name = "gpt-5.6-sol"
	}
	if r, ok := refs.Domestic[name]; ok {
		key := leaf.Label
		if r.Kind == "flat" {
			key = "base"
		}
		if r.Kind == "context" {
			key = "short"
			if leaf.Min > 512000 {
				key = "long"
			}
		}
		v, ok := r.Tiers[key]
		if !ok {
			return nil, r.Source, errors.New("官方价格没有对应计费档")
		}
		p := map[string]float64{}
		for k, n := range v {
			if r.Currency == "USD" {
				n *= fx
			}
			p[k] = n
		}
		return p, r.Source, nil
	}
	if p, ok := refs.OpenAI[name]; ok {
		long := leaf.Min > 272000
		if leaf.Min <= 272000 && leaf.Max > 272000 {
			return nil, "", errors.New("本站上下文档未对齐官方档位")
		}
		input, output := p[0], p[1]
		read := input / 10
		if len(p) > 2 {
			read = p[2]
		}
		if long {
			input *= 2
			output *= 1.5
			read *= 2
		}
		v := map[string]float64{"p": input * fx, "c": output * fx, "cr": read * fx}
		if name != "gpt-5.5" {
			v["cc"] = input * 1.25 * fx
			v["cc1h"] = v["cc"]
		}
		return v, "https://developers.openai.com/api/docs/models/" + name, nil
	}
	if p, ok := refs.Claude[name]; ok {
		if leaf.Min != 0 || leaf.Max != math.MaxInt64 {
			return nil, "", errors.New("官方上下文档未核验")
		}
		return map[string]float64{"p": p[0] * fx, "c": p[1] * fx, "cr": p[2] * fx, "cc": p[0] * 1.25 * fx, "cc1h": p[0] * 2 * fx}, "https://platform.claude.com/docs/en/about-claude/pricing", nil
	}
	if name == "grok-4.5" || name == "grok-4.6" || name == "grok-4.7" {
		input, output, read := 2.0, 6.0, .3
		if name != "grok-4.5" {
			read = .5
		}
		if leaf.Min >= 200000 {
			input = 4
			output = 12
			read *= 2
		}
		return map[string]float64{"p": input * fx, "c": output * fx, "cr": read * fx}, "https://docs.x.ai/developers/pricing", nil
	}
	return nil, "", errors.New("尚无对应的已核验官方价格")
}

func saleOfficialFX(tx *gorm.DB, fallback float64, now time.Time) (float64, error) {
	var o Option
	r := tx.Where(commonKeyCol+" = ?", "SkymoniReferenceFX").Limit(1).Find(&o)
	err := r.Error
	if err == nil && r.RowsAffected == 0 {
		return fallback, nil
	}
	if err != nil {
		return 0, err
	}
	var q struct {
		Rate   float64 `json:"usd_to_cny"`
		Date   string  `json:"rate_date"`
		Source string  `json:"source"`
	}
	if common.UnmarshalJsonStr(o.Value, &q) != nil || q.Rate < 4 || q.Rate > 10 || q.Source != "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml" {
		return 0, errors.New("官方价格换算汇率未核验")
	}
	d, err := time.Parse("2006-01-02", q.Date)
	if err != nil || d.After(now) || now.Sub(d) > 10*24*time.Hour {
		return 0, errors.New("官方价格换算汇率已过期")
	}
	return q.Rate, nil
}

func saleMinimumGroupRatio(tx *gorm.DB, name string) (float64, error) {
	_, groups, overrides, err := saleOptionMaps(tx)
	if err != nil {
		return 0, err
	}
	var channels []Channel
	if err = tx.Select("models", "group").Where("status = ?", common.ChannelStatusEnabled).Find(&channels).Error; err != nil {
		return 0, err
	}
	selected := map[string]bool{}
	for _, ch := range channels {
		found := false
		for _, m := range strings.Split(ch.Models, ",") {
			if strings.TrimSpace(m) == name {
				found = true
			}
		}
		if found {
			for _, g := range strings.Split(ch.Group, ",") {
				selected[strings.TrimSpace(g)] = true
			}
		}
	}
	if selected["all"] {
		delete(selected, "all")
		for g := range groups {
			selected[g] = true
		}
		for _, gs := range overrides {
			for g := range gs {
				selected[g] = true
			}
		}
	}
	ratio := math.Inf(1)
	for g := range selected {
		v, ok := groups[g]
		if !ok {
			v = 1
		}
		for _, gs := range overrides {
			if o, ok := gs[g]; ok {
				v = min(v, o)
			}
		}
		ratio = min(ratio, v)
	}
	if ratio <= 0 || math.IsInf(ratio, 0) || math.IsNaN(ratio) {
		return 0, errors.New("分组价格倍率无效或没有启用渠道")
	}
	return ratio, nil
}

// Replace only the reviewed price coefficients, retaining the exact context
// conditions and tier names. Values are wallet credits, not fiat dollars.
func saleAbsolutePricing(name string, configured, effective PricingValues, prices map[string]map[string]float64) (PricingValues, error) {
	target, err := saleDiscountPricing(name, configured, effective, 1)
	if err != nil {
		return nil, err
	}
	if _, ok := effective["ModelPrice"].(float64); ok && effective["billing_setting.billing_mode"] != "tiered_expr" {
		target["ModelPrice"] = prices["按次"]["request"]
		return target, validateModelPricing(name, target, configured)
	}
	_, body := billingexpr.ParseExprVersion(effective["billing_setting.billing_expr"].(string))
	tree, err := parser.Parse(body)
	if err != nil {
		return nil, err
	}
	var walk func(ast.Node) error
	walk = func(n ast.Node) error {
		if c, ok := n.(*ast.ConditionalNode); ok {
			if e := walk(c.Exp1); e != nil {
				return e
			}
			return walk(c.Exp2)
		}
		call, ok := n.(*ast.CallNode)
		if !ok || len(call.Arguments) != 2 {
			return errors.New("价格表达式未核验")
		}
		label, ok := call.Arguments[0].(*ast.StringNode)
		if !ok {
			return errors.New("计费档无效")
		}
		values, ok := prices[label.Value]
		if !ok {
			return errors.New("缺少计费档价格")
		}
		if fixed, ok := call.Arguments[1].(*ast.CallNode); ok {
			fixed.Arguments[0] = &ast.FloatNode{Value: values["request"]}
			return nil
		}
		var replace func(ast.Node) error
		replace = func(n ast.Node) error {
			b, ok := n.(*ast.BinaryNode)
			if !ok {
				return errors.New("分项未核验")
			}
			if b.Operator == "+" {
				if e := replace(b.Left); e != nil {
					return e
				}
				return replace(b.Right)
			}
			id, ok := b.Left.(*ast.IdentifierNode)
			if ok {
				v, exists := values[id.Value]
				if !exists {
					return errors.New("缺少官方分项价格")
				}
				b.Right = &ast.FloatNode{Value: v}
				return nil
			}
			id, ok = b.Right.(*ast.IdentifierNode)
			if !ok {
				return errors.New("分项无效")
			}
			v, exists := values[id.Value]
			if !exists {
				return errors.New("缺少官方分项价格")
			}
			b.Left = &ast.FloatNode{Value: v}
			return nil
		}
		return replace(call.Arguments[1])
	}
	if err = walk(tree.Node); err != nil {
		return nil, err
	}
	target["billing_setting.billing_expr"] = tree.Node.String()
	return target, validateModelPricing(name, target, configured)
}

func quoteModelSaleConfig(tx *gorm.DB, name string, effective, configured PricingValues, cfg ModelSaleConfig, now time.Time) (ModelSaleQuote, PricingValues, error) {
	if cfg.Basis != "official" {
		q := quoteModelSale(tx, name, effective, (1-cfg.ModelFactor(name))*100, cfg.Policy, now)
		target, e := saleDiscountPricing(name, configured, effective, cfg.ModelFactor(name))
		return q, target, e
	}
	q := quoteModelSale(tx, name, effective, 0, cfg.Policy, now)
	q.Basis = "official"
	q.CurrentMultiplier = 0
	q.MaximumCurrentMultiplier = 0
	q.MinimumMultiplier = 0
	q.TargetMultiplier = 0
	fail := func(e error) (ModelSaleQuote, PricingValues, error) {
		q.Eligible = false
		q.Reason = e.Error()
		return q, nil, e
	}
	var leaves []saleLeaf
	var err error
	if expr, ok := effective["billing_setting.billing_expr"].(string); ok && effective["billing_setting.billing_mode"] == "tiered_expr" {
		leaves, err = saleLeaves(expr)
	} else if v, ok := effective["ModelPrice"].(float64); ok && v > 0 {
		leaves = []saleLeaf{{Label: "按次", Min: 0, Max: math.MaxInt64, Request: true, Prices: map[string]float64{"request": v}}}
	} else {
		err = errors.New("计费方式需要人工核验")
	}
	if err != nil {
		return fail(err)
	}
	cash, _, err := saleCashCostBasis(cfg.Policy)
	if err != nil {
		return fail(err)
	}
	ratio, err := saleMinimumGroupRatio(tx, name)
	if err != nil {
		return fail(err)
	}
	hasCost := q.Eligible || strings.HasPrefix(q.Reason, "利润空间不足")
	prices := map[string]map[string]float64{}
	official := map[string]map[string]float64{}
	isRequest := len(leaves) == 1 && leaves[0].Request
	fx := cfg.Policy.CNYPerUSD
	if !isRequest {
		fx, err = saleOfficialFX(tx, fx, now)
		if err != nil {
			return fail(err)
		}
		q.OfficialFX = fx
	}
	if isRequest {
		q.Basis = "request"
		q.CurrentRequestCNY = leaves[0].Prices["request"] * ratio * cash
		if hasCost {
			for _, l := range q.Lines {
				q.MinimumRequestCNY = max(q.MinimumRequestCNY, l.FloorCNY)
			}
			q.MinimumRequestCNY = math.Ceil(q.MinimumRequestCNY*1e6) / 1e6
		}
		q.TargetRequestCNY = q.CurrentRequestCNY
		if v, ok := cfg.RequestPrices[name]; ok {
			q.TargetRequestCNY = v
		}
		if q.TargetRequestCNY <= 0 || math.IsNaN(q.TargetRequestCNY) || math.IsInf(q.TargetRequestCNY, 0) {
			return fail(errors.New("填写有效的人民币每次价格"))
		}
		if q.TargetRequestCNY > q.CurrentRequestCNY+1e-9 {
			return fail(errors.New("优惠每次价格不能高于当前价格"))
		}
		prices[leaves[0].Label] = map[string]float64{"request": q.TargetRequestCNY / (ratio * cash)}
	} else {
		minCurrent := math.Inf(1)
		for _, leaf := range leaves {
			if leaf.Request {
				return fail(errors.New("混合按次与 Token 计费须人工核验"))
			}
			ref, source, e := saleOfficialPrices(name, leaf, fx)
			if e != nil {
				return fail(e)
			}
			q.OfficialSource = source
			official[leaf.Label] = ref
			for k, v := range leaf.Prices {
				if v == 0 {
					continue
				}
				o, ok := ref[k]
				if !ok || o <= 0 {
					return fail(fmt.Errorf("官方未公布 %s 的可比价格", k))
				}
				f := v * ratio * cash / o
				minCurrent = min(minCurrent, f)
				q.MaximumCurrentMultiplier = max(q.MaximumCurrentMultiplier, f)
			}
		}
		q.CurrentMultiplier = minCurrent
		q.OfficialPrices = official
		q.TargetMultiplier = minCurrent
		if v, ok := cfg.Multipliers[name]; ok {
			q.TargetMultiplier = v
		}
		if q.TargetMultiplier <= 0 || math.IsNaN(q.TargetMultiplier) || math.IsInf(q.TargetMultiplier, 0) {
			return fail(errors.New("填写有效的官方价格倍率"))
		}
		if q.TargetMultiplier > minCurrent+1e-6 {
			return fail(errors.New("目标官方倍率高于当前分项倍率，会导致涨价"))
		}
		for _, leaf := range leaves {
			prices[leaf.Label] = map[string]float64{}
			for k, v := range leaf.Prices {
				if v == 0 {
					prices[leaf.Label][k] = 0
				} else {
					prices[leaf.Label][k] = official[leaf.Label][k] * q.TargetMultiplier / (ratio * cash)
				}
			}
		}
		for i, l := range q.Lines {
			o := official[l.Tier][l.Component]
			q.Lines[i].OfficialCNY = o
			if hasCost && o > 0 {
				q.MinimumMultiplier = max(q.MinimumMultiplier, l.FloorCNY/o)
			}
		}
		if q.MinimumMultiplier > 0 {
			q.MinimumMultiplier = math.Ceil(q.MinimumMultiplier*1e6) / 1e6
		}
	}
	if !hasCost {
		return q, nil, errors.New(q.Reason)
	}
	target, err := saleAbsolutePricing(name, configured, effective, prices)
	if err != nil {
		return fail(err)
	}
	targetEffective := PricingValues{}
	for k, v := range effective {
		targetEffective[k] = v
	}
	for k, v := range target {
		targetEffective[k] = v
	}
	safe := quoteModelSale(tx, name, targetEffective, 0, cfg.Policy, now)
	q.Eligible = safe.Eligible
	q.Margin = safe.Margin
	q.Reason = safe.Reason
	for i, l := range q.Lines {
		q.Lines[i].TargetCNY = prices[l.Tier][l.Component] * ratio * cash
	}
	if !q.Eligible {
		if isRequest {
			q.Reason = fmt.Sprintf("低于安全每次价格 ¥%.6f/次；已计成本缓冲和收入预留", q.MinimumRequestCNY)
		} else {
			q.Reason = fmt.Sprintf("低于安全官方倍率 %.6f×；已计成本缓冲和收入预留", q.MinimumMultiplier)
		}
	}
	return q, target, nil
}

func ModelSaleOfficialQuotes(cfg ModelSaleConfig, now time.Time) ([]ModelSaleQuote, error) {
	if err := cfg.Policy.Validate(); err != nil {
		return nil, err
	}
	values, _, _, err := readModelPricingMaps(DB)
	if err != nil {
		return nil, err
	}
	quotes := []ModelSaleQuote{}
	for _, p := range GetPricing() {
		q, _, _ := quoteModelSaleConfig(DB, p.ModelName, effectiveModelPricing(values, p.ModelName), modelPricingValues(values, p.ModelName), cfg, now)
		quotes = append(quotes, q)
	}
	sort.Slice(quotes, func(i, j int) bool {
		if quotes[i].Eligible != quotes[j].Eligible {
			return quotes[i].Eligible
		}
		return quotes[i].Model < quotes[j].Model
	})
	return quotes, nil
}
