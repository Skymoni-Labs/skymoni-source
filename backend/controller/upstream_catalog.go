package controller

import (
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
	"strings"
)

func syncCostRecord(provider upstreamMonitorProvider, quote upstreamMonitorModel) UpstreamCost {
	stamp := ""
	if provider.CheckedAt != nil {
		stamp = *provider.CheckedAt
	}
	p := quote.RawPrice
	return UpstreamCost{Provider: provider.Provider, SourceModel: quote.Name, Source: provider.SourceURL, ObservedAt: stamp, Group: quote.Group, GroupRatio: p.GroupRatio, ModelRatio: p.ModelRatio, CompletionRatio: p.CompletionRatio, RequestUSD: p.PerRequest, InputUSDPerMillion: p.InputPerMillion, OutputUSDPerMillion: p.OutputPerMillion, BillingType: quote.BillingType, CacheRead: p.CacheReadPerMillion, CacheWrite: p.CacheWritePerMillion, CacheWrite1h: p.CacheWrite1hPerMillion, Tiers: quote.Tiers}
}

// Fill catalog gaps alongside newly imported routes. Never overwrite administrator
// metadata or infer upstream limits/capabilities from the official model family.
func syncMissingModelMetadata(alias, upstream string, provider upstreamMonitorProvider, quote upstreamMonitorModel) error {
	var record model.Model
	err := model.DB.Where("model_name = ?", alias).First(&record).Error
	missing := errors.Is(err, gorm.ErrRecordNotFound)
	if err != nil && !missing {
		return err
	}
	if missing {
		// Deletion is an administrator decision. A periodic upstream sync must
		// not recreate and republish the same catalog record.
		var deleted int64
		if err := model.DB.Unscoped().Model(&model.Model{}).Where("model_name = ? AND deleted_at IS NOT NULL", alias).Count(&deleted).Error; err != nil {
			return err
		}
		if deleted > 0 {
			return nil
		}
	}
	if !missing && record.Description != "" && record.Icon != "" && record.Tags != "" && record.VendorID != 0 {
		return nil
	}
	vendorName := ""
	switch {
	case strings.HasPrefix(upstream, "claude-"):
		vendorName = "Anthropic"
	case strings.HasPrefix(upstream, "gpt-") || upstream == "codex-auto-review":
		vendorName = "OpenAI"
	case strings.HasPrefix(upstream, "gemini-"):
		vendorName = "Google"
	case strings.HasPrefix(upstream, "grok-"):
		vendorName = "xAI"
	}
	if vendorName == "" {
		return errors.New("unknown upstream vendor")
	}
	var vendor model.Vendor
	if err := model.DB.Where("name = ?", vendorName).First(&vendor).Error; err != nil {
		return err
	}
	if missing {
		// Newly discovered models require explicit catalog publication.
		record = model.Model{ModelName: alias, Status: 0, SyncOfficial: 0}
	}
	if record.VendorID == 0 {
		record.VendorID = vendor.Id
	}
	if record.Icon == "" {
		record.Icon = vendor.Icon
	}
	if record.Tags == "" {
		record.Tags = model.PublicModelOwner(alias) + "," + quote.BillingType
	}
	if record.Description == "" {
		record.Description = fmt.Sprintf("%s 模型 · %s；模型标识：%s。价格与计费方式以模型广场为准。", vendorName, model.PublicModelOwner(alias), alias)
	}
	if missing {
		err = record.Insert()
	} else {
		err = record.Update()
	}
	if err == nil {
		model.RefreshPricing()
	}
	return err
}
