package controller

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const (
	monitorYYLXURL      = "https://app.yylx.io/api/v1/model-plaza"
	monitor2000URL      = "https://api.2000.run/api/pricing"
	monitorTypeSafeURL  = "https://api.typesafe.ai/v1/models"
	monitorCacheTTL     = 5 * time.Minute
	monitorRefreshFloor = 30 * time.Second
	monitorFetchTimeout = 10 * time.Second
	monitorMaxBodyBytes = 2 << 20
)

// These are source prices in USD, before this site's recharge exchange rate.
// An effective YYLX price includes its public group multiplier but excludes
// time-dependent peak rates and any private account-specific discount.
type upstreamMonitorPrice struct {
	InputPerMillion                 *float64 `json:"input_per_million"`
	OutputPerMillion                *float64 `json:"output_per_million"`
	PerRequest                      *float64 `json:"per_request"`
	ModelRatio                      *float64 `json:"model_ratio"`
	CompletionRatio                 *float64 `json:"completion_ratio"`
	EffectiveInputPerMillion        *float64 `json:"effective_input_per_million"`
	EffectiveOutputPerMillion       *float64 `json:"effective_output_per_million"`
	EffectivePerRequest             *float64 `json:"effective_per_request"`
	GroupRatio                      *float64 `json:"group_ratio"`
	CacheReadPerMillion             *float64 `json:"cache_read_per_million,omitempty"`
	CacheWritePerMillion            *float64 `json:"cache_write_per_million,omitempty"`
	CacheWrite1hPerMillion          *float64 `json:"cache_write_1h_per_million,omitempty"`
	EffectiveCacheReadPerMillion    *float64 `json:"effective_cache_read_per_million,omitempty"`
	EffectiveCacheWritePerMillion   *float64 `json:"effective_cache_write_per_million,omitempty"`
	EffectiveCacheWrite1hPerMillion *float64 `json:"effective_cache_write_1h_per_million,omitempty"`
}

type upstreamMonitorTier struct {
	Label                           string   `json:"label"`
	MinTokens                       *int64   `json:"min_tokens,omitempty"`
	MaxTokens                       *int64   `json:"max_tokens,omitempty"`
	InputPerMillion                 *float64 `json:"input_per_million"`
	OutputPerMillion                *float64 `json:"output_per_million"`
	EffectiveInputPerMillion        *float64 `json:"effective_input_per_million"`
	EffectiveOutputPerMillion       *float64 `json:"effective_output_per_million"`
	PerRequest                      *float64 `json:"per_request"`
	EffectivePerRequest             *float64 `json:"effective_per_request"`
	CacheReadPerMillion             *float64 `json:"cache_read_per_million,omitempty"`
	CacheWritePerMillion            *float64 `json:"cache_write_per_million,omitempty"`
	CacheWrite1hPerMillion          *float64 `json:"cache_write_1h_per_million,omitempty"`
	EffectiveCacheReadPerMillion    *float64 `json:"effective_cache_read_per_million,omitempty"`
	EffectiveCacheWritePerMillion   *float64 `json:"effective_cache_write_per_million,omitempty"`
	EffectiveCacheWrite1hPerMillion *float64 `json:"effective_cache_write_1h_per_million,omitempty"`
}

type upstreamMonitorModel struct {
	Name               string                `json:"name"`
	Group              string                `json:"group,omitempty"`
	GroupID            string                `json:"group_id,omitempty"`
	BillingType        string                `json:"billing_type"`
	Currency           *string               `json:"currency"`
	RawPrice           upstreamMonitorPrice  `json:"raw_price"`
	PriceStatus        string                `json:"price_status"`
	SuggestedSalePrice *float64              `json:"suggested_sale_price"`
	GrossMargin        *float64              `json:"gross_margin"`
	Tiers              []upstreamMonitorTier `json:"tiers,omitempty"`
	PeakRateMultiplier *float64              `json:"peak_rate_multiplier,omitempty"`
}

