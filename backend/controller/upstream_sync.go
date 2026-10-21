package controller

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

type upstreamSyncBinding struct {
	ChannelID   int      `json:"channel_id"`
	Provider    string   `json:"provider"`
	Group       string   `json:"group"`
	Suffix      string   `json:"suffix"`
	ImageSuffix string   `json:"image_suffix"`
	Excluded    []string `json:"excluded_models"`
	Allowed     []string `json:"allowed_models"`
}

func (binding upstreamSyncBinding) allowsModel(name string) bool {
	return (len(binding.Allowed) == 0 || slices.Contains(binding.Allowed, name)) && !slices.Contains(binding.Excluded, name)
}

type upstreamSyncConfig struct {
	PricingOverrides    map[string]string     `json:"pricing_overrides"`
	FXAdjustedOverrides []string              `json:"fx_adjusted_overrides"`
	FXOverrideBasis     float64               `json:"fx_override_basis_cny_per_usd"`
	DryRun              bool                  `json:"dry_run"`
	Enabled             bool                  `json:"enabled"`
	NetCNYPerDollar     float64               `json:"net_cny_per_dollar"`
	Costs               map[string]float64    `json:"costs"`
	Margins             map[string]float64    `json:"margins"`
	Bindings            []upstreamSyncBinding `json:"bindings"`
}

type upstreamSyncResult struct {
	DryRun          bool                           `json:"dry_run"`
	Enabled         bool                           `json:"enabled"`
	Added           []string                       `json:"added"`
	Removed         []string                       `json:"removed"`
	Repriced        []string                       `json:"repriced"`
	Pending         []string                       `json:"pending"`
	Before          map[string]model.PricingValues `json:"before_prices,omitempty"`
	BeforeChannels  map[int]map[string]string      `json:"before_channels,omitempty"`
	PreservedManual []string                       `json:"preserved_manual,omitempty"`
}

func loadUpstreamSyncConfig() (upstreamSyncConfig, error) {
	var config upstreamSyncConfig
	path := os.Getenv("SKYMONI_UPSTREAM_SYNC_CONFIG")
	if path == "" {
		return config, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return config, errors.New("upstream sync config is unavailable")
	}
	if err = common.Unmarshal(data, &config); err != nil {
		return config, errors.New("invalid upstream sync config")
	}
	if !config.Enabled {
		return config, nil
	}
	if config.NetCNYPerDollar <= 0 || !syncFinite(config.NetCNYPerDollar) {
		return config, errors.New("invalid wallet conversion")
	}
	for name, expr := range config.PricingOverrides {
		if strings.TrimSpace(name) == "" || strings.TrimSpace(expr) == "" {
			return config, errors.New("invalid fixed pricing policy")
		}
		if err := model.ValidateModelPricing(name, model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expr}); err != nil {
			return config, errors.New("invalid fixed pricing expression")
		}
	}
	if len(config.FXAdjustedOverrides) > 0 {
		if !syncFinite(config.FXOverrideBasis) || config.FXOverrideBasis < 4 || config.FXOverrideBasis > 10 {
			return config, errors.New("invalid FX override basis")
		}
		for _, name := range config.FXAdjustedOverrides {
			if _, exists := config.PricingOverrides[name]; !exists {
				return config, errors.New("FX override has no base expression")
			}
		}
	}
	seen := map[int]bool{}
	for _, binding := range config.Bindings {
		cost, margin := config.Costs[binding.Provider], config.Margins[binding.Provider]
		_, hasMargin := config.Margins[binding.Provider]
		if binding.ChannelID <= 0 || seen[binding.ChannelID] || (binding.Provider != "yylx" && binding.Provider != "2000run") || !hasMargin || !syncFinite(cost) || cost <= 0 || !syncFinite(margin) || margin < 0 || margin >= 1 {
			return config, errors.New("invalid upstream sync policy")
		}
		seen[binding.ChannelID] = true
	}
	return config, nil
}

func syncFinite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

var syncGPTVersion = regexp.MustCompile(`(?i)^gpt-(\d+)(?:\.(\d+))?`)

