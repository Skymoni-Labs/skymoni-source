package controller

import (
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/stretchr/testify/require"
)

func TestUpstreamSyncPrices(t *testing.T) {
	factor := 6.72 / (999.0 / 11000 * .982) / .95
	item := upstreamMonitorModel{Name: "gpt-6-sol", BillingType: "token", PriceStatus: "known", RawPrice: upstreamMonitorPrice{EffectiveInputPerMillion: monitorNumber(.2), EffectiveOutputPerMillion: monitorNumber(1), EffectiveCacheReadPerMillion: monitorNumber(.02)}}
	expr, err := upstreamSyncExpression(item, "yylx", factor)
	require.NoError(t, err)
	require.Contains(t, expr, "p * 15.863221")
	require.NoError(t, model.ValidateModelPricing("sync-fixture", model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expr}))
	item.PeakRateMultiplier = monitorNumber(2)
	_, err = upstreamSyncExpression(item, "yylx", factor)
	require.Error(t, err)
	item.PeakRateMultiplier = nil
	item.RawPrice.EffectiveInputPerMillion = nil
	_, err = upstreamSyncExpression(item, "yylx", factor)
	require.Error(t, err)
	for _, name := range []string{"gpt-4o", "gpt-5", "gpt-5.4", "gpt-5.2-codex"} {
		require.True(t, syncHiddenModel(name), name)
	}
	for _, name := range []string{"gpt-5.5", "gpt-6-sol", "gpt-image-2", "claude-opus-4-6", "codex-auto-review"} {
		require.False(t, syncHiddenModel(name), name)
	}
}

func TestUpstreamSyncModelAllowlist(t *testing.T) {
	binding := upstreamSyncBinding{Allowed: []string{"gpt-6-sol"}}
	require.True(t, binding.allowsModel("gpt-6-sol"))
	require.False(t, binding.allowsModel("gpt-6-terra"))
	binding.Excluded = []string{"gpt-6-sol"}
	require.False(t, binding.allowsModel("gpt-6-sol"))
	require.True(t, (upstreamSyncBinding{}).allowsModel("gpt-6-terra"))
}

func TestFixedRequestOverrideSurvivesUpstreamTokenPricesAndFX(t *testing.T) {
	const name = "gemini-3.8-flash-token"
	const fixed = `tier("request", fixed(0.5))`
	cfg := upstreamSyncConfig{PricingOverrides: map[string]string{name: fixed}}
	for _, fx := range []float64{4, 6.713, 7.3, 10} {
		expr := syncConfiguredExpressionAtFX(cfg, name, `tier("token", p * 20 + c * 100)`, fx)
		require.Equal(t, fixed, expr)
		for _, tokens := range []float64{0, 100, 16384} {
			amount, _, err := billingexpr.RunExpr(expr, billingexpr.TokenParams{P: tokens, C: tokens})
			require.NoError(t, err)
			// fixed() produces the engine's per-million unit for settlement.
			require.Equal(t, 500000.0, amount)
		}
	}
}

func TestUpstreamSyncPublishedFixture(t *testing.T) {
	data, err := os.ReadFile("../moni/verification/upstream-sync-fixture.json")
	require.NoError(t, err)
	var snapshot upstreamMonitorSnapshot
	require.NoError(t, common.Unmarshal(data, &snapshot))
	accepted, pending := 0, 0
	for _, provider := range snapshot.Providers {
		if provider.Provider != "yylx" {
			continue
		}
		for _, item := range provider.Models {
			expr, err := upstreamSyncExpression(item, "yylx", 6.72/(999.0/11000*.982)/.95)
			if err != nil {
				pending++
				t.Log(item.Name, err)
				continue
			}
			require.NoError(t, model.ValidateModelPricing(item.Name+"-fixture", model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expr}), item.Name)
			if strings.Contains(item.Name, "image") {
				require.Contains(t, expr, "4K")
			}
			accepted++
		}
	}
	t.Logf("validated %d, pending %d", accepted, pending)
	require.Greater(t, accepted, 10)
}