type upstreamMonitorPriceChange struct {
	Name           string               `json:"name"`
	Group          string               `json:"group,omitempty"`
	GroupID        string               `json:"group_id,omitempty"`
	OldBillingType string               `json:"old_billing_type"`
	NewBillingType string               `json:"new_billing_type"`
	OldPrice       upstreamMonitorPrice `json:"old_price"`
	NewPrice       upstreamMonitorPrice `json:"new_price"`
	TiersChanged   bool                 `json:"tiers_changed"`
	PeakChanged    bool                 `json:"peak_changed"`
}

type upstreamMonitorProvider struct {
	Provider           string                       `json:"provider"`
	SourceURL          string                       `json:"source_url"`
	CheckedAt          *string                      `json:"checked_at"`
	LastSuccessAt      *string                      `json:"last_success_at"`
	LastChangedAt      *string                      `json:"last_changed_at"`
	LastPriceChangedAt *string                      `json:"last_price_changed_at"`
	Stale              bool                         `json:"stale"`
	Status             string                       `json:"status"`
	Error              *string                      `json:"error"`
	Notice             *string                      `json:"notice,omitempty"`
	HistoryError       *string                      `json:"history_error"`
	DiffScope          string                       `json:"diff_scope"`
	RemovalActionable  bool                         `json:"removal_actionable"`
	Models             []upstreamMonitorModel       `json:"models"`
	NewModels          []string                     `json:"new_models"`
	RemovedModels      []string                     `json:"removed_models"`
	LocalModels        []string                     `json:"local_models"`
	PriceChanges       []upstreamMonitorPriceChange `json:"price_changes"`
}

type upstreamMonitorSnapshot struct {
	CheckedAt       string                    `json:"checked_at"`
	Cached          bool                      `json:"cached"`
	Providers       []upstreamMonitorProvider `json:"providers"`
	AutoSyncEnabled bool                      `json:"auto_sync_enabled"`
	AutoSyncTask    *model.SystemTaskResponse `json:"auto_sync_task,omitempty"`
}

var upstreamMonitorCache = struct {
	sync.Mutex
	snapshot upstreamMonitorSnapshot
	checked  time.Time
}{}

func monitorString(value string) *string { return &value }

func monitorNumber(value float64) *float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return nil
	}
	return &value
}

func monitorValidNumber(value *float64) *float64 {
	if value == nil {
		return nil
	}
	return monitorNumber(*value)
}

func monitorMultiply(value *float64, factor float64) *float64 {
	if value == nil {
		return nil
	}
	return monitorNumber(*value * factor)
}

func monitorMillion(value *float64) *float64 {
	return monitorMultiply(value, 1_000_000)
}

