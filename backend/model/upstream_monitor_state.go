package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// UpstreamMonitorState contains only public model IDs and price data. It must
// never contain upstream credentials or account-specific response headers.
type UpstreamMonitorState struct {
	Provider       string `gorm:"primaryKey;type:varchar(32)"`
	Summary        string `gorm:"type:json"`
	PriceChanges   string `gorm:"type:json"`
	CheckedAt      int64  `gorm:"bigint"`
	ChangedAt      int64  `gorm:"bigint"`
	PriceChangedAt int64  `gorm:"bigint"`
}

func GetUpstreamMonitorState(provider string) (*UpstreamMonitorState, error) {
	var state UpstreamMonitorState
	err := DB.First(&state, "provider = ?", provider).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &state, nil
}

// SaveUpstreamMonitorState preserves ChangedAt across identical snapshots.
// Only a successful upstream read may call this function.
func SaveUpstreamMonitorState(provider, summary, priceChanges string, hasPriceChanges bool, checkedAt time.Time) (*UpstreamMonitorState, error) {
	now := checkedAt.UTC().Unix()
	var saved UpstreamMonitorState
	err := DB.Transaction(func(tx *gorm.DB) error {
		var state UpstreamMonitorState
		err := tx.First(&state, "provider = ?", provider).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			state = UpstreamMonitorState{Provider: provider, Summary: summary, PriceChanges: "[]", CheckedAt: now, ChangedAt: now}
			if err := tx.Create(&state).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else {
			updates := map[string]any{"checked_at": now}
			if state.Summary != summary {
				updates["summary"] = summary
				updates["changed_at"] = now
				state.Summary = summary
				state.ChangedAt = now
				if hasPriceChanges {
					updates["price_changes"] = priceChanges
					updates["price_changed_at"] = now
					state.PriceChanges = priceChanges
					state.PriceChangedAt = now
				}
			}
			if err := tx.Model(&state).Updates(updates).Error; err != nil {
				return err
			}
			state.CheckedAt = now
		}
		saved = state
		return nil
	})
	return &saved, err
}