func TestUpstreamSyncOfficialPricingOverrides(t *testing.T) {
	data, err := os.ReadFile("../moni/upstream-sync.production.json")
	require.NoError(t, err)
	var cfg upstreamSyncConfig
	require.NoError(t, common.Unmarshal(data, &cfg))
	require.Len(t, cfg.PricingOverrides, 9)
	require.Len(t, cfg.FXAdjustedOverrides, 9)
	for alias, expr := range cfg.PricingOverrides {
		require.Equal(t, expr, syncConfiguredExpression(cfg, alias, "changed upstream price"))
		require.Equal(t, "upstream", syncConfiguredExpression(cfg, alias+"-pro", "upstream"))
		if strings.HasPrefix(alias, "gpt-") {
			require.NoError(t, model.ValidateModelPricing(alias, model.PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expr}))
		}
	}
	require.Equal(t, "upstream", syncConfiguredExpression(cfg, "codex-auto-review-token", "upstream"))
	require.Contains(t, cfg.PricingOverrides["gpt-6-astra-token"], "p * 124.1 + c * 620.5")
	require.Contains(t, cfg.PricingOverrides["gpt-5.5-token"], "p * 124.1 + c * 558.45")
	adjusted := syncConfiguredExpressionAtFX(cfg, "gpt-6-astra-token", "upstream", 6.713233)
	require.Contains(t, adjusted, "p * 114.124961")
	require.Contains(t, adjusted, "c * 570.624805")
	strict := syncConfiguredExpressionAtFX(cfg, "gpt-6-astra-token", "tier(\"standard\", p * 100 + c * 600)", 6.713233)
	require.Contains(t, strict, "p * 114.124961")
	require.Contains(t, strict, "c * 570.624805")
	jev := syncConfiguredExpressionAtFX(cfg, "jev-latest", "upstream", 6.713233)
	require.Contains(t, jev, `u("input_tokens") * 2.819558`)
	require.Contains(t, jev, `u("output_tokens") * 0`)
}

func TestOfficial017BillingAmount(t *testing.T) {
	data, err := os.ReadFile("../moni/upstream-sync.production.json")
	require.NoError(t, err)
	var cfg upstreamSyncConfig
	require.NoError(t, common.Unmarshal(data, &cfg))
	official := map[string][3]float64{"gpt-6-astra-token": {10, 50, 1}, "gpt-6.1-sol-token": {2, 10, .1}, "gpt-5.6-sol-token": {4, 20, .4}, "gpt-5.5-token": {5, 30, .5}, "gpt-5.6-terra-token": {2, 12, .2}, "gpt-6-sol-token": {2, 10, .2}}
	for name, rates := range official {
		for _, length := range []float64{272000, 272001} {
			inFactor, outFactor := 1.0, 1.0
			if length > 272000 {
				inFactor, outFactor = 2, 1.5
			}
			params := billingexpr.TokenParams{P: 1000, C: 250, CR: 100, Len: length}
			amount, _, err := billingexpr.RunExpr(cfg.PricingOverrides[name], params)
			require.NoError(t, err)
			want := (rates[0]*inFactor*1000 + rates[2]*inFactor*100 + rates[1]*outFactor*250) * .17 * 73
			require.InDelta(t, want, amount, 1e-6, name)
		}
	}
}

func TestYYLXDailyFXKeepsStrictOfficial017AcrossGPTPriceComponents(t *testing.T) {
	data, err := os.ReadFile("../moni/upstream-sync.production.json")
	require.NoError(t, err)
	var cfg upstreamSyncConfig
	require.NoError(t, common.Unmarshal(data, &cfg))
	data, err = os.ReadFile("../moni/verification/upstream-sync-fixture.json")
	require.NoError(t, err)
	var snapshot upstreamMonitorSnapshot
	require.NoError(t, common.Unmarshal(data, &snapshot))
	fx := 7.6551 / 1.1403
	net := cfg.NetCNYPerDollar
	cost := 6.72
	factor := cost / net / (1 - cfg.Margins["yylx"])
	official := map[string][5]float64{
		"gpt-6-astra-token":   {10, 50, 1, 12.5, 12.5},
		"gpt-6-sol-token":     {2, 10, .2, 2.5, 2.5},
		"gpt-5.6-sol-token":   {4, 20, .4, 5, 5},
		"gpt-5.6-terra-token": {2, 12, .2, 2.5, 2.5},
		"gpt-5.5-token":       {5, 30, .5, 0, 0},
	}
	checked := 0
	for _, provider := range snapshot.Providers {
		if provider.Provider != "yylx" {
			continue
		}
		for _, item := range provider.Models {
			if item.GroupID != "8" || !slices.Contains(cfg.FXAdjustedOverrides, item.Name+"-token") {
				continue
			}
			generated, err := upstreamSyncExpression(item, "yylx", factor)
			require.NoError(t, err)
			adjusted := syncConfiguredExpressionAtFX(cfg, item.Name+"-token", generated, fx)
			for _, length := range []float64{1000, 272001} {
				for index, params := range []billingexpr.TokenParams{
					{P: 1, Len: length}, {C: 1, Len: length},
					{CR: 1, Len: length}, {CC: 1, Len: length},
					{CC1h: 1, Len: length},
				} {
					actual, _, err := billingexpr.RunExpr(adjusted, params)
					require.NoError(t, err)
					multiplier := 1.0
					if length > 272000 {
						if index == 1 {
							multiplier = 1.5
						} else {
							multiplier = 2
						}
					}
					want := official[item.Name+"-token"][index] * multiplier * .17 * fx / .1
					require.InDelta(t, want, actual, 0.000002, "%s, len=%v, params=%+v", item.Name, length, params)
				}
			}
			checked++
		}
	}
	require.Equal(t, 5, checked)
}
