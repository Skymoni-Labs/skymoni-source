package model

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Publication is independent of the billing lifecycle. Evaluating the saved
// timestamp at read time survives restarts and never writes pricing options.
func ModelSalePublicationState(sale ModelSale, now time.Time) string {
	if sale.EndAt <= now.Unix() || (sale.Status != "draft" && sale.Status != "paused" && sale.Status != "scheduled" && sale.Status != "active") {
		return "ended"
	}
	if !sale.AnnouncementManaged {
		if sale.Status == "active" || sale.Status == "scheduled" {
			return "published"
		}
		return "unpublished"
	}
	if !sale.AnnouncementEnabled {
		return "unpublished"
	}
	if now.Unix() < sale.AnnouncementAt {
		return "scheduled"
	}
	return "published"
}

func ScheduleModelSaleAnnouncement(id string, revision int, publishAt int64, now time.Time) (*ModelSale, error) {
	var sale ModelSale
	err := DB.Transaction(func(tx *gorm.DB) error {
		if e := lockForUpdate(tx).First(&sale, "id = ?", id).Error; e != nil {
			return e
		}
		if sale.Revision != revision {
			return ErrModelSaleConflict
		}
		if sale.Status != "draft" && sale.Status != "paused" && sale.Status != "scheduled" && sale.Status != "active" {
			return errors.New("已结束或被拦截的活动不能发布公告")
		}
		if publishAt < now.Unix()-60 || publishAt > now.Unix()+30*86400 || publishAt >= sale.EndAt {
			return errors.New("公告发布时间须在当前时间至未来 30 天内，且早于活动结束时间")
		}
		if sale.EndAt <= now.Unix() || len(sale.Config.Models) == 0 {
			return errors.New("请选择模型并设置有效的活动时间")
		}
		values, _, _, e := readModelPricingMaps(tx)
		if e != nil {
			return e
		}
		plan := []ModelSalePlan{}
		if sale.Status == "scheduled" || sale.Status == "active" {
			plan = sale.Plan
			if !modelSalePlanPublishable(tx, values, sale, plan, now) {
				return errors.New("价格或成本已变化，请重新核验活动后发布")
			}
		} else {
			for _, name := range sale.Config.Models {
				original := modelPricingValues(values, name)
				q, target, e := quoteModelSaleConfig(tx, name, effectiveModelPricing(values, name), original, sale.Config, now)
				if e != nil {
					return e
				}
				if !q.Eligible {
					return fmt.Errorf("%s：%s", name, q.Reason)
				}
				plan = append(plan, ModelSalePlan{Name: name, Original: original, Target: target, OriginalVersion: pricingEntryVersion(values, name)})
			}
		}
		sale.AnnouncementManaged = true
		sale.AnnouncementEnabled = true
		sale.AnnouncementAt = publishAt
		sale.AnnouncementPlan = plan
		sale.Revision++
		sale.UpdatedAt = now.Unix()
		return tx.Save(&sale).Error
	})
	return &sale, err
}

func CancelModelSaleAnnouncement(id string, revision int, now time.Time) (*ModelSale, error) {
	var sale ModelSale
	err := DB.Transaction(func(tx *gorm.DB) error {
		if e := lockForUpdate(tx).First(&sale, "id = ?", id).Error; e != nil {
			return e
		}
		if sale.Revision != revision {
			return ErrModelSaleConflict
		}
		sale.AnnouncementManaged = true
		sale.AnnouncementEnabled = false
		sale.AnnouncementPlan = []ModelSalePlan{}
		sale.Revision++
		sale.UpdatedAt = now.Unix()
		return tx.Save(&sale).Error
	})
	return &sale, err
}

func modelSalePlanPublishable(tx *gorm.DB, values map[string]map[string]any, sale ModelSale, plan []ModelSalePlan, now time.Time) bool {
	if len(plan) == 0 || len(plan) != len(sale.Config.Models) {
		return false
	}
	for i, p := range plan {
		if p.Name != sale.Config.Models[i] {
			return false
		}
		expected := p.OriginalVersion
		if sale.Status == "active" {
			expected = p.AppliedVersion
		}
		if expected == "" || expected != pricingEntryVersion(values, p.Name) {
			return false
		}
		target := effectiveModelPricing(values, p.Name)
		for k, v := range p.Target {
			target[k] = v
		}
		q := quoteModelSale(tx, p.Name, target, 0, sale.Config.Policy, now)
		if !q.Eligible {
			return false
		}
	}
	return true
}
