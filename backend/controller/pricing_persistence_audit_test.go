package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/require"
)

type pricingAuditTransport func(*http.Request) (*http.Response, error)

func pricingAuditDialect() string {
	if os.Getenv("PRICING_AUDIT_POSTGRES_DSN") != "" {
		return "postgres"
	}
	return "sqlite"
}

func (f pricingAuditTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func auditPrice(t *testing.T, name string) model.ModelPricingEntry {
	t.Helper()
	snapshot, err := model.GetModelPricingSnapshot([]string{name})
	require.NoError(t, err)
	require.Len(t, snapshot.Entries, 1)
	return snapshot.Entries[0]
}

func auditSavePrice(t *testing.T, name string, price model.PricingValues) {
	t.Helper()
	entry := auditPrice(t, name)
	var response struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	w := modelManagementRequest(t, UpdateModelPricingConfig, http.MethodPatch, "/api/option/model_pricing", map[string]any{
		"changes": []model.ModelPricingChange{{ModelName: name, ExpectedVersion: entry.Version, Pricing: price}},
	}, &response)
	require.Equal(t, http.StatusOK, w.Code)
	require.True(t, response.Success, response.Message)
	require.Equal(t, price, auditPrice(t, name).Configured)
}

func auditSyncFixture(t *testing.T, name string, cfg upstreamSyncConfig) upstreamMonitorSnapshot {
	t.Helper()
	db := modelManagementDB(t, pricingAuditDialect(), os.Getenv("PRICING_AUDIT_POSTGRES_DSN"))
	metadata := model.Model{ModelName: name, Status: 1, SyncOfficial: 0}
	require.NoError(t, db.Create(&metadata).Error)
	// GORM applies the column's default 1 during Create when an int is zero.
	// Persist the disabled state explicitly, as the actual management API does.
	require.NoError(t, db.Model(&metadata).Update("sync_official", 0).Error)
	base := "https://app.yylx.io"
	channel := model.Channel{Name: "Isolated pricing audit", Type: 1, Key: "test-key", Group: "default", Status: common.ChannelStatusEnabled, Models: name, BaseURL: &base}
	require.NoError(t, db.Create(&channel).Error)
	if len(cfg.Bindings) != 0 {
		cfg.Bindings[0].ChannelID = channel.Id
	}
	data, err := json.Marshal(cfg)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "upstream-sync.json")
	require.NoError(t, os.WriteFile(path, data, 0600))
	t.Setenv("SKYMONI_UPSTREAM_SYNC_CONFIG", path)
	beforeTransport := http.DefaultTransport
	// Intercept ALL outgoing HTTP. No real upstream requests or model calls.
	http.DefaultTransport = pricingAuditTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != base+"/v1/models" {
			return nil, fmt.Errorf("unexpected isolated-test request")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"data":[{"id":"` + name + `"}]}`)), Request: r}, nil
	})
	t.Cleanup(func() { http.DefaultTransport = beforeTransport })
	return upstreamMonitorSnapshot{Providers: []upstreamMonitorProvider{{Provider: "yylx", Status: "ok", Models: []upstreamMonitorModel{
		{Name: name, GroupID: "8", BillingType: "token", PriceStatus: "known", RawPrice: upstreamMonitorPrice{EffectiveInputPerMillion: monitorNumber(.2), EffectiveOutputPerMillion: monitorNumber(1)}},
	}}}}
}

func auditSyncPolicy() upstreamSyncConfig {
	return upstreamSyncConfig{Enabled: true, NetCNYPerDollar: .1, Costs: map[string]float64{"yylx": 6.72}, Margins: map[string]float64{"yylx": .05}, Bindings: []upstreamSyncBinding{{Provider: "yylx", Group: "8"}}}
}

// Regression coverage for manual prices and automatic updates in isolated databases.
func TestPricingAuditManualSaveSurvivesFixedSync(t *testing.T) {
	name := "gemini-3.8-flash"
	cfg := auditSyncPolicy()
	cfg.PricingOverrides = map[string]string{name: `tier("request", fixed(0.5))`}
	snapshot := auditSyncFixture(t, name, cfg)
	manual := model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `tier("request", fixed(0.7))`}
	auditSavePrice(t, name, manual)
	model.InitOptionMap()
	require.Equal(t, manual, auditPrice(t, name).Configured, "a normal config reload must retain manual pricing")
	result, err := runUpstreamSync(context.Background(), snapshot)
	require.NoError(t, err)
	require.NotContains(t, result.Repriced, name)
	require.Contains(t, result.PreservedManual, name)
	require.Equal(t, manual, auditPrice(t, name).Configured)
	var metadata model.Model
	require.NoError(t, model.DB.Where("model_name = ?", name).First(&metadata).Error)
	require.Equal(t, 0, metadata.SyncOfficial, "metadata sync is disabled, but pricing still reverted")

	protected := auditPrice(t, name)
	require.Equal(t, model.ModelPricingSourceManual, protected.PricingSource)
	require.NoError(t, model.UpdateModelPricing([]model.ModelPricingChange{{ModelName: name, ExpectedVersion: protected.Version, PricingSource: model.ModelPricingSourceUpstream}}))
	resumed, err := runUpstreamSync(context.Background(), snapshot)
	require.NoError(t, err)
	require.Contains(t, resumed.Repriced, name)
	require.Equal(t, cfg.PricingOverrides[name], auditPrice(t, name).Configured["billing_setting.billing_expr"])
	require.Equal(t, model.ModelPricingSourceUpstream, auditPrice(t, name).PricingSource)
	// A following unchanged sync is idempotent.
	repeated, err := runUpstreamSync(context.Background(), snapshot)
	require.NoError(t, err)
	require.Empty(t, repeated.Repriced)

}

func TestPricingAuditManualLegacyModeSurvivesSync(t *testing.T) {
	name := "audit-synced-model"
	cfg := auditSyncPolicy()
	snapshot := auditSyncFixture(t, name, cfg)
	manual := model.PricingValues{"ModelPrice": .42}
	auditSavePrice(t, name, manual)
	result, err := runUpstreamSync(context.Background(), snapshot)
	require.NoError(t, err)
	require.NotContains(t, result.Repriced, name)
	require.Equal(t, manual, auditPrice(t, name).Configured)

}

func TestPricingAuditControlsPreserveManualPrice(t *testing.T) {
	for _, condition := range []string{"disabled", "dry_run", "stale_quote", "unknown_price", "unbound_model"} {
		t.Run(condition, func(t *testing.T) {
			name := "audit-controls"
			cfg := auditSyncPolicy()
			if condition == "disabled" {
				cfg.Enabled = false
			}
			if condition == "dry_run" {
				cfg.DryRun = true
			}
			if condition == "unbound_model" {
				cfg.Bindings = nil
			}
			snapshot := auditSyncFixture(t, name, cfg)
			if condition == "stale_quote" {
				snapshot.Providers[0].Stale = true
			}
			if condition == "unknown_price" {
				snapshot.Providers[0].Models[0].RawPrice = upstreamMonitorPrice{}
			}
			manual := model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `tier("request", fixed(0.7))`}
			auditSavePrice(t, name, manual)
			before := auditPrice(t, name)
			require.NoError(t, model.UpdateModelPricing([]model.ModelPricingChange{{ModelName: name, ExpectedVersion: before.Version, PricingSource: model.ModelPricingSourceUpstream}}))
			result, err := runUpstreamSync(context.Background(), snapshot)
			require.NoError(t, err)
			require.Equal(t, manual, auditPrice(t, name).Configured)
			if condition == "dry_run" {
				require.Contains(t, result.Repriced, name)
			} else {
				require.Empty(t, result.Repriced)
			}
		})
	}
}

func TestPricingAuditUnboundFXOverridePreservesManualPrice(t *testing.T) {
	name := "jev-latest"
	cfg := auditSyncPolicy()
	cfg.Bindings = nil
	cfg.PricingOverrides = map[string]string{name: `tier("base", p * 10)`}
	cfg.FXAdjustedOverrides = []string{name}
	cfg.FXOverrideBasis = 7
	snapshot := auditSyncFixture(t, name, cfg)
	manual := model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `tier("base", p * 20)`}
	auditSavePrice(t, name, manual)
	quote, err := json.Marshal(referenceFXQuote{USDToCNY: 7, RateDate: time.Now().UTC().Format("2006-01-02"), Checked: time.Now(), Source: referenceFXSource})
	require.NoError(t, err)
	require.NoError(t, model.UpdateOption(referenceFXOption, string(quote)))
	result, err := runUpstreamSync(context.Background(), snapshot)
	require.NoError(t, err)
	require.NotContains(t, result.Repriced, name)
	require.Equal(t, manual, auditPrice(t, name).Configured)
}

func TestPricingAuditZeroAndModeSwitchSurviveReload(t *testing.T) {
	db := modelManagementDB(t, pricingAuditDialect(), os.Getenv("PRICING_AUDIT_POSTGRES_DSN"))
	name := "audit-manual-only"
	require.NoError(t, db.Create(&model.Model{ModelName: name, Status: 1}).Error)
	for _, pricing := range []model.PricingValues{
		{"ModelPrice": 0.0},
		{"ModelRatio": .15, "CompletionRatio": 3.0, "CacheRatio": 0.0},
		{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `tier("request", fixed(0.7))`},
	} {
		auditSavePrice(t, name, pricing)
		model.InitOptionMap()
		require.Equal(t, pricing, auditPrice(t, name).Configured)
	}
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(ratio_setting.ModelPrice2JSONString()))
}

func TestPricingAuditStaleLegacyWholeMapIsRejected(t *testing.T) {
	db := modelManagementDB(t, pricingAuditDialect(), os.Getenv("PRICING_AUDIT_POSTGRES_DSN"))
	name := "audit-bulk-stale"
	require.NoError(t, db.Create(&model.Model{ModelName: name, Status: 1}).Error)
	auditSavePrice(t, name, model.PricingValues{"ModelPrice": .5})
	snapshot, err := model.GetModelPricingSnapshot([]string{name})
	require.NoError(t, err)
	oldMap := snapshot.Options["ModelPrice"]
	auditSavePrice(t, name, model.PricingValues{"ModelPrice": .7})
	// The legacy whole-map endpoint validates values but has no client version.

	require.ErrorIs(t, model.UpdateModelPricingOptionsVersioned(map[string]string{"ModelPrice": oldMap}, snapshot.OptionsVersion), model.ErrModelPricingConflict)
	require.Equal(t, .7, auditPrice(t, name).Configured["ModelPrice"])
	var response struct {
		Success bool `json:"success"`
	}
	w := modelManagementRequest(t, UpdateOption, http.MethodPut, "/api/option/", OptionUpdateRequest{Key: "ModelPrice", Value: oldMap}, &response)
	require.Equal(t, http.StatusConflict, w.Code)
	require.False(t, response.Success)
	require.Equal(t, .7, auditPrice(t, name).Configured["ModelPrice"])
	fresh, err := model.GetModelPricingSnapshot([]string{name})
	require.NoError(t, err)
	require.NoError(t, model.UpdateModelPricingOptionsVersioned(map[string]string{"ModelPrice": oldMap}, fresh.OptionsVersion))
	require.Equal(t, .5, auditPrice(t, name).Configured["ModelPrice"])
	require.Equal(t, model.ModelPricingSourceManual, auditPrice(t, name).PricingSource)

}

func TestPricingAuditManualSourceBlocksAlreadyPreparedAutomaticWrite(t *testing.T) {
	db := modelManagementDB(t, pricingAuditDialect(), os.Getenv("PRICING_AUDIT_POSTGRES_DSN"))
	const name = "audit-race"
	require.NoError(t, db.Create(&model.Model{ModelName: name, Status: 1}).Error)
	before := auditPrice(t, name)
	applied, err := model.UpdateAutomaticModelPricing([]model.ModelPricingChange{{ModelName: name, ExpectedVersion: before.Version, Pricing: model.PricingValues{"ModelPrice": .5}}})
	require.NoError(t, err)
	require.Equal(t, []string{name}, applied)
	automatic := auditPrice(t, name)
	require.Equal(t, model.ModelPricingSourceUpstream, automatic.PricingSource)
	// Same amount, but the administrator explicitly fixes its source.
	require.NoError(t, model.UpdateModelPricing([]model.ModelPricingChange{{ModelName: name, ExpectedVersion: automatic.Version, Pricing: automatic.Configured}}))
	fixed := auditPrice(t, name)
	require.NotEqual(t, automatic.Version, fixed.Version)
	applied, err = model.UpdateAutomaticModelPricing([]model.ModelPricingChange{{ModelName: name, ExpectedVersion: automatic.Version, Pricing: model.PricingValues{"ModelPrice": .1}}})
	require.NoError(t, err)
	require.Empty(t, applied)
	require.Equal(t, .5, auditPrice(t, name).Configured["ModelPrice"])
	// A stale UI cannot silently release the newer manual source.
	require.ErrorIs(t, model.UpdateModelPricing([]model.ModelPricingChange{{ModelName: name, ExpectedVersion: automatic.Version, PricingSource: model.ModelPricingSourceUpstream}}), model.ErrModelPricingConflict)
}

func TestPricingAuditAutomaticBatchSkipsOnlyManuallyFixedModels(t *testing.T) {
	modelManagementDB(t, pricingAuditDialect(), os.Getenv("PRICING_AUDIT_POSTGRES_DSN"))
	manual, automatic := "audit-fixed", "audit-auto"
	auditSavePrice(t, manual, model.PricingValues{"ModelPrice": .7})
	fixed, before := auditPrice(t, manual), auditPrice(t, automatic)
	applied, err := model.UpdateAutomaticModelPricing([]model.ModelPricingChange{
		{ModelName: manual, ExpectedVersion: fixed.Version, Pricing: model.PricingValues{"ModelPrice": .2}},
		{ModelName: automatic, ExpectedVersion: before.Version, Pricing: model.PricingValues{"ModelPrice": .3}},
	})
	require.NoError(t, err)
	require.Equal(t, []string{automatic}, applied)
	require.Equal(t, .7, auditPrice(t, manual).Configured["ModelPrice"])
	require.Equal(t, .3, auditPrice(t, automatic).Configured["ModelPrice"])
	require.Equal(t, model.ModelPricingSourceUpstream, auditPrice(t, automatic).PricingSource)
}
