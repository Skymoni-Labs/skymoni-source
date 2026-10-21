package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// UpdateUpstreamChannelModels preserves credentials, status and manual edits.
// Prices must be committed before new models can be published through this call.
func UpdateUpstreamChannelModels(before *Channel, models, mapping string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var current Channel
		if err := lockForUpdate(tx).First(&current, before.Id).Error; err != nil {
			return err
		}
		value := func(p *string) string {
			if p == nil {
				return ""
			}
			return *p
		}
		if current.Status != common.ChannelStatusEnabled || current.Key != before.Key || current.Models != before.Models || value(current.ModelMapping) != value(before.ModelMapping) || value(current.BaseURL) != value(before.BaseURL) || current.Group != before.Group {
			return errors.New("channel changed during upstream sync; retry next run")
		}
		if err := tx.Model(&current).Updates(map[string]any{"models": models, "model_mapping": mapping}).Error; err != nil {
			return err
		}
		current.Models, current.ModelMapping = models, &mapping
		return current.UpdateAbilities(tx)
	})
}
