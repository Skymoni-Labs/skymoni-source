package model

import (
	"errors"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
)

// A verified supplier schedule is part of the cost snapshot. It must match the
// downstream condition exactly before ordinary and peak costs can be separated.
// Legacy cost tiers without a schedule still use the worst price in every leaf.
type ModelSaleCostTimePricing struct {
	Timezone     string                    `json:"timezone"`
	WeekdaysOnly bool                      `json:"weekdays_only"`
	Periods      []ModelSaleCostTimePeriod `json:"periods"`
}
type ModelSaleCostTimePeriod struct {
	Start      string  `json:"start_time"`
	End        string  `json:"end_time"`
	Multiplier float64 `json:"multiplier"`
}

func (p ModelSaleCostTimePricing) Condition() (string, float64, error) {
	if p.Timezone != "Asia/Shanghai" || len(p.Periods) != 2 {
		return "", 0, errors.New("上游分时成本规则未核验")
	}
	periods := map[string]float64{}
	for _, v := range p.Periods {
		start, end := strings.TrimSuffix(v.Start, ":00"), strings.TrimSuffix(v.End, ":00")
		// Accept upstream hour and hour:minute representations without ambiguity.
		if len(start) == 2 {
			start += ":00"
		}
		if len(end) == 2 {
			end += ":00"
		}
		key := start + "/" + end
		if (key != "09:00/12:00" && key != "14:00/18:00") || v.Multiplier < 1 || math.IsNaN(v.Multiplier) || math.IsInf(v.Multiplier, 0) {
			return "", 0, errors.New("上游分时成本规则已变化，请重新核验")
		}
		if _, ok := periods[key]; ok {
			return "", 0, errors.New("上游分时成本规则重复")
		}
		periods[key] = v.Multiplier
	}
	peak := periods["09:00/12:00"]
	if peak != periods["14:00/18:00"] {
		return "", 0, errors.New("上游高峰成本倍率不一致")
	}
	condition := `(hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12) || (hour("Asia/Shanghai") >= 14 && hour("Asia/Shanghai") < 18)`
	if p.WeekdaysOnly {
		condition = `weekday("Asia/Shanghai") >= 1 && weekday("Asia/Shanghai") <= 5 && (` + condition + `)`
	}
	return condition, peak, nil
}

func saleCostTimeFactor(c saleCost, effective PricingValues, leaf saleLeaf) (float64, error) {
	if c.TimePricing == nil {
		return 1, nil
	}
	condition, peak, err := c.TimePricing.Condition()
	if err != nil {
		return 0, err
	}
	expression, ok := effective["billing_setting.billing_expr"].(string)
	if !ok || effective["billing_setting.billing_mode"] != "tiered_expr" {
		return 0, errors.New("本站计费未对齐上游分时成本")
	}
	_, body := billingexpr.ParseExprVersion(expression)
	tree, err := parser.Parse(body)
	if err != nil {
		return 0, err
	}
	expected, err := parser.Parse(condition)
	if err != nil {
		return 0, err
	}
	root, ok := tree.Node.(*ast.ConditionalNode)
	if !ok || root.Cond.String() != expected.Node.String() {
		return 0, errors.New("本站高低峰时段与上游不一致，暂不降价")
	}
	leaves, err := saleLeaves(expression)
	if err != nil || len(leaves) != 2 || leaves[0].Label != "peak" || leaves[1].Label != "off_peak" {
		return 0, errors.New("本站分时计费档未核验")
	}
	if leaf.Label == "peak" {
		return peak, nil
	}
	if leaf.Label == "off_peak" {
		return 1, nil
	}
	return 0, errors.New("本站分时计费档未核验")
}
