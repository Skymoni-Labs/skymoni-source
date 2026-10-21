package model

import (
	"gorm.io/gorm"
	"time"
)

// Protection is read in the same option transaction as every automatic write.
// A scheduled activity is protected too, so upstream sync cannot invalidate its
// captured original price while it waits to start. Cost collection still runs.
func modelSaleProtectedModels(tx *gorm.DB) (map[string]bool, error) {
	protected := map[string]bool{}
	// Some legacy model tests initialize only options; production always migrates
	// this table before a pricing writer or worker starts.
	if !tx.Migrator().HasTable(&ModelSale{}) {
		return protected, nil
	}
	var sales []ModelSale
	if err := tx.Where("status IN ?", []string{"scheduled", "active"}).Find(&sales).Error; err != nil {
		return nil, err
	}
	for _, sale := range sales {
		for _, plan := range sale.Plan {
			protected[plan.Name] = true
		}
	}
	return protected, nil
}

type ModelSalePromotion struct {
	Basis      string        `json:"pricing_basis,omitempty"`
	RequestCNY float64       `json:"request_price_cny,omitempty"`
	ID         string        `json:"id"`
	Title      string        `json:"title"`
	StartAt    int64         `json:"start_at"`
	EndAt      int64         `json:"end_at"`
	Discount   float64       `json:"discount_percent"`
	Multiplier float64       `json:"multiplier"`
	Original   PricingValues `json:"original"`
}
type PublicSaleSummary struct {
	ID               string             `json:"id"`
	Title            string             `json:"title"`
	Status           string             `json:"status"`
	StartAt          int64              `json:"start_at"`
	EndAt            int64              `json:"end_at"`
	CountdownMode    string             `json:"countdown_mode"`
	Models           []string           `json:"models"`
	Discount         float64            `json:"discount_percent"`
	Multipliers      map[string]float64 `json:"model_multipliers,omitempty"`
	AnnouncementOnly bool               `json:"announcement_only"`
	AnnouncementAt   int64              `json:"announcement_at,omitempty"`
}

// Public announcements require an intact captured plan. If an administrator
// changes a price, hide the offer immediately instead of advertising a stale
// discount until the next worker tick. Private costs/policy are never returned.
func CurrentModelSaleOffers(now time.Time) ([]PublicSaleSummary, map[string]*ModelSalePromotion, error) {
	offers := []PublicSaleSummary{}
	promotions := map[string]*ModelSalePromotion{}
	var sales []ModelSale
	if err := DB.Where("end_at > ? AND (status IN ? OR (status IN ? AND announcement_enabled = ? AND announcement_at <= ?))", now.Unix(), []string{"scheduled", "active"}, []string{"draft", "paused"}, true, now.Unix()).Order("start_at ASC").Find(&sales).Error; err != nil {
		return nil, nil, err
	}
	if len(sales) == 0 {
		return offers, promotions, nil
	}
	values, _, _, err := readModelPricingMaps(DB)
	if err != nil {
		return nil, nil, err
	}
	for _, sale := range sales {
		if ModelSalePublicationState(sale, now) != "published" {
			continue
		}
		announcementOnly := sale.Status == "draft" || sale.Status == "paused"
		plan := sale.Plan
		if announcementOnly {
			plan = sale.AnnouncementPlan
		}
		if !modelSalePlanPublishable(DB, values, sale, plan, now) {
			continue
		}
		status := sale.Status
		if announcementOnly {
			status = "announced"
		}
		offers = append(offers, PublicSaleSummary{ID: sale.ID, Title: sale.Title, Status: status, StartAt: sale.StartAt, EndAt: sale.EndAt, CountdownMode: sale.Config.CountdownMode, Models: sale.Config.Models, Discount: sale.Config.Discount, Multipliers: sale.Config.Multipliers, AnnouncementOnly: announcementOnly, AnnouncementAt: sale.AnnouncementAt})
		if sale.Status != "active" || now.Unix() < sale.StartAt {
			continue
		}
		for _, p := range sale.Plan {
			// Resolve inherited values exactly like settlement; do not derive original
			// prices by dividing rounded public promotional prices by the discount.
			current := modelPricingValues(values, p.Name)
			replaceModelPricing(values, p.Name, p.Original)
			original := effectiveModelPricing(values, p.Name)
			replaceModelPricing(values, p.Name, current)
			promotions[p.Name] = &ModelSalePromotion{Basis: sale.Config.Basis, RequestCNY: sale.Config.RequestPrices[p.Name], ID: sale.ID, Title: sale.Title, StartAt: sale.StartAt, EndAt: sale.EndAt, Discount: (1 - sale.Config.ModelFactor(p.Name)) * 100, Multiplier: sale.Config.ModelFactor(p.Name), Original: original}
		}
	}
	return offers, promotions, nil
}

func CheckSavedModelSale(id string, now time.Time) (*ModelSale, []ModelSaleQuote, error) {
	var sale ModelSale
	if err := DB.First(&sale, "id = ?", id).Error; err != nil {
		return nil, nil, err
	}
	values, _, _, err := readModelPricingMaps(DB)
	if err != nil {
		return nil, nil, err
	}
	quotes := []ModelSaleQuote{}
	for _, name := range sale.Config.Models {
		if sale.Status == "active" {
			for _, p := range sale.Plan {
				if p.Name == name {
					replaceModelPricing(values, name, p.Original)
					break
				}
			}
		}
		q, _, _ := quoteModelSaleConfig(DB, name, effectiveModelPricing(values, name), modelPricingValues(values, name), sale.Config, now)
		if sale.Status == "active" {
			for _, p := range sale.Plan {
				if p.Name == name {
					actual := effectiveModelPricing(values, name)
					for k, v := range p.Target {
						actual[k] = v
					}
					guard := quoteModelSale(DB, name, actual, 0, sale.Config.Policy, now)
					q.Eligible = guard.Eligible
					q.Margin = guard.Margin
					if !guard.Eligible {
						q.Reason = guard.Reason
					}
					break
				}
			}
		}
		quotes = append(quotes, q)
	}
	return &sale, quotes, nil
}