func syncHiddenModel(name string) bool {
	parts := syncGPTVersion.FindStringSubmatch(name)
	if parts == nil {
		return false
	}
	major, _ := strconv.Atoi(parts[1])
	minor, _ := strconv.Atoi(parts[2])
	return major < 5 || (major == 5 && minor < 5)
}

// Values are coefficients in site dollars per million tokens. Never round down.
func syncCoefficient(value *float64, factor float64) (string, error) {
	if value == nil || !syncFinite(*value) || *value < 0 || !syncFinite(factor) || factor <= 0 {
		return "", errors.New("missing or invalid price")
	}
	v := math.Ceil(*value*factor*1e6) / 1e6
	if !syncFinite(v) {
		return "", errors.New("price overflow")
	}
	return strconv.FormatFloat(v, 'f', 6, 64), nil
}

func syncTokenLeaf(label string, prices []*float64, factor float64) (string, error) {
	if len(prices) != 5 || prices[0] == nil || prices[1] == nil || *prices[0] <= 0 {
		return "", errors.New("incomplete token pricing")
	}
	terms := []string{}
	for i, symbol := range []string{"p", "c", "cr", "cc", "cc1h"} {
		if prices[i] == nil {
			continue
		}
		v, err := syncCoefficient(prices[i], factor)
		if err != nil {
			return "", err
		}
		terms = append(terms, symbol+" * "+v)
	}
	return fmt.Sprintf("tier(%q, %s)", label, strings.Join(terms, " + ")), nil
}

func upstreamSyncExpression(item upstreamMonitorModel, provider string, factor float64) (string, error) {
	if item.PriceStatus != "known" {
		return "", errors.New("upstream price unknown")
	}
	if item.PeakRateMultiplier != nil && *item.PeakRateMultiplier != 1 {
		return "", errors.New("peak pricing requires review")
	}
	p := item.RawPrice
	if item.BillingType == "request" {
		if len(item.Tiers) == 0 {
			price, err := syncCoefficient(p.EffectivePerRequest, factor)
			if err != nil || p.EffectivePerRequest == nil || *p.EffectivePerRequest <= 0 {
				return "", errors.New("request price unknown or zero")
			}
			if strings.Contains(item.Name, "image") {
				return "", errors.New("image dimensions require explicit tiers")
			}
			return `tier("request", fixed(` + price + `))`, nil
		}
		prices := map[string]string{}
		for _, tier := range item.Tiers {
			if !slices.Contains([]string{"1K", "2K", "4K"}, tier.Label) {
				return "", errors.New("unknown image tier")
			}
			v, err := syncCoefficient(tier.EffectivePerRequest, factor)
			if err != nil {
				return "", err
			}
			prices[tier.Label] = v
		}
		if len(prices) != 3 || len(item.Tiers) != 3 {
			return "", errors.New("incomplete image tiers")
		}
		if strings.HasPrefix(item.Name, "gpt-image-") {
			return fmt.Sprintf(`(param("size") == "4096x4096" ? tier("4K", fixed(%s)) : param("size") == "2048x2048" ? tier("2K", fixed(%s)) : tier("1K", fixed(%s))) * image_count`, prices["4K"], prices["2K"], prices["1K"]), nil
		}
		if strings.HasPrefix(item.Name, "gemini-") && strings.Contains(item.Name, "image") {
			return fmt.Sprintf(`param("generationConfig.imageConfig.imageSize") == "4K" ? tier("4K_single_image", fixed(%s)) : param("generationConfig.imageConfig.imageSize") == "2K" ? tier("2K_single_image", fixed(%s)) : tier("1K_single_image", fixed(%s))`, prices["4K"], prices["2K"], prices["1K"]), nil
		}
		return "", errors.New("unsupported request tiers")
	}
	if item.BillingType != "token" || provider != "yylx" {
		return "", errors.New("unsupported billing details")
	}
	expr, err := syncTokenLeaf("standard", []*float64{p.EffectiveInputPerMillion, p.EffectiveOutputPerMillion, p.EffectiveCacheReadPerMillion, p.EffectiveCacheWritePerMillion, p.EffectiveCacheWrite1hPerMillion}, factor)
	if err != nil {
		return "", err
	}
	if len(item.Tiers) > 0 {
		tiers := slices.Clone(item.Tiers)
		sort.Slice(tiers, func(i, j int) bool {
			if tiers[i].MinTokens == nil {
				return true
			}
			if tiers[j].MinTokens == nil {
				return false
			}
			return *tiers[i].MinTokens < *tiers[j].MinTokens
		})
		var boundary int64
		leaves := []string{}
		for i, tier := range tiers {
			if tier.MinTokens == nil || *tier.MinTokens != boundary || (i < len(tiers)-1 && (tier.MaxTokens == nil || *tier.MaxTokens <= boundary)) || (i == len(tiers)-1 && tier.MaxTokens != nil) {
				return "", errors.New("noncontiguous or bounded token tiers")
			}
			leaf, e := syncTokenLeaf(fmt.Sprintf("tier_%d", i+1), []*float64{tier.EffectiveInputPerMillion, tier.EffectiveOutputPerMillion, tier.EffectiveCacheReadPerMillion, tier.EffectiveCacheWritePerMillion, tier.EffectiveCacheWrite1hPerMillion}, factor)
			if e != nil {
				return "", e
			}
			leaves = append(leaves, leaf)
			if tier.MaxTokens != nil {
				boundary = *tier.MaxTokens
			}
		}
		expr = leaves[len(leaves)-1]
		for i := len(leaves) - 2; i >= 0; i-- {
			expr = fmt.Sprintf("len <= %d ? %s : (%s)", *tiers[i].MaxTokens, leaves[i], expr)
		}
	}
	// This documented upstream model charges triple for max effort.
	if item.Name == "claude-fable-5-1" {
		expr = "(" + expr + `) * ((param("output_config.effort") == "max" || param("reasoning_effort") == "max" || param("reasoning.effort") == "max") ? 3 : 1)`
	}
	return expr, nil
}