func newUpstreamMonitorClient() *http.Client {
	return &http.Client{
		Timeout: monitorFetchTimeout,
		// These sources are fixed URLs. Refusing redirects also prevents a source
		// from redirecting an authenticated TypeSafe request to another host.
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func fetchUpstreamMonitorJSON(ctx context.Context, client *http.Client, address string, bearer string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return errors.New("invalid source URL")
	}
	req.Header.Set("Accept", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	response, err := client.Do(req)
	if err != nil {
		// Never return url.Error: it can contain request information.
		return errors.New("upstream request failed")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("upstream HTTP %d", response.StatusCode)
	}
	if kind := response.Header.Get("Content-Type"); kind != "" && !strings.Contains(strings.ToLower(kind), "json") {
		return errors.New("upstream did not return JSON")
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, monitorMaxBodyBytes+1))
	if err != nil {
		return errors.New("upstream response could not be read")
	}
	if len(body) > monitorMaxBodyBytes {
		return errors.New("upstream response exceeded size limit")
	}
	if err := json.Unmarshal(body, out); err != nil {
		return errors.New("upstream returned invalid JSON")
	}
	return nil
}

type yylxPrice struct {
	BillingMode       string   `json:"billing_mode"`
	InputPrice        *float64 `json:"input_price"`
	OutputPrice       *float64 `json:"output_price"`
	CacheReadPrice    *float64 `json:"cache_read_price"`
	CacheWritePrice   *float64 `json:"cache_write_price"`
	CacheWrite1hPrice *float64 `json:"cache_write_1h_price"`
	PerRequestPrice   *float64 `json:"per_request_price"`
	Intervals         []struct {
		Label             string   `json:"tier_label"`
		MinTokens         *int64   `json:"min_tokens"`
		MaxTokens         *int64   `json:"max_tokens"`
		InputPrice        *float64 `json:"input_price"`
		OutputPrice       *float64 `json:"output_price"`
		CacheReadPrice    *float64 `json:"cache_read_price"`
		CacheWritePrice   *float64 `json:"cache_write_price"`
		CacheWrite1hPrice *float64 `json:"cache_write_1h_price"`
		PerRequestPrice   *float64 `json:"per_request_price"`
	} `json:"intervals"`
}

type yylxPlaza struct {
	Code int `json:"code"`
	Data struct {
		Groups []struct {
			ID                   int      `json:"id"`
			Name                 string   `json:"name"`
			RateMultiplier       *float64 `json:"rate_multiplier"`
			UserRateMultiplier   *float64 `json:"user_rate_multiplier"`
			ImageRateIndependent bool     `json:"image_rate_independent"`
			ImageRateMultiplier  *float64 `json:"image_rate_multiplier"`
			PeakRateMultiplier   *float64 `json:"peak_rate_multiplier"`
			Models               []struct {
				Name    string    `json:"name"`
				Pricing yylxPrice `json:"pricing"`
			} `json:"models"`
		} `json:"groups"`
	} `json:"data"`
}

func parseYYLXMonitor(plaza yylxPlaza) ([]upstreamMonitorModel, error) {
	if plaza.Code != 0 || len(plaza.Data.Groups) == 0 {
		return nil, errors.New("YYLX model plaza is unavailable")
	}
	result := make([]upstreamMonitorModel, 0)
	for _, group := range plaza.Data.Groups {
		ratio := monitorValidNumber(group.RateMultiplier)
		if group.UserRateMultiplier != nil {
			ratio = monitorValidNumber(group.UserRateMultiplier)
		}
		for _, entry := range group.Models {
			name := strings.TrimSpace(entry.Name)
			if name == "" {
				continue
			}
			billingType := entry.Pricing.BillingMode
			if billingType != "token" && billingType != "request" && billingType != "image" {
				billingType = "unknown"
			}
			if billingType == "image" {
				billingType = "request"
			}
			priceFactor := ratio
			if entry.Pricing.BillingMode == "image" && group.ImageRateIndependent && group.ImageRateMultiplier != nil {
				priceFactor = monitorValidNumber(group.ImageRateMultiplier)
			}
			price := upstreamMonitorPrice{
				InputPerMillion: monitorMillion(entry.Pricing.InputPrice), OutputPerMillion: monitorMillion(entry.Pricing.OutputPrice),
				PerRequest: monitorValidNumber(entry.Pricing.PerRequestPrice), CacheReadPerMillion: monitorMillion(entry.Pricing.CacheReadPrice),
				CacheWritePerMillion: monitorMillion(entry.Pricing.CacheWritePrice), CacheWrite1hPerMillion: monitorMillion(entry.Pricing.CacheWrite1hPrice), GroupRatio: priceFactor,
			}
			if priceFactor != nil && monitorNumber(*priceFactor) != nil {
				price.EffectiveInputPerMillion = monitorMultiply(price.InputPerMillion, *priceFactor)
				price.EffectiveOutputPerMillion = monitorMultiply(price.OutputPerMillion, *priceFactor)
				price.EffectivePerRequest = monitorMultiply(price.PerRequest, *priceFactor)
				price.EffectiveCacheReadPerMillion = monitorMultiply(price.CacheReadPerMillion, *priceFactor)
				price.EffectiveCacheWritePerMillion = monitorMultiply(price.CacheWritePerMillion, *priceFactor)
				price.EffectiveCacheWrite1hPerMillion = monitorMultiply(price.CacheWrite1hPerMillion, *priceFactor)
			}
			item := upstreamMonitorModel{
				Name: name, Group: group.Name, GroupID: fmt.Sprint(group.ID), BillingType: billingType,
				RawPrice: price, PriceStatus: "unknown", PeakRateMultiplier: monitorValidNumber(group.PeakRateMultiplier),
			}
			if price.InputPerMillion != nil || price.OutputPerMillion != nil || price.PerRequest != nil {
				item.Currency = monitorString("USD")
				item.PriceStatus = "known"
			}
			for _, tier := range entry.Pricing.Intervals {
				entry := upstreamMonitorTier{
					Label: tier.Label, MinTokens: tier.MinTokens, MaxTokens: tier.MaxTokens,
					InputPerMillion: monitorMillion(tier.InputPrice), OutputPerMillion: monitorMillion(tier.OutputPrice),
					PerRequest:          monitorValidNumber(tier.PerRequestPrice),
					CacheReadPerMillion: monitorMillion(tier.CacheReadPrice), CacheWritePerMillion: monitorMillion(tier.CacheWritePrice), CacheWrite1hPerMillion: monitorMillion(tier.CacheWrite1hPrice),
				}
				if priceFactor != nil && monitorNumber(*priceFactor) != nil {
					entry.EffectiveInputPerMillion = monitorMultiply(entry.InputPerMillion, *priceFactor)
					entry.EffectiveOutputPerMillion = monitorMultiply(entry.OutputPerMillion, *priceFactor)
					entry.EffectivePerRequest = monitorMultiply(entry.PerRequest, *priceFactor)
					entry.EffectiveCacheReadPerMillion = monitorMultiply(entry.CacheReadPerMillion, *priceFactor)
					entry.EffectiveCacheWritePerMillion = monitorMultiply(entry.CacheWritePerMillion, *priceFactor)
					entry.EffectiveCacheWrite1hPerMillion = monitorMultiply(entry.CacheWrite1hPerMillion, *priceFactor)
				}
				item.Tiers = append(item.Tiers, entry)
			}
			result = append(result, item)
		}
	}
	if len(result) == 0 {
		return nil, errors.New("YYLX model plaza returned no models")
	}
	return result, nil
}

type run2000Pricing struct {
	Success    bool               `json:"success"`
	GroupRatio map[string]float64 `json:"group_ratio"`
	Data       []struct {
		Name            string   `json:"model_name"`
		QuotaType       int      `json:"quota_type"`
		ModelRatio      *float64 `json:"model_ratio"`
		ModelPrice      *float64 `json:"model_price"`
		CompletionRatio *float64 `json:"completion_ratio"`
		Groups          []string `json:"enable_groups"`
		BillingMode     string   `json:"billing_mode"`
		BillingExpr     string   `json:"billing_expr"`
	} `json:"data"`
}

// Only a constant, single request tier is equivalent to a per-request quote.
// Never use model_price as a fallback for a conditional/dynamic expression.
var monitorFixedRequest = regexp.MustCompile(`^\s*tier\(\s*"request"\s*,\s*fixed\(\s*([0-9]+(?:\.[0-9]+)?)\s*\)\s*\)\s*$`)

func monitorFixedRequestPrice(expression string) *float64 {
	match := monitorFixedRequest.FindStringSubmatch(expression)
	if len(match) != 2 {
		return nil
	}
	value, err := strconv.ParseFloat(match[1], 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return nil
	}
	return &value
}

type typeSafeInventory struct {
	Models []struct {
		Name string `json:"name"`
	} `json:"models"`
	// TypeSafe's published OpenAPI uses models/name. The data/id fallback
	// tolerates an OpenAI-compatible catalog response without guessing prices.
	Data []struct {
		ID string `json:"id"`
	} `json:"data"`
}

func parse2000Monitor(source run2000Pricing) ([]upstreamMonitorModel, error) {
	if !source.Success || len(source.Data) == 0 {
		return nil, errors.New("2000.run pricing is unavailable")
	}
	result := make([]upstreamMonitorModel, 0)
	for _, entry := range source.Data {
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			continue
		}
		groups := entry.Groups
		if len(groups) == 0 {
			groups = []string{""}
		}
		for _, group := range groups {
			price := upstreamMonitorPrice{ModelRatio: monitorValidNumber(entry.ModelRatio), CompletionRatio: monitorValidNumber(entry.CompletionRatio)}
			if ratio, ok := source.GroupRatio[group]; ok {
				price.GroupRatio = monitorNumber(ratio)
			}
			billing := "unknown"
			if entry.BillingMode == "tiered_expr" && entry.QuotaType == 1 {
				if fixed := monitorFixedRequestPrice(entry.BillingExpr); fixed != nil {
					billing = "request"
					price.PerRequest = fixed
				}
			} else if entry.BillingMode != "tiered_expr" {
				if entry.QuotaType == 1 && entry.ModelPrice != nil {
					billing = "request"
					price.PerRequest = monitorNumber(*entry.ModelPrice)
				} else if entry.QuotaType == 0 && entry.ModelRatio != nil {
					billing = "token"
					// Verified against this provider's own public pricing page:
					// gpt-5.3-codex-spark ratio 37.5, default group 1.2,
					// input $90/M and output $540/M at completion ratio 6.
					// https://api.2000.run/pricing
					price.InputPerMillion = monitorMultiply(entry.ModelRatio, 2)
					price.OutputPerMillion = monitorMultiply(price.InputPerMillion, safeRatio(entry.CompletionRatio))
				}
			}
			if price.GroupRatio != nil {
				price.EffectiveInputPerMillion = monitorMultiply(price.InputPerMillion, *price.GroupRatio)
				price.EffectiveOutputPerMillion = monitorMultiply(price.OutputPerMillion, *price.GroupRatio)
				price.EffectivePerRequest = monitorMultiply(price.PerRequest, *price.GroupRatio)
			}
			item := upstreamMonitorModel{Name: name, Group: group, BillingType: billing, RawPrice: price, PriceStatus: "unknown"}
			if price.InputPerMillion != nil || price.PerRequest != nil {
				item.PriceStatus = "known"
				item.Currency = monitorString("USD")
			}
			result = append(result, item)
		}
	}
	if len(result) == 0 {
		return nil, errors.New("2000.run pricing returned no models")
	}
	return result, nil
}

