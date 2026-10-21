package model

import (
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var ErrModelSaleConflict = errors.New("活动或模型价格已变化，请刷新后再操作")
var errModelSaleNoop = errors.New("model sale unchanged")

type ModelSaleConfig struct {
	Basis         string             `json:"pricing_basis,omitempty"`
	RequestPrices map[string]float64 `json:"request_prices_cny,omitempty"`
	Models        []string           `json:"models"`
	Multipliers   map[string]float64 `json:"model_multipliers,omitempty"`
	Discount      float64            `json:"discount_percent"`
	Policy        ModelSalePolicy    `json:"policy"`
	CountdownMode string             `json:"countdown_mode"`
}

// ModelFactor is an official-price ratio for new templates, and a captured
// original-price factor for legacy templates. Request targets use RequestPrices.
func (c ModelSaleConfig) ModelFactor(name string) float64 {
	if c.Multipliers != nil {
		if v, ok := c.Multipliers[name]; ok {
			return v
		}
		return 1
	}
	return 1 - c.Discount/100
}

type ModelSalePlan struct {
	Name            string        `json:"name"`
	Original        PricingValues `json:"original"`
	Target          PricingValues `json:"target"`
	OriginalSource  string        `json:"original_source"`
	OriginalVersion string        `json:"original_version"`
	AppliedVersion  string        `json:"applied_version"`
}
type ModelSale struct {
	TimePrices          []ModelSaleTimePrices `json:"time_prices,omitempty" gorm:"-"`
	ID                  string                `json:"id" gorm:"primaryKey;size:32"`
	Title               string                `json:"title" gorm:"size:120"`
	Status              string                `json:"status" gorm:"size:24;index"`
	StartAt             int64                 `json:"start_at" gorm:"bigint"`
	EndAt               int64                 `json:"end_at" gorm:"bigint"`
	Revision            int                   `json:"revision"`
	Config              ModelSaleConfig       `json:"config" gorm:"serializer:json;type:text"`
	Plan                []ModelSalePlan       `json:"-" gorm:"serializer:json;type:text"`
	Message             string                `json:"message" gorm:"type:text"`
	CreatedAt           int64                 `json:"created_at" gorm:"bigint"`
	UpdatedAt           int64                 `json:"updated_at" gorm:"bigint"`
	AnnouncementManaged bool                  `json:"announcement_managed" gorm:"not null;default:false"`
	AnnouncementEnabled bool                  `json:"announcement_enabled" gorm:"not null;default:false"`
	AnnouncementAt      int64                 `json:"announcement_at" gorm:"bigint;not null;default:0"`
	AnnouncementPlan    []ModelSalePlan       `json:"-" gorm:"serializer:json;type:text"`
}
type ModelSaleInput struct {
	Title    string          `json:"title"`
	StartAt  int64           `json:"start_at"`
	EndAt    int64           `json:"end_at"`
	Revision int             `json:"revision"`
	Config   ModelSaleConfig `json:"config"`
}

func (in *ModelSaleInput) Validate(now time.Time) error {
	in.Title = strings.TrimSpace(in.Title)
	if in.Title == "" || len([]rune(in.Title)) > 100 || len(in.Config.Models) < 1 || len(in.Config.Models) > 200 {
		return errors.New("填写活动标题，并选择 1–200 个模型")
	}
	if in.Config.Basis != "" && in.Config.Basis != "official" {
		return errors.New("价格基准无效")
	}
	if in.Config.Basis != "official" && in.Config.Multipliers == nil && (in.Config.Discount <= 0 || in.Config.Discount > 50 || math.IsNaN(in.Config.Discount) || math.IsInf(in.Config.Discount, 0)) {
		return errors.New("降幅必须大于 0 且不超过 50%")
	}
	if in.EndAt <= now.Unix() || in.EndAt-in.StartAt < 600 || in.EndAt-in.StartAt > 7*86400 || in.StartAt > now.Unix()+30*86400 {
		return errors.New("活动时长须为 10 分钟至 7 天，开始时间不能超过 30 天")
	}
	if in.StartAt < now.Unix()-60 {
		return errors.New("开始时间已过，请调整为现在或未来时间")
	}
	if in.Config.CountdownMode != "end" && in.Config.CountdownMode != "start" && in.Config.CountdownMode != "auto" {
		return errors.New("倒计时模式无效")
	}
	seen := map[string]bool{}
	for _, name := range in.Config.Models {
		if strings.TrimSpace(name) != name || name == "" || len(name) > 200 || seen[name] {
			return errors.New("模型名称为空、重复或格式无效")
		}
		seen[name] = true
		if in.Config.Basis == "official" {
			v, ok := in.Config.Multipliers[name]
			p, request := in.Config.RequestPrices[name]
			if ok == request || (ok && (v <= 0 || v > 100 || math.IsNaN(v) || math.IsInf(v, 0))) || (request && (p <= 0 || math.IsNaN(p) || math.IsInf(p, 0))) {
				return errors.New("为每个模型填写官方倍率，或人民币每次价格")
			}
		} else if in.Config.Multipliers != nil {
			v, ok := in.Config.Multipliers[name]
			if !ok || v <= 0 || v > 1 || math.IsNaN(v) || math.IsInf(v, 0) {
				return errors.New("每个选中模型须填写大于 0、不超过 1 的价格倍率（当前原价 = 1）")
			}
		}
	}
	return in.Config.Policy.Validate()
}
func CreateModelSale(in ModelSaleInput, now time.Time) (*ModelSale, error) {
	if err := in.Validate(now); err != nil {
		return nil, err
	}
	sale := &ModelSale{ID: strings.ReplaceAll(uuid.NewString(), "-", ""), Title: in.Title, Status: "draft", StartAt: in.StartAt, EndAt: in.EndAt, Revision: 1, Config: in.Config, CreatedAt: now.Unix(), UpdatedAt: now.Unix(), Plan: []ModelSalePlan{}, Message: "模板未启用；当前计费价格保持不变"}
	return sale, DB.Create(sale).Error
}
func UpdateModelSale(id string, in ModelSaleInput, now time.Time) (*ModelSale, error) {
	if err := in.Validate(now); err != nil {
		return nil, err
	}
	var sale ModelSale
	err := DB.Transaction(func(tx *gorm.DB) error {
		if e := lockForUpdate(tx).First(&sale, "id = ?", id).Error; e != nil {
			return e
		}
		if sale.Revision != in.Revision || (sale.Status != "draft" && sale.Status != "paused") {
			return ErrModelSaleConflict
		}
		sale.Title = in.Title
		sale.Config = in.Config
		sale.StartAt = in.StartAt
		sale.EndAt = in.EndAt
		sale.Revision++
		sale.UpdatedAt = now.Unix()
		sale.Plan = []ModelSalePlan{}
		// Editing a reviewed template cancels its announcement too. Publishing an
		// old captured price after an edit would make an unreviewed promise.
		sale.AnnouncementEnabled = false
		sale.AnnouncementPlan = []ModelSalePlan{}
		sale.Message = "模板已保存，尚未启用"
		return tx.Save(&sale).Error
	})
	return &sale, err
}
func saleDiscountPricing(name string, configured, effective PricingValues, factor float64) (PricingValues, error) {
	raw, err := common.Marshal(configured)
	if err != nil {
		return nil, err
	}
	target := PricingValues{}
	if err = common.Unmarshal(raw, &target); err != nil {
		return nil, err
	}
	if expression, ok := effective["billing_setting.billing_expr"].(string); ok && effective["billing_setting.billing_mode"] == "tiered_expr" {
		version, body := billingexpr.ParseExprVersion(expression)
		if version != 1 {
			return nil, errors.New("不支持的计费版本")
		}
		tree, e := parser.Parse(body)
		if e != nil {
			return nil, e
		}
		// Scale only numeric price leaves. Thresholds and fixed()/tier() semantics
		// remain intact, including the billing-unit trace used by settlement.
		var scale func(ast.Node) error
		scale = func(n ast.Node) error {
			switch v := n.(type) {
			case *ast.ConditionalNode:
				if e := scale(v.Exp1); e != nil {
					return e
				}
				return scale(v.Exp2)
			case *ast.CallNode:
				id, ok := v.Callee.(*ast.IdentifierNode)
				if !ok || id.Value != "tier" || len(v.Arguments) != 2 {
					return errors.New("计费档格式不支持")
				}
				if fixed, ok := v.Arguments[1].(*ast.CallNode); ok {
					value, ok := saleNumber(fixed.Arguments[0])
					if !ok {
						return errors.New("按次价格无效")
					}
					fixed.Arguments[0] = &ast.FloatNode{Value: value * factor}
					return nil
				}
				var prices func(*ast.Node) error
				prices = func(node *ast.Node) error {
					b, ok := (*node).(*ast.BinaryNode)
					if !ok {
						return errors.New("分项表达式不支持")
					}
					if b.Operator == "+" {
						if e := prices(&b.Left); e != nil {
							return e
						}
						return prices(&b.Right)
					}
					if b.Operator == "*" {
						if value, ok := saleNumber(b.Right); ok {
							b.Right = &ast.FloatNode{Value: value * factor}
							return nil
						}
						if value, ok := saleNumber(b.Left); ok {
							b.Left = &ast.FloatNode{Value: value * factor}
							return nil
						}
					}
					return errors.New("分项表达式不支持")
				}
				return prices(&v.Arguments[1])
			}
			return errors.New("计费表达式不支持")
		}
		if err = scale(tree.Node); err != nil {
			return nil, err
		}
		target["billing_setting.billing_mode"] = "tiered_expr"
		target["billing_setting.billing_expr"] = tree.Node.String()
	} else if price, ok := effective["ModelPrice"].(float64); ok {
		target["ModelPrice"] = price * factor
	} else {
		return nil, errors.New("计费方式未核验")
	}
	if err = validateModelPricing(name, target, configured); err != nil {
		return nil, err
	}
	return target, nil
}
func EnableModelSale(id string, revision int, now time.Time) (*ModelSale, error) {
	var sale ModelSale
	err := mutateModelPricingOptions(func(tx *gorm.DB, values map[string]map[string]any) error {
		if e := lockForUpdate(tx).First(&sale, "id = ?", id).Error; e != nil {
			return e
		}
		if sale.Revision != revision || (sale.Status != "draft" && sale.Status != "paused") {
			return ErrModelSaleConflict
		}
		in := ModelSaleInput{Title: sale.Title, StartAt: sale.StartAt, EndAt: sale.EndAt, Config: sale.Config}
		if e := in.Validate(now); e != nil {
			return e
		}
		var others []ModelSale
		if e := tx.Where("status IN ?", []string{"scheduled", "active"}).Find(&others).Error; e != nil {
			return e
		}
		for _, other := range others {
			if sale.StartAt < other.EndAt && sale.EndAt > other.StartAt {
				for _, name := range sale.Config.Models {
					if slices.Contains(other.Config.Models, name) {
						return fmt.Errorf("模型 %s 与另一个活动时间重叠", name)
					}
				}
			}
		}
		plan := []ModelSalePlan{}
		for _, name := range sale.Config.Models {
			effective := effectiveModelPricing(values, name)
			quote, target, e := quoteModelSaleConfig(tx, name, effective, modelPricingValues(values, name), sale.Config, now)
			if !quote.Eligible {
				return fmt.Errorf("%s：%s", name, quote.Reason)
			}
			original := modelPricingValues(values, name)
			if e != nil {
				return e
			}
			plan = append(plan, ModelSalePlan{Name: name, Original: original, Target: target, OriginalSource: pricingSource(values, name), OriginalVersion: pricingEntryVersion(values, name)})
		}
		sale.Plan = plan
		sale.Status = "scheduled"
		sale.Message = "已启用；到时重新核验成本后执行降价"
		sale.Revision++
		sale.UpdatedAt = now.Unix()
		return tx.Save(&sale).Error
	})
	return &sale, err
}
func restoreModelSale(values map[string]map[string]any, sale *ModelSale, status, message string) {
	conflicts := []string{}
	for _, p := range sale.Plan {
		if pricingEntryVersion(values, p.Name) != p.AppliedVersion {
			conflicts = append(conflicts, p.Name)
			continue
		}
		replaceModelPricing(values, p.Name, p.Original)
		if p.OriginalSource == ModelPricingSourceManual {
			values[ModelPricingSourceOption][p.Name] = ModelPricingSourceManual
		} else {
			delete(values[ModelPricingSourceOption], p.Name)
		}
	}
	sale.Status = status
	sale.Message = message
	if len(conflicts) > 0 {
		sale.Status = "conflict"
		sale.Message = message + "；以下模型已被另行改价，保留人工改动：" + strings.Join(conflicts, ", ")
	}
	sale.Plan = []ModelSalePlan{}
}
func DisableModelSale(id string, revision int, now time.Time) (*ModelSale, error) {
	var sale ModelSale
	err := mutateModelPricingOptions(func(tx *gorm.DB, values map[string]map[string]any) error {
		if e := lockForUpdate(tx).First(&sale, "id = ?", id).Error; e != nil {
			return e
		}
		if sale.Revision != revision {
			return ErrModelSaleConflict
		}
		if sale.Status == "active" {
			restoreModelSale(values, &sale, "paused", "活动已停用，已恢复仍由本活动管理的原价")
		} else if sale.Status == "scheduled" {
			sale.Status = "paused"
			sale.Plan = []ModelSalePlan{}
			sale.Message = "定时活动已停用，价格未变"
		} else {
			return errors.New("只有待开始或进行中的活动可以停用")
		}
		sale.AnnouncementEnabled = false
		sale.AnnouncementPlan = []ModelSalePlan{}
		sale.Revision++
		sale.UpdatedAt = now.Unix()
		return tx.Save(&sale).Error
	})
	return &sale, err
}
func TickModelSale(id string, now time.Time) error {
	err := mutateModelPricingOptions(func(tx *gorm.DB, values map[string]map[string]any) error {
		var sale ModelSale
		if e := lockForUpdate(tx).First(&sale, "id = ?", id).Error; e != nil {
			return e
		}
		if sale.Status != "scheduled" && sale.Status != "active" {
			return errModelSaleNoop
		}
		changed := false
		if sale.Status == "scheduled" && now.Unix() >= sale.EndAt {
			sale.Status = "ended"
			sale.Message = "活动时间已结束，未执行降价"
			sale.Plan = []ModelSalePlan{}
			changed = true
		} else if sale.Status == "scheduled" && now.Unix() >= sale.StartAt {
			reason := ""
			for _, p := range sale.Plan {
				if pricingEntryVersion(values, p.Name) != p.OriginalVersion {
					reason = p.Name + " 已改价，未执行降价"
					break
				}
				// Recheck the captured target itself. Later FX/reference changes must
				// never change a reviewed scheduled price.
				targetEffective := effectiveModelPricing(values, p.Name)
				for k, v := range p.Target {
					targetEffective[k] = v
				}
				q := quoteModelSale(tx, p.Name, targetEffective, 0, sale.Config.Policy, now)
				if !q.Eligible {
					reason = p.Name + "：" + q.Reason
					break
				}
			}
			if reason != "" {
				sale.Status = "blocked"
				sale.Message = reason
				sale.Plan = []ModelSalePlan{}
			} else {
				for i, p := range sale.Plan {
					replaceModelPricing(values, p.Name, p.Target)
					values[ModelPricingSourceOption][p.Name] = ModelPricingSourceManual
					sale.Plan[i].AppliedVersion = pricingEntryVersion(values, p.Name)
				}
				sale.Status = "active"
				sale.Message = "降价已生效；结束时自动恢复原价"
			}
			changed = true
		} else if sale.Status == "active" {
			reason := ""
			for _, p := range sale.Plan {
				if pricingEntryVersion(values, p.Name) != p.AppliedVersion {
					reason = "模型已被另行改价，提前结束本活动"
					break
				}
				q := quoteModelSale(tx, p.Name, effectiveModelPricing(values, p.Name), 0, sale.Config.Policy, now)
				if !q.Eligible {
					reason = "保本检查未通过，提前结束：" + p.Name + " " + q.Reason
					break
				}
			}
			if now.Unix() >= sale.EndAt {
				restoreModelSale(values, &sale, "ended", "活动已结束，原价已恢复")
				changed = true
			} else if reason != "" {
				restoreModelSale(values, &sale, "blocked", reason)
				changed = true
			}
		}
		if changed {
			sale.Revision++
			sale.UpdatedAt = now.Unix()
			return tx.Save(&sale).Error
		}
		return errModelSaleNoop
	})
	if errors.Is(err, errModelSaleNoop) {
		return nil
	}
	return err
}
