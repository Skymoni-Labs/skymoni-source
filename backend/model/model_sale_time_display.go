package model

import (
	"math"
	"time"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
)

// Display data contains public sale prices only, never procurement quotations.
// The exact billing condition is retained, so holidays cannot be lost in prose.
type ModelSaleTimePrices struct {
	Model        string                   `json:"model"`
	Expression   string                   `json:"billing_expr"`
	Currency     string                   `json:"currency"`
	ScheduleText string                   `json:"schedule_text,omitempty"`
	Tiers        []ModelSaleTimePriceTier `json:"tiers"`
}
type ModelSaleTimePriceTier struct {
	Label              string             `json:"label"`
	Original           map[string]float64 `json:"original"`
	Target             map[string]float64 `json:"target"`
	Official           map[string]float64 `json:"official"`
	OriginalMultiplier float64            `json:"original_multiplier"`
	TargetMultiplier   float64            `json:"target_multiplier"`
}

func saleTimePriceTiers(name string, effective PricingValues, multiplier, cash, group, fx float64) *ModelSaleTimePrices {
	if effective["billing_setting.billing_mode"] != "tiered_expr" || multiplier <= 0 || fx <= 0 {
		return nil
	}
	expression, ok := effective["billing_setting.billing_expr"].(string)
	if !ok {
		return nil
	}
	_, body := billingexpr.ParseExprVersion(expression)
	tree, err := parser.Parse(body)
	if err != nil {
		return nil
	}
	condition, ok := tree.Node.(*ast.ConditionalNode)
	if !ok || !saleTimeCondition(condition.Cond) {
		return nil
	}
	leaves, err := saleLeaves(expression)
	if err != nil || len(leaves) != 2 || leaves[0].Label != "peak" || leaves[1].Label != "off_peak" {
		return nil
	}
	result := &ModelSaleTimePrices{Model: name, Expression: expression, Currency: "USD", ScheduleText: salePeakScheduleText(condition.Cond)}
	// Ordinary time comes first; both tiers use their own official reference.
	for _, leaf := range []saleLeaf{leaves[1], leaves[0]} {
		ref, _, err := saleOfficialPrices(name, leaf, fx)
		if err != nil {
			return nil
		}
		row := ModelSaleTimePriceTier{Label: leaf.Label, Original: map[string]float64{}, Target: map[string]float64{}, Official: map[string]float64{}, TargetMultiplier: multiplier}
		for key, price := range leaf.Prices {
			reference, exists := ref[key]
			if !exists || reference <= 0 || math.IsNaN(reference) || math.IsInf(reference, 0) {
				return nil
			}
			row.Original[key] = price * cash * group / fx
			row.Official[key] = reference / fx
			row.Target[key] = reference * multiplier / fx
		}
		row.OriginalMultiplier = row.Original["p"] / row.Official["p"]
		result.Tiers = append(result.Tiers, row)
	}
	return result
}

func ModelSaleTimePriceDisplay(sale ModelSale, now time.Time) []ModelSaleTimePrices {
	if sale.Config.Basis != "official" || len(sale.Config.Models) == 0 {
		return nil
	}
	values, _, _, err := readModelPricingMaps(DB)
	if err != nil {
		return nil
	}
	cash, _, err := saleCashCostBasis(sale.Config.Policy)
	if err != nil {
		return nil
	}
	fx, err := saleOfficialFX(DB, sale.Config.Policy.CNYPerUSD, now)
	if err != nil {
		return nil
	}
	result := []ModelSaleTimePrices{}
	for _, name := range sale.Config.Models {
		effective := effectiveModelPricing(values, name)
		// Once active, the captured original remains the comparison price.
		if sale.Status == "active" || sale.Status == "scheduled" {
			for _, plan := range sale.Plan {
				if plan.Name == name {
					replaceModelPricing(values, name, plan.Original)
					effective = effectiveModelPricing(values, name)
					break
				}
			}
		}
		group, err := saleMinimumGroupRatio(DB, name)
		if err != nil {
			continue
		}
		if display := saleTimePriceTiers(name, effective, sale.Config.ModelFactor(name), cash, group, fx); display != nil {
			result = append(result, *display)
		}
	}
	return result
}

func salePeakScheduleText(condition ast.Node) string {
	// Match the configured weekday/hour AST, rather than a model-name assumption.
	expected, _ := parser.Parse(`weekday("Asia/Shanghai") >= 1 && weekday("Asia/Shanghai") <= 5 && ((hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12) || (hour("Asia/Shanghai") >= 14 && hour("Asia/Shanghai") < 18))`)
	base := condition
	excluded := false
	if binary, ok := condition.(*ast.BinaryNode); ok && binary.Operator == "&&" {
		if unary, ok := binary.Right.(*ast.UnaryNode); ok && unary.Operator == "!" {
			base = binary.Left
			excluded = true
		}
	}
	if base.String() != expected.Node.String() {
		daily, _ := parser.Parse(`(hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12) || (hour("Asia/Shanghai") >= 14 && hour("Asia/Shanghai") < 18)`)
		if base.String() == daily.Node.String() && !excluded {
			return "北京时间每天 09:00–12:00、14:00–18:00 为高峰，其余为普通时段。"
		}
		return ""
	}
	note := "北京时间周一至周五 09:00–12:00、14:00–18:00 为高峰，其余为普通时段。"
	if excluded {
		note += "已配置的节假日例外按普通时段计费，具体日期见活动页。"
	}
	return note
}