func safeRatio(value *float64) float64 {
	if value == nil || monitorNumber(*value) == nil {
		return math.NaN()
	}
	return *value
}

func parseTypeSafeMonitor(names []struct {
	Name string `json:"name"`
}) ([]upstreamMonitorModel, error) {
	if len(names) == 0 {
		return nil, errors.New("TypeSafe returned no models")
	}
	result := make([]upstreamMonitorModel, 0, len(names))
	for _, item := range names {
		if name := strings.TrimSpace(item.Name); name != "" {
			result = append(result, upstreamMonitorModel{Name: name, BillingType: "unknown", PriceStatus: "unknown"})
		}
	}
	if len(result) == 0 {
		return nil, errors.New("TypeSafe returned no model names")
	}
	return result, nil
}

func parseTypeSafeInventory(inventory typeSafeInventory) ([]upstreamMonitorModel, error) {
	if len(inventory.Models) > 0 {
		return parseTypeSafeMonitor(inventory.Models)
	}
	names := make([]struct {
		Name string `json:"name"`
	}, 0, len(inventory.Data))
	for _, item := range inventory.Data {
		names = append(names, struct {
			Name string `json:"name"`
		}{Name: item.ID})
	}
	return parseTypeSafeMonitor(names)
}

type monitorLocalRoute struct {
	Local    string
	Upstream string
}

