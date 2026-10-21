package model

import (
	"errors"
	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// Refreshes from different suppliers must not replace each other's newer
// snapshots. The option row is locked while supplier-owned records are merged.
func StoreModelSaleCosts(raw string, provider string) error {
	if provider != "" && provider != "oranexa" {
		return errors.New("unsupported cost snapshot owner")
	}
	incoming := map[string][]map[string]any{}
	if err := common.UnmarshalJsonStr(raw, &incoming); err != nil {
		return err
	}
	var encoded string
	err := DB.Transaction(func(tx *gorm.DB) error {
		var option Option
		if err := lockForUpdate(tx).Where(commonKeyCol+" = ?", "SkymoniUpstreamCosts").First(&option).Error; err != nil {
			return err
		}
		current := map[string][]map[string]any{}
		if err := common.UnmarshalJsonStr(option.Value, &current); err != nil {
			return err
		}
		if provider == "" {
			// General YYLX/2000.run updates carry stale copies of Oranexa records.
			for name, rows := range incoming {
				kept := []map[string]any{}
				for _, r := range rows {
					if r["provider"] != "oranexa" {
						kept = append(kept, r)
					}
				}
				incoming[name] = kept
			}
			for name, rows := range current {
				for _, r := range rows {
					if r["provider"] == "oranexa" {
						incoming[name] = append(incoming[name], r)
					}
				}
			}
			current = incoming
		} else {
			for name, rows := range incoming {
				fresh := []map[string]any{}
				for _, r := range rows {
					if r["provider"] == provider {
						fresh = append(fresh, r)
					}
				}
				if len(fresh) == 0 {
					continue
				}
				kept := []map[string]any{}
				for _, r := range current[name] {
					if r["provider"] != provider {
						kept = append(kept, r)
					}
				}
				current[name] = append(kept, fresh...)
			}
		}
		bytes, err := common.Marshal(current)
		if err != nil {
			return err
		}
		encoded = string(bytes)
		return tx.Model(&option).Update("value", encoded).Error
	})
	if err != nil {
		return err
	}
	return updateOptionMap("SkymoniUpstreamCosts", encoded)
}
