package model

import (
	"errors"
	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"strings"
	"time"
)

// Rename only this existing public alias. Keep its old routing and exact prices
// for existing clients; expose the complete new ID in the catalog and drafts.
func RenameDeepSeekLowAlias(expectedVersion string, now time.Time) error {
	const oldName = "deepseek-flash-low"
	const newName = "deepseek-v4.1-flash-low"
	err := mutateModelPricingOptions(func(tx *gorm.DB, values map[string]map[string]any) error {
		if expectedVersion == "" || pricingEntryVersion(values, oldName) != expectedVersion {
			return ErrModelPricingConflict
		}
		var original Model
		if err := lockForUpdate(tx).Where("model_name = ? AND name_rule = ?", oldName, NameRuleExact).First(&original).Error; err != nil {
			return err
		}
		if original.Status != 1 {
			return errors.New("旧模型已隐藏，请刷新后检查改名结果")
		}
		var count int64
		if err := tx.Model(&Model{}).Where("model_name = ?", newName).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return errors.New("目标模型名已存在，未修改任何配置")
		}
		var sales []ModelSale
		if err := lockForUpdate(tx).Find(&sales).Error; err != nil {
			return err
		}
		for _, sale := range sales {
			for _, name := range sale.Config.Models {
				if name == oldName && (sale.Status == "active" || sale.Status == "scheduled" || sale.AnnouncementEnabled) {
					return errors.New("先停止旧模型活动与公告，再改名")
				}
			}
		}
		for key, entries := range values {
			if entry, ok := entries[oldName]; ok {
				if _, exists := entries[newName]; exists {
					return errors.New("目标模型已配置价格，未覆盖")
				}
				values[key][newName] = entry
			}
		}
		var channels []Channel
		if err := lockForUpdate(tx).Find(&channels).Error; err != nil {
			return err
		}
		for _, channel := range channels {
			names := strings.Split(channel.Models, ",")
			matched := false
			for _, name := range names {
				if strings.TrimSpace(name) == oldName {
					matched = true
				}
			}
			if !matched {
				continue
			}
			mapping := map[string]string{}
			if channel.ModelMapping != nil && *channel.ModelMapping != "" {
				if err := common.UnmarshalJsonStr(*channel.ModelMapping, &mapping); err != nil {
					return errors.New("渠道映射不是有效对象")
				}
			}
			upstream := mapping[oldName]
			if upstream == "" {
				upstream = oldName
			}
			if _, exists := mapping[newName]; exists {
				return errors.New("目标渠道映射已存在，未覆盖")
			}
			mapping[newName] = upstream
			encoded, _ := common.Marshal(mapping)
			if err := tx.Model(&Channel{}).Where("id = ?", channel.Id).Updates(map[string]any{"models": channel.Models + "," + newName, "model_mapping": string(encoded)}).Error; err != nil {
				return err
			}
		}
		var abilities []Ability
		if err := tx.Where("model = ?", oldName).Find(&abilities).Error; err != nil {
			return err
		}
		for _, ability := range abilities {
			ability.Model = newName
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&ability).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&Model{}).Where("id = ?", original.Id).Updates(map[string]any{"model_name": newName, "updated_time": now.Unix()}).Error; err != nil {
			return err
		}
		original.Id = 0
		original.Status = 0
		original.UpdatedTime = now.Unix()
		if err := tx.Create(&original).Error; err != nil {
			return err
		}
		// GORM's default:1 replaces a zero value on INSERT; hide explicitly.
		if err := tx.Model(&Model{}).Where("id = ?", original.Id).Update("status", 0).Error; err != nil {
			return err
		}
		// Public price and original procurement quotations are copied verbatim.
		// Copying a quotation does not verify missing upstream cash conversion.
		var costs Option
		if err := tx.Where(commonKeyCol+" = ?", "SkymoniUpstreamCosts").Limit(1).Find(&costs).Error; err != nil {
			return err
		}
		if costs.Key != "" {
			entries := map[string]any{}
			if err := common.UnmarshalJsonStr(costs.Value, &entries); err != nil {
				return err
			}
			if entry, ok := entries[oldName]; ok {
				entries[newName] = entry
				encoded, _ := common.Marshal(entries)
				if err := tx.Model(&Option{}).Where(commonKeyCol+" = ?", costs.Key).Update("value", string(encoded)).Error; err != nil {
					return err
				}
			}
		}
		for _, sale := range sales {
			changed := false
			for i, name := range sale.Config.Models {
				if name == oldName {
					sale.Config.Models[i] = newName
					changed = true
				}
			}
			if !changed {
				continue
			}
			if value, ok := sale.Config.Multipliers[oldName]; ok {
				delete(sale.Config.Multipliers, oldName)
				sale.Config.Multipliers[newName] = value
			}
			if value, ok := sale.Config.RequestPrices[oldName]; ok {
				delete(sale.Config.RequestPrices, oldName)
				sale.Config.RequestPrices[newName] = value
			}
			sale.Title = "DeepSeek V4.1 Flash Low 七天分时降价（待成本核验）"
			sale.Message = "未启用；普通与高峰分别展示原价及拟优惠价，两档成本均须核验"
			sale.Revision++
			sale.UpdatedAt = now.Unix()
			sale.Plan = []ModelSalePlan{}
			sale.AnnouncementPlan = []ModelSalePlan{}
			if err := tx.Save(&sale).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	// Price settings are refreshed by the same protected transaction before the
	// new routing alias becomes selectable in this serving process.
	InitChannelCache()
	RefreshPricing()
	return nil
}