func monitorProviderForChannel(channel *model.Channel) string {
	address := channel.GetBaseURL()
	host := ""
	if parsed, err := url.Parse(address); err == nil {
		host = strings.ToLower(parsed.Hostname())
	}
	name := strings.ToLower(channel.Name)
	switch {
	case host == "app.yylx.io" || strings.HasSuffix(host, ".yylx.io") || strings.Contains(name, "yylx"):
		return "yylx"
	case host == "api.2000.run" || strings.Contains(name, "2000.run"):
		return "2000run"
	case host == "api.typesafe.ai" || strings.Contains(name, "typesafe"):
		return "typesafe"
	default:
		return ""
	}
}

func monitorRoutes(channels []*model.Channel) (map[string][]monitorLocalRoute, *model.Channel) {
	routes := map[string][]monitorLocalRoute{"yylx": {}, "2000run": {}, "typesafe": {}}
	var typeSafeChannel *model.Channel
	for _, channel := range channels {
		if channel == nil || channel.Status != common.ChannelStatusEnabled {
			continue
		}
		provider := monitorProviderForChannel(channel)
		if provider == "" {
			continue
		}
		if provider == "typesafe" && typeSafeChannel == nil {
			parsed, err := url.Parse(channel.GetBaseURL())
			if err == nil && strings.ToLower(parsed.Hostname()) == "api.typesafe.ai" {
				typeSafeChannel = channel
			}
		}
		mapping := map[string]string{}
		if channel.ModelMapping != nil {
			_ = json.Unmarshal([]byte(*channel.ModelMapping), &mapping)
		}
		for _, local := range channel.GetModels() {
			local = strings.TrimSpace(local)
			if local == "" {
				continue
			}
			upstream := strings.TrimSpace(mapping[local])
			if upstream == "" {
				upstream = local
			}
			routes[provider] = append(routes[provider], monitorLocalRoute{Local: local, Upstream: upstream})
		}
	}
	return routes, typeSafeChannel
}