func runUpstreamSync(ctx context.Context, snapshot upstreamMonitorSnapshot) (upstreamSyncResult, error) {
	result := upstreamSyncResult{Added: []string{}, Removed: []string{}, Repriced: []string{}, Pending: []string{}, Before: map[string]model.PricingValues{}, BeforeChannels: map[int]map[string]string{}}
	cfg, err := loadUpstreamSyncConfig()
	if err != nil {
		return result, err
	}
	result.Enabled = cfg.Enabled
	result.DryRun = cfg.DryRun
	if !cfg.Enabled {
		return result, nil
	}
	fxQuote, hasFXQuote := currentReferenceFX()
	common.OptionMapRWMutex.RLock()
	rawCosts := common.OptionMap["SkymoniUpstreamCosts"]
	common.OptionMapRWMutex.RUnlock()
	costs := map[string][]UpstreamCost{}
	if rawCosts != "" {
		if err := common.UnmarshalJsonStr(rawCosts, &costs); err != nil {
			return result, err
		}
	}
	if costs == nil {
		costs = map[string][]UpstreamCost{}
	}
	routesChanged := false
	defer func() {
		if routesChanged {
			model.InitChannelCache()
			model.InvalidatePricingCache()
		}
	}()
	for _, binding := range cfg.Bindings {
		if ctx.Err() != nil {
			return result, ctx.Err()
		}
		channel, e := model.GetChannelById(binding.ChannelID, true)
		if e != nil {
			return result, e
		}
		if channel.Status != common.ChannelStatusEnabled {
			continue
		}
		for _, group := range strings.Split(channel.Group, ",") {
			if ratio_setting.GetGroupRatio(group) < 1 {
				return result, errors.New("group discount changed; review pricing policy")
			}
			for _, discounts := range ratio_setting.GetGroupRatioSetting().GroupGroupRatio.ReadAll() {
				if discount, ok := discounts[group]; ok && discount < 1 {
					return result, errors.New("user group discount changed; review pricing policy")
				}
			}
		}
		base := "https://app.yylx.io"
		if binding.Provider == "2000run" {
			base = "https://api.2000.run"
		}
		if channel.BaseURL == nil || strings.TrimRight(*channel.BaseURL, "/") != base || channel.ChannelInfo.IsMultiKey {
			result.Pending = append(result.Pending, fmt.Sprintf("channel %d: endpoint/key configuration changed", channel.Id))
			continue
		}
		var provider *upstreamMonitorProvider
		for i := range snapshot.Providers {
			if snapshot.Providers[i].Provider == binding.Provider {
				provider = &snapshot.Providers[i]
				break
			}
		}
		if provider == nil || provider.Stale || provider.Status == "error" {
			result.Pending = append(result.Pending, binding.Provider+": no fresh quote")
			continue
		}
		var inventory struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if e = fetchUpstreamMonitorJSON(ctx, newUpstreamMonitorClient(), base+"/v1/models", channel.Key, &inventory); e != nil || len(inventory.Data) == 0 {
			result.Pending = append(result.Pending, fmt.Sprintf("channel %d: authenticated model inventory unavailable", channel.Id))
			continue
		}
		allowed := map[string]bool{}
		for _, m := range inventory.Data {
			allowed[m.ID] = true
		}
		quotes := map[string]upstreamMonitorModel{}
		for _, m := range provider.Models {
			group := m.Group
			if binding.Provider == "yylx" {
				group = m.GroupID
			}
			if group == binding.Group {
				quotes[m.Name] = m
			}
		}
		if len(quotes) == 0 {
			result.Pending = append(result.Pending, fmt.Sprintf("channel %d: empty pricing group", channel.Id))
			continue
		}
		mapping := map[string]string{}
		if channel.ModelMapping != nil && *channel.ModelMapping != "" {
			if e = common.UnmarshalJsonStr(*channel.ModelMapping, &mapping); e != nil {
				return result, e
			}
		}
		names := strings.Split(channel.Models, ",")
		present := map[string]bool{}
		reverse := map[string]string{}
		for _, name := range names {
			if name != "" {
				present[name] = true
				up := mapping[name]
				if up == "" {
					up = name
				}
				reverse[up] = name
			}
		}
		prices, e := model.GetModelPricingSnapshot(nil)
		if e != nil {
			return result, e
		}
		entries := map[string]model.ModelPricingEntry{}
		for _, p := range prices.Entries {
			entries[p.ModelName] = p
		}
		changes := []model.ModelPricingChange{}
		added := []string{}
		removed := []string{}
		costCNY := cfg.Costs[binding.Provider]
		if binding.Provider == "yylx" && hasFXQuote {
			costCNY = math.Max(costCNY, fxQuote.USDToCNY)
		}
		factor := costCNY / cfg.NetCNYPerDollar / (1 - cfg.Margins[binding.Provider])
		upNames := []string{}
		for up := range quotes {
			upNames = append(upNames, up)
		}
		sort.Strings(upNames)
		for _, up := range upNames {
			if !allowed[up] || syncHiddenModel(up) || !binding.allowsModel(up) {
				continue
			}
			alias := reverse[up]
			if alias == "" {
				suffix := binding.Suffix
				if strings.Contains(up, "image") && binding.ImageSuffix != "" {
					suffix = binding.ImageSuffix
				}
				alias = up + suffix
			}
			if !hasFXQuote && slices.Contains(cfg.FXAdjustedOverrides, alias) {
				result.Pending = append(result.Pending, alias+": daily FX rate unavailable; retaining existing price")
				continue
			}
			expr, e := upstreamSyncExpression(quotes[up], binding.Provider, factor)
			if e != nil {
				result.Pending = append(result.Pending, alias+": "+e.Error())
				continue
			}
			if !cfg.DryRun {
				cost := syncCostRecord(*provider, quotes[up])
				cost.ChannelID = channel.Id
				cost.ChannelVersion = model.ModelSaleCostChannelVersion(*channel, up)
				previous := costs[alias]
				kept := []UpstreamCost{}
				for _, old := range previous {
					if old.Provider != cost.Provider || old.Group != cost.Group || (old.ChannelID != 0 && old.ChannelID != cost.ChannelID) {
						kept = append(kept, old)
					}
				}
				costs[alias] = append(kept, cost)
				if err := syncMissingModelMetadata(alias, up, *provider, quotes[up]); err != nil {
					result.Pending = append(result.Pending, alias+": metadata sync failed")
				}
			}
			if hasFXQuote {
				expr = syncConfiguredExpressionAtFX(cfg, alias, expr, fxQuote.USDToCNY)
			} else {
				expr = syncConfiguredExpression(cfg, alias, expr)
			}
			entry, exists := entries[alias]
			if !present[alias] && len(entry.UsageSchema) > 0 {
				result.Pending = append(result.Pending, alias+": plugin model name requires review")
				continue
			}
			pricing := model.PricingValues{}
			for k, v := range entry.Configured {
				pricing[k] = v
			}
			pricing["billing_setting.billing_mode"] = "tiered_expr"
			pricing["billing_setting.billing_expr"] = expr
			if e = model.ValidateModelPricing(alias, pricing); e != nil {
				result.Pending = append(result.Pending, alias+": pricing validation failed")
				continue
			}
			version := prices.EmptyVersion
			if exists {
				version = entry.Version
			}
			if entry.PricingSource == model.ModelPricingSourceManual {
				result.PreservedManual = append(result.PreservedManual, alias)
			} else if model.ModelPricingVersion(pricing) != model.ModelPricingVersion(entry.Configured) {
				changes = append(changes, model.ModelPricingChange{ModelName: alias, ExpectedVersion: version, Pricing: pricing})
				result.Before[alias] = entry.Configured
			}
			if !present[alias] {
				added = append(added, alias)
				present[alias] = true
				mapping[alias] = up
			}
		}
		for up, alias := range reverse {
			_, quoted := quotes[up]
			if (!allowed[up] && !quoted) || syncHiddenModel(up) || (len(binding.Allowed) > 0 && !slices.Contains(binding.Allowed, up)) {
				delete(present, alias)
				delete(mapping, alias)
				removed = append(removed, alias)
			}
		}
		if len(changes) > 0 {
			if !cfg.DryRun {
				var applied []string
				if applied, e = model.UpdateAutomaticModelPricing(changes); e != nil {
					return result, e
				}
				result.Repriced = append(result.Repriced, applied...)
				for _, change := range changes {
					if !slices.Contains(applied, change.ModelName) {
						delete(result.Before, change.ModelName)
						result.PreservedManual = append(result.PreservedManual, change.ModelName)
					}
				}
			} else {
				for _, c := range changes {
					result.Repriced = append(result.Repriced, c.ModelName)
				}
			}
		}
		if len(added) > 0 || len(removed) > 0 {
			names = []string{}
			for name := range present {
				names = append(names, name)
			}
			sort.Strings(names)

			encoded, e := common.Marshal(mapping)
			if e != nil {
				return result, e
			}
			oldMapping := ""
			if channel.ModelMapping != nil {
				oldMapping = *channel.ModelMapping
			}
			result.BeforeChannels[channel.Id] = map[string]string{"models": channel.Models, "model_mapping": oldMapping}
			if !cfg.DryRun {
				if e = model.UpdateUpstreamChannelModels(channel, strings.Join(names, ","), string(encoded)); e != nil {
					return result, e
				}
				routesChanged = true
			}
			result.Added = append(result.Added, added...)
			result.Removed = append(result.Removed, removed...)
		}
	}
	// Jev has a verified fixed USD price but no machine-readable upstream quote.
	// Keep its exact published aliases aligned with the daily reference FX rate.
	for _, alias := range cfg.FXAdjustedOverrides {
		if !strings.HasPrefix(alias, "jev-") {
			continue
		}
		if !hasFXQuote {
			result.Pending = append(result.Pending, alias+": daily FX rate unavailable; retaining existing price")
			continue
		}
		expr := syncConfiguredExpressionAtFX(cfg, alias, "", fxQuote.USDToCNY)
		prices, e := model.GetModelPricingSnapshot(nil)
		if e != nil {
			return result, e
		}
		for _, entry := range prices.Entries {
			if entry.ModelName != alias {
				continue
			}
			if entry.PricingSource == model.ModelPricingSourceManual {
				result.PreservedManual = append(result.PreservedManual, alias)
				continue
			}
			pricing := model.PricingValues{}
			for key, value := range entry.Configured {
				pricing[key] = value
			}
			pricing["billing_setting.billing_mode"] = "tiered_expr"
			pricing["billing_setting.billing_expr"] = expr
			if e = model.ValidateModelPricing(alias, pricing); e != nil {
				return result, e
			}
			if model.ModelPricingVersion(pricing) != model.ModelPricingVersion(entry.Configured) {
				result.Before[alias] = entry.Configured
				if !cfg.DryRun {
					var applied []string
					if applied, e = model.UpdateAutomaticModelPricing([]model.ModelPricingChange{{ModelName: alias, ExpectedVersion: entry.Version, Pricing: pricing}}); e != nil {
						return result, e
					}
					if len(applied) == 0 {
						delete(result.Before, alias)
						result.PreservedManual = append(result.PreservedManual, alias)
						continue
					}
				}
				result.Repriced = append(result.Repriced, alias)
			}
			break
		}
	}
	if !cfg.DryRun {
		encoded, e := common.Marshal(costs)
		if e != nil {
			return result, e
		}
		if e = model.StoreModelSaleCosts(string(encoded), ""); e != nil {
			return result, e
		}
	}
	result.Pending = append(result.Pending, "TypeSafe: catalog has no prices; retaining verified Jev pricing; new aliases require a published quote")
	return result, nil
}

