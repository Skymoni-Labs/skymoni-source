package model

import (
	"encoding/json"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestCompleteFlashNameSharesTheVerifiedPeriodReferences(t *testing.T) {
	for _, label := range []string{"peak", "off_peak"} {
		leaf := saleLeaf{Label: label}
		old, source, err := saleOfficialPrices("deepseek-flash", leaf, 7.3)
		require.NoError(t, err)
		alias, aliasSource, err := saleOfficialPrices("deepseek-v4.1-flash", leaf, 7.3)
		require.NoError(t, err)
		require.Equal(t, old, alias)
		require.Equal(t, source, aliasSource)
	}
}

func TestModelSaleOfficialMultiplierChangesEachComponentAndRestores(t *testing.T) {
	now, _ := setupSaleTest(t)
	name := "gpt-6-sol-token"
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", 1).Update("models", name).Error)
	var ch Channel
	require.NoError(t, DB.First(&ch, 1).Error)
	cost := map[string]any{"provider": "yylx", "source_model": name, "channel_id": 1, "channel_version": ModelSaleCostChannelVersion(ch, name), "observed_at": now.Format(time.RFC3339), "billing_type": "token", "group_ratio": .1, "input_usd_per_million": 2.0, "output_usd_per_million": 10.0}
	raw, _ := json.Marshal(map[string]any{name: []any{cost}})
	require.NoError(t, DB.Save(&Option{Key: "SkymoniUpstreamCosts", Value: string(raw)}).Error)
	// Input is official 0.17, output 0.18. One target must price both at 0.16.
	expr := `len <= 272000 ? tier("short",p*24.82+c*131.4) : tier("long",p*49.64+c*197.1)`
	mode, _ := json.Marshal(map[string]string{name: "tiered_expr"})
	ex, _ := json.Marshal(map[string]string{name: expr})
	require.NoError(t, UpdateModelPricingOptions(map[string]string{"billing_setting.billing_mode": string(mode), "billing_setting.billing_expr": string(ex)}))
	values, _, _, e := readModelPricingMaps(DB)
	require.NoError(t, e)
	cfg := ModelSaleConfig{Basis: "official", Models: []string{name}, Multipliers: map[string]float64{name: .16}, Policy: DefaultModelSalePolicy(), CountdownMode: "end"}
	q, target, e := quoteModelSaleConfig(DB, name, effectiveModelPricing(values, name), modelPricingValues(values, name), cfg, now)
	require.NoError(t, e)
	require.True(t, q.Eligible, q.Reason)
	require.InDelta(t, .17, q.CurrentMultiplier, 1e-6)
	require.InDelta(t, .18, q.MaximumCurrentMultiplier, 1e-6)
	require.Less(t, q.MinimumMultiplier, .17)
	leaves, e := saleLeaves(target["billing_setting.billing_expr"].(string))
	require.NoError(t, e)
	require.InDelta(t, 23.36, leaves[0].Prices["p"], 1e-6)
	require.InDelta(t, 116.8, leaves[0].Prices["c"], 1e-6)
	require.InDelta(t, 175.2, leaves[1].Prices["c"], 1e-6)
	cfg.Multipliers[name] = .01
	blocked, _, _ := quoteModelSaleConfig(DB, name, effectiveModelPricing(values, name), modelPricingValues(values, name), cfg, now)
	require.False(t, blocked.Eligible)
	cfg.Multipliers[name] = .16
	sale, e := CreateModelSale(ModelSaleInput{Title: "official", StartAt: now.Unix() + 60, EndAt: now.Unix() + 3600, Config: cfg}, now)
	require.NoError(t, e)
	sale, e = EnableModelSale(sale.ID, sale.Revision, now)
	require.NoError(t, e)
	fx, _ := json.Marshal(map[string]any{"usd_to_cny": 8.0, "rate_date": now.UTC().Format("2006-01-02"), "source": "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"})
	require.NoError(t, DB.Save(&Option{Key: "SkymoniReferenceFX", Value: string(fx)}).Error)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	s, e := GetModelPricingSnapshot([]string{name})
	require.NoError(t, e)
	require.Equal(t, target["billing_setting.billing_expr"], s.Entries[0].Effective["billing_setting.billing_expr"])
	require.NoError(t, TickModelSale(sale.ID, now.Add(time.Hour)))
	s, e = GetModelPricingSnapshot([]string{name})
	require.NoError(t, e)
	require.Equal(t, expr, s.Entries[0].Effective["billing_setting.billing_expr"])
}

func TestModelSaleRequestPriceUsesFiatFloorInsteadOfOfficialRatio(t *testing.T) {
	now, set := setupSaleTest(t)
	set(map[string]any{"provider": "yylx", "observed_at": now.Format(time.RFC3339), "billing_type": "request", "group_ratio": 1.0, "request_usd": .003})
	require.NoError(t, UpdateModelPricingOptions(map[string]string{"billing_setting.billing_expr": `{"sale-test":"tier(\"request\",fixed(0.38))"}`}))
	values, _, _, e := readModelPricingMaps(DB)
	require.NoError(t, e)
	cfg := ModelSaleConfig{Basis: "official", Policy: DefaultModelSalePolicy(), RequestPrices: map[string]float64{"sale-test": .035}}
	q, target, e := quoteModelSaleConfig(DB, "sale-test", effectiveModelPricing(values, "sale-test"), modelPricingValues(values, "sale-test"), cfg, now)
	require.NoError(t, e)
	require.True(t, q.Eligible, q.Reason)
	require.Equal(t, "request", q.Basis)
	require.InDelta(t, .038, q.CurrentRequestCNY, 1e-9)
	require.Less(t, q.MinimumRequestCNY, .035)
	leaves, e := saleLeaves(target["billing_setting.billing_expr"].(string))
	require.NoError(t, e)
	require.InDelta(t, .35, leaves[0].Prices["request"], 1e-9)
	cfg.RequestPrices["sale-test"] = q.MinimumRequestCNY / 2
	q, _, _ = quoteModelSaleConfig(DB, "sale-test", effectiveModelPricing(values, "sale-test"), modelPricingValues(values, "sale-test"), cfg, now)
	require.False(t, q.Eligible)
	require.Contains(t, q.Reason, "每次价格")
	cfg.Models = []string{"sale-test"}
	cfg.CountdownMode = "end"
	cfg.RequestPrices["sale-test"] = .035
	sale, e := CreateModelSale(ModelSaleInput{Title: "request", StartAt: now.Unix() + 60, EndAt: now.Unix() + 3600, Config: cfg}, now)
	require.NoError(t, e)
	sale, e = EnableModelSale(sale.ID, sale.Revision, now)
	require.NoError(t, e)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	s := saleSnapshot(t)
	l, e := saleLeaves(s.Effective["billing_setting.billing_expr"].(string))
	require.NoError(t, e)
	require.InDelta(t, .35, l[0].Prices["request"], 1e-9)
	require.NoError(t, TickModelSale(sale.ID, now.Add(time.Hour)))
	s = saleSnapshot(t)
	l, e = saleLeaves(s.Effective["billing_setting.billing_expr"].(string))
	require.NoError(t, e)
	require.InDelta(t, .38, l[0].Prices["request"], 1e-9)
}

func TestModelSaleGLMReferenceIsCNYAndDoesNotApplyUSDFXTwice(t *testing.T) {
	now, _ := setupSaleTest(t)
	name := "glm-5.3"
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", 1).Update("models", name).Error)
	var ch Channel
	require.NoError(t, DB.First(&ch, 1).Error)
	cost := map[string]any{"provider": "yylx", "source_model": name, "channel_id": 1, "channel_version": ModelSaleCostChannelVersion(ch, name), "observed_at": now.Format(time.RFC3339), "billing_type": "token", "group_ratio": .1, "input_usd_per_million": .4, "output_usd_per_million": 1.4, "cache_read_per_million": .1}
	raw, _ := json.Marshal(map[string]any{name: []any{cost}})
	require.NoError(t, DB.Save(&Option{Key: "SkymoniUpstreamCosts", Value: string(raw)}).Error)
	mode, _ := json.Marshal(map[string]string{name: "tiered_expr"})
	ex, _ := json.Marshal(map[string]string{name: `tier("base",p*16+c*56+cr*4)`})
	require.NoError(t, UpdateModelPricingOptions(map[string]string{"billing_setting.billing_mode": string(mode), "billing_setting.billing_expr": string(ex)}))
	v, _, _, e := readModelPricingMaps(DB)
	require.NoError(t, e)
	cfg := ModelSaleConfig{Basis: "official", Policy: DefaultModelSalePolicy(), Multipliers: map[string]float64{name: .15}}
	q, target, e := quoteModelSaleConfig(DB, name, effectiveModelPricing(v, name), modelPricingValues(v, name), cfg, now)
	require.NoError(t, e)
	require.True(t, q.Eligible, q.Reason)
	require.InDelta(t, .2, q.CurrentMultiplier, 1e-9)
	require.Equal(t, 8.0, q.OfficialPrices["base"]["p"])
	l, e := saleLeaves(target["billing_setting.billing_expr"].(string))
	require.NoError(t, e)
	require.InDelta(t, 12.0, l[0].Prices["p"], 1e-9)
	require.InDelta(t, 42.0, l[0].Prices["c"], 1e-9)
}

func TestModelSaleFlatRequestPriceReportsAndAppliesCNYTarget(t *testing.T) {
	now, set := setupSaleTest(t)
	set(map[string]any{"provider": "yylx", "observed_at": now.Format(time.RFC3339), "billing_type": "request", "group_ratio": 1.0, "request_usd": .003})
	require.NoError(t, UpdateModelPricingOptions(map[string]string{"billing_setting.billing_mode": `{}`, "billing_setting.billing_expr": `{}`, "ModelPrice": `{"sale-test":0.38}`}))
	v, _, _, e := readModelPricingMaps(DB)
	require.NoError(t, e)
	cfg := ModelSaleConfig{Basis: "official", Policy: DefaultModelSalePolicy(), RequestPrices: map[string]float64{"sale-test": .035}}
	q, target, e := quoteModelSaleConfig(DB, "sale-test", effectiveModelPricing(v, "sale-test"), modelPricingValues(v, "sale-test"), cfg, now)
	require.NoError(t, e)
	require.True(t, q.Eligible, q.Reason)
	require.InDelta(t, .35, target["ModelPrice"], 1e-9)
	require.Len(t, q.Lines, 1)
	require.InDelta(t, .035, q.Lines[0].TargetCNY, 1e-9)
}