func monitorUniqueSorted(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			seen[value] = struct{}{}
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func monitorDiff(provider *upstreamMonitorProvider, routes []monitorLocalRoute) {
	// A channel's local "group" is a downstream access group, not a proven
	// upstream pricing category. Matching by model name is therefore only a
	// discovery hint; removals must never be applied automatically.
	provider.DiffScope = "model_name_only"
	provider.RemovalActionable = false
	locals := make([]string, 0, len(routes))
	upstreamLocal := make(map[string]struct{}, len(routes))
	for _, route := range routes {
		locals = append(locals, route.Local)
		upstreamLocal[route.Upstream] = struct{}{}
	}
	provider.LocalModels = monitorUniqueSorted(locals)
	if provider.Status == "error" || len(provider.Models) == 0 {
		return
	}
	remote := make(map[string]struct{})
	added := make([]string, 0)
	for _, item := range provider.Models {
		remote[item.Name] = struct{}{}
		if _, exists := upstreamLocal[item.Name]; !exists {
			added = append(added, item.Name)
		}
	}
	removed := make([]string, 0)
	for _, route := range routes {
		if _, exists := remote[route.Upstream]; !exists {
			removed = append(removed, route.Local)
		}
	}
	provider.NewModels = monitorUniqueSorted(added)
	provider.RemovedModels = monitorUniqueSorted(removed)
}

func monitorTypeSafeKey(channel *model.Channel) string {
	if channel == nil {
		return ""
	}
	// A channel name alone is not enough to identify the credential's origin.
	// Never send a key from an unrelated base URL to TypeSafe.
	parsed, err := url.Parse(channel.GetBaseURL())
	if err != nil || strings.ToLower(parsed.Hostname()) != "api.typesafe.ai" {
		return ""
	}
	// Load only the credential fields; never serialize them into the result.
	var credential model.Channel
	if err := model.DB.Select("id", "key", "channel_info").First(&credential, channel.Id).Error; err != nil {
		return ""
	}
	if !credential.ChannelInfo.IsMultiKey {
		return strings.TrimSpace(credential.Key)
	}
	for i, key := range credential.GetKeys() {
		if status, listed := credential.ChannelInfo.MultiKeyStatusList[i]; listed && status != common.ChannelStatusEnabled {
			continue
		}
		if key = monitorCleanKey(key); key != "" {
			return key
		}
	}
	return ""
}

func monitorCleanKey(value string) string {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, `"`) {
		var decoded string
		if json.Unmarshal([]byte(value), &decoded) == nil {
			return strings.TrimSpace(decoded)
		}
	}
	return value
}