func QueueUpstreamSync(c *gin.Context) {
	cfg, err := loadUpstreamSyncConfig()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !cfg.Enabled {
		common.ApiError(c, errors.New("automatic upstream sync is not enabled"))
		return
	}
	if task, err := model.GetActiveSystemTask(model.SystemTaskTypeUpstreamMonitor); err == nil && task != nil {
		common.ApiSuccess(c, task.ToResponse())
		return
	}
	task, err := model.CreateSystemTask(model.SystemTaskTypeUpstreamMonitor, nil, nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, task.ToResponse())
}

// Exact downstream aliases only: a standard-price override must never affect Pro routes.
func syncConfiguredExpression(cfg upstreamSyncConfig, alias, generated string) string {
	if expr, exists := cfg.PricingOverrides[alias]; exists {
		return expr
	}
	return generated
}

var syncFXPriceTerm = regexp.MustCompile(`(?:\b(?:p|c|cr|cc|cc1h)|u\("input_tokens"\)|u\("output_tokens"\))\s*\*\s*(\d+(?:\.\d+)?)`)

// Fixed official-ratio policies use real USD as their numerator. Recompute the
// wallet-credit coefficients when the daily reference rate changes. These exact
// aliases must remain at the official 0.17 ratio even when upstream costs rise;
// the separate cost-based policy still protects the rest of the YYLX catalog.
func syncConfiguredExpressionAtFX(cfg upstreamSyncConfig, alias, generated string, usdToCNY float64) string {
	base := syncConfiguredExpression(cfg, alias, generated)
	if !slices.Contains(cfg.FXAdjustedOverrides, alias) || cfg.FXOverrideBasis <= 0 || !syncFinite(usdToCNY) {
		return base
	}
	factor := usdToCNY / cfg.FXOverrideBasis
	return syncFXPriceTerm.ReplaceAllStringFunc(base, func(term string) string {
		location := syncFXPriceTerm.FindStringSubmatchIndex(term)
		value, err := strconv.ParseFloat(term[location[2]:location[3]], 64)
		if err != nil {
			return term
		}
		if value == 0 {
			return term
		}
		adjusted := math.Ceil(value*factor*1e6-1e-9) / 1e6
		return term[:location[2]] + strconv.FormatFloat(adjusted, 'f', 6, 64)
	})
}