func collectUpstreamMonitor(ctx context.Context, client *http.Client, channels []*model.Channel, typeSafeKey string, checkedAt time.Time, urls [3]string) upstreamMonitorSnapshot {
	routes, _ := monitorRoutes(channels)
	stamp := checkedAt.UTC().Format(time.RFC3339)
	providers := []upstreamMonitorProvider{
		{Provider: "yylx", SourceURL: urls[0], CheckedAt: &stamp, Status: "error", Models: []upstreamMonitorModel{}, NewModels: []string{}, RemovedModels: []string{}, LocalModels: []string{}, PriceChanges: []upstreamMonitorPriceChange{}},
		{Provider: "2000run", SourceURL: urls[1], CheckedAt: &stamp, Status: "error", Models: []upstreamMonitorModel{}, NewModels: []string{}, RemovedModels: []string{}, LocalModels: []string{}, PriceChanges: []upstreamMonitorPriceChange{}},
		{Provider: "typesafe", SourceURL: urls[2], CheckedAt: &stamp, Status: "partial", Models: []upstreamMonitorModel{}, NewModels: []string{}, RemovedModels: []string{}, LocalModels: []string{}, PriceChanges: []upstreamMonitorPriceChange{}},
	}
	var wait sync.WaitGroup
	for i := range providers {
		wait.Add(1)
		go func(i int) {
			defer wait.Done()
			var found []upstreamMonitorModel
			var err error
			switch i {
			case 0:
				var payload yylxPlaza
				if err = fetchUpstreamMonitorJSON(ctx, client, urls[i], "", &payload); err == nil {
					found, err = parseYYLXMonitor(payload)
				}
			case 1:
				var payload run2000Pricing
				if err = fetchUpstreamMonitorJSON(ctx, client, urls[i], "", &payload); err == nil {
					found, err = parse2000Monitor(payload)
				}
			case 2:
				if typeSafeKey == "" {
					err = errors.New("TypeSafe model inventory requires an enabled channel API key")
				} else {
					var payload typeSafeInventory
					if err = fetchUpstreamMonitorJSON(ctx, client, urls[i], typeSafeKey, &payload); err == nil {
						found, err = parseTypeSafeInventory(payload)
					}
				}
			}
			if err != nil {
				providers[i].Error = monitorString(err.Error())
				if i == 2 {
					providers[i].Status = "partial"
				}
			} else {
				providers[i].Models = found
				providers[i].Status = "ok"
				if i == 2 {
					providers[i].Notice = monitorString("Model monitoring is active. Live prices are not provided by the inventory API. Versioned IDs may remain available even when only aliases are listed; check the official documentation before disabling a model.")
				}
			}
			monitorDiff(&providers[i], routes[providers[i].Provider])
		}(i)
	}
	wait.Wait()
	return upstreamMonitorSnapshot{CheckedAt: stamp, Providers: providers}
}

func monitorSavedAt(unix int64) *string {
	if unix <= 0 {
		return nil
	}
	return monitorString(time.Unix(unix, 0).UTC().Format(time.RFC3339))
}

func monitorPriceChanges(previous, current []upstreamMonitorModel) []upstreamMonitorPriceChange {
	key := func(item upstreamMonitorModel) string {
		return item.GroupID + "\x00" + item.Group + "\x00" + item.Name
	}
	oldByKey := make(map[string]upstreamMonitorModel, len(previous))
	for _, item := range previous {
		oldByKey[key(item)] = item
	}
	changes := make([]upstreamMonitorPriceChange, 0)
	for _, item := range current {
		old, exists := oldByKey[key(item)]
		if !exists {
			continue // New models are shown separately, not treated as repricing.
		}
		tiersChanged := !reflect.DeepEqual(old.Tiers, item.Tiers)
		peakChanged := !reflect.DeepEqual(old.PeakRateMultiplier, item.PeakRateMultiplier)
		if !reflect.DeepEqual(old.RawPrice, item.RawPrice) || old.BillingType != item.BillingType || tiersChanged || peakChanged {
			changes = append(changes, upstreamMonitorPriceChange{
				Name: item.Name, Group: item.Group, GroupID: item.GroupID,
				OldBillingType: old.BillingType, NewBillingType: item.BillingType,
				OldPrice: old.RawPrice, NewPrice: item.RawPrice,
				TiersChanged: tiersChanged, PeakChanged: peakChanged,
			})
		}
	}
	sort.Slice(changes, func(a, b int) bool {
		if changes[a].GroupID != changes[b].GroupID {
			return changes[a].GroupID < changes[b].GroupID
		}
		return changes[a].Name < changes[b].Name
	})
	return changes
}

// Persist only successful, sanitized public inventories. A failed source may
// show its last successful snapshot as stale, with no removal proposals.
func persistUpstreamMonitorSnapshot(snapshot *upstreamMonitorSnapshot, checkedAt time.Time) {
	for i := range snapshot.Providers {
		provider := &snapshot.Providers[i]
		previous, err := model.GetUpstreamMonitorState(provider.Provider)
		if err != nil {
			provider.HistoryError = monitorString("Monitor history is unavailable")
			continue
		}
		state := previous
		if len(provider.Models) > 0 {
			if previous != nil {
				var old []upstreamMonitorModel
				if json.Unmarshal([]byte(previous.Summary), &old) == nil {
					provider.PriceChanges = monitorPriceChanges(old, provider.Models)
				}
			}
			models := append([]upstreamMonitorModel(nil), provider.Models...)
			sort.Slice(models, func(a, b int) bool {
				if models[a].GroupID != models[b].GroupID {
					return models[a].GroupID < models[b].GroupID
				}
				if models[a].Group != models[b].Group {
					return models[a].Group < models[b].Group
				}
				return models[a].Name < models[b].Name
			})
			encoded, err := json.Marshal(models)
			if err == nil {
				changes, marshalErr := json.Marshal(provider.PriceChanges)
				if marshalErr != nil {
					err = marshalErr
				} else {
					state, err = model.SaveUpstreamMonitorState(provider.Provider, string(encoded), string(changes), len(provider.PriceChanges) > 0, checkedAt)
				}
			}
		}
		if err != nil {
			provider.HistoryError = monitorString("Monitor history is unavailable")
			continue
		}
		if state == nil {
			continue
		}
		provider.LastSuccessAt = monitorSavedAt(state.CheckedAt)
		provider.LastChangedAt = monitorSavedAt(state.ChangedAt)
		provider.LastPriceChangedAt = monitorSavedAt(state.PriceChangedAt)
		if state.PriceChanges != "" {
			var lastChanges []upstreamMonitorPriceChange
			if json.Unmarshal([]byte(state.PriceChanges), &lastChanges) == nil {
				provider.PriceChanges = lastChanges
			}
		}
		if len(provider.Models) == 0 {
			var old []upstreamMonitorModel
			if json.Unmarshal([]byte(state.Summary), &old) == nil && len(old) > 0 {
				provider.Models = old
				provider.Stale = true
				provider.NewModels = []string{}
				provider.RemovedModels = []string{}
			}
		}
	}
}

func runUpstreamMonitor(ctx context.Context, force bool) (upstreamMonitorSnapshot, error) {
	upstreamMonitorCache.Lock()
	defer upstreamMonitorCache.Unlock()
	now := time.Now().UTC()
	age := now.Sub(upstreamMonitorCache.checked)
	if !upstreamMonitorCache.checked.IsZero() && (age < monitorRefreshFloor || (!force && age < monitorCacheTTL)) {
		result := upstreamMonitorCache.snapshot
		result.Cached = true
		return result, nil
	}
	var channels []*model.Channel
	if err := model.DB.Select("id", "name", "status", "base_url", "models", "model_mapping", "group").
		Where("status = ?", common.ChannelStatusEnabled).Find(&channels).Error; err != nil {
		return upstreamMonitorSnapshot{}, err
	}
	_, typeSafeChannel := monitorRoutes(channels)
	typeSafeKey := monitorTypeSafeKey(typeSafeChannel)
	requestCtx, cancel := context.WithTimeout(ctx, monitorFetchTimeout)
	defer cancel()
	result := collectUpstreamMonitor(requestCtx, newUpstreamMonitorClient(), channels, typeSafeKey, now,
		[3]string{monitorYYLXURL, monitor2000URL, monitorTypeSafeURL})
	persistUpstreamMonitorSnapshot(&result, now)
	upstreamMonitorCache.snapshot = result
	upstreamMonitorCache.checked = now
	return result, nil
}

// GetUpstreamMonitor never changes channels or sale prices. It stores only
// sanitized monitoring history; a failed source cannot propose a removal.
func GetUpstreamMonitor(c *gin.Context) {
	result, err := runUpstreamMonitor(c.Request.Context(), c.Query("refresh") == "1")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Could not load channel model inventory"})
		return
	}
	config, configErr := loadUpstreamSyncConfig()
	result.AutoSyncEnabled = configErr == nil && config.Enabled
	if task, taskErr := model.GetLatestSystemTask(model.SystemTaskTypeUpstreamMonitor); taskErr == nil && task != nil {
		response := task.ToResponse()
		result.AutoSyncTask = &response
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
