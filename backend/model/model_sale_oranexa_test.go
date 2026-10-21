package model

import (
	"encoding/json"
	"fmt"
	"github.com/stretchr/testify/require"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestOranexaSeparatePeriodCostsAndLifecycle(t *testing.T) {
	for _, spec := range []struct {
		name                    string
		group, original, target float64
		weekdays                bool
	}{
		{"deepseek-v4-pro", .09, .15, .10, false},
		{"deepseek-flash", .09, .15, .14, false},
		{"deepseek-v4.1-flash-low", .06, .10, .09, true},
	} {
		t.Run(spec.name, func(t *testing.T) {
			now, _ := setupSaleTest(t)
			path := filepath.Join(t.TempDir(), "costs.json")
			require.NoError(t, os.WriteFile(path, []byte(`{"costs":{"oranexa":1.02}}`), 0600))
			t.Setenv("SKYMONI_UPSTREAM_SYNC_CONFIG", path)
			url := "https://oranexa.top"
			require.NoError(t, DB.Model(&Channel{}).Where("id=1").Updates(map[string]any{"models": spec.name, "base_url": url}).Error)
			var ch Channel
			require.NoError(t, DB.First(&ch, 1).Error)
			clock := ModelSaleCostTimePricing{Timezone: "Asia/Shanghai", WeekdaysOnly: spec.weekdays, Periods: []ModelSaleCostTimePeriod{{"09:00:00", "12:00:00", 2}, {"14:00", "18:00", 2}}}
			condition, _, err := clock.Condition()
			require.NoError(t, err)
			ref, _, err := saleOfficialPrices(spec.name, saleLeaf{Label: "off_peak"}, 7.3)
			require.NoError(t, err)
			f := spec.original / .1
			expression := fmt.Sprintf(`%s ? tier("peak",p*%.12f+c*%.12f+cr*%.12f) : tier("off_peak",p*%.12f+c*%.12f+cr*%.12f)`, condition, ref["p"]*f*2, ref["c"]*f*2, ref["cr"]*f*2, ref["p"]*f, ref["c"]*f, ref["cr"]*f)
			modes, _ := json.Marshal(map[string]string{spec.name: "tiered_expr"})
			expressions, _ := json.Marshal(map[string]string{spec.name: expression})
			require.NoError(t, UpdateModelPricingOptions(map[string]string{"billing_setting.billing_mode": string(modes), "billing_setting.billing_expr": string(expressions)}))
			cost := map[string]any{"provider": "oranexa", "source": "https://oranexa.top/api/v1/model-plaza", "channel_id": 1, "channel_version": ModelSaleCostChannelVersion(ch, spec.name), "source_model": spec.name, "observed_at": now.Format(time.RFC3339), "billing_type": "token", "group_ratio": spec.group, "input_usd_per_million": 1., "output_usd_per_million": 4., "cache_read_per_million": .02, "cache_write_per_million": 0., "cache_write_1h_per_million": 0., "time_pricing": clock}
			set := func() {
				raw, _ := json.Marshal(map[string]any{spec.name: []any{cost}})
				require.NoError(t, DB.Save(&Option{Key: "SkymoniUpstreamCosts", Value: string(raw)}).Error)
			}
			set()
			policy := DefaultModelSalePolicy()
			policy.MinimumMargin = 15
			cfg := ModelSaleConfig{Basis: "official", Models: []string{spec.name}, Multipliers: map[string]float64{spec.name: spec.target}, Policy: policy, CountdownMode: "end"}
			check := func() ModelSaleQuote {
				values, _, _, e := readModelPricingMaps(DB)
				require.NoError(t, e)
				q, _, _ := quoteModelSaleConfig(DB, spec.name, effectiveModelPricing(values, spec.name), modelPricingValues(values, spec.name), cfg, now)
				return q
			}
			q := check()
			require.True(t, q.Eligible, q.Reason)
			require.Less(t, q.MinimumMultiplier, spec.target)
			require.Greater(t, q.Margin, 15.)
			for _, line := range q.Lines {
				if line.Component == "p" {
					expected := spec.group * 1.02
					if line.Tier == "peak" {
						expected *= 2
					}
					require.InDelta(t, expected, line.CostCNY, 1e-10)
				}
			}
			wrong := clock
			wrong.WeekdaysOnly = !wrong.WeekdaysOnly
			cost["time_pricing"] = wrong
			set()
			q = check()
			require.False(t, q.Eligible)
			require.Contains(t, q.Reason, "时段与上游不一致")
			cost["time_pricing"] = clock
			cost["group_ratio"] = spec.group * 10
			set()
			require.False(t, check().Eligible)
			cost["group_ratio"] = spec.group
			cost["observed_at"] = now.Add(-49 * time.Hour).Format(time.RFC3339)
			set()
			require.False(t, check().Eligible)
			cost["observed_at"] = now.Format(time.RFC3339)
			set()
			before := saleSnapshotForName(t, spec.name)
			sale, err := CreateModelSale(ModelSaleInput{Title: "DeepSeek period sale", StartAt: now.Unix() + 60, EndAt: now.Unix() + 3600, Config: cfg}, now)
			require.NoError(t, err)
			sale, err = EnableModelSale(sale.ID, sale.Revision, now)
			require.NoError(t, err)
			require.Equal(t, "scheduled", sale.Status)
			require.Equal(t, before.Version, saleSnapshotForName(t, spec.name).Version)
			require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
			active := saleSnapshotForName(t, spec.name)
			require.NotEqual(t, before.Version, active.Version)
			changed, err := UpdateAutomaticModelPricing([]ModelPricingChange{{ModelName: spec.name, ExpectedVersion: active.Version, Pricing: before.Configured}})
			require.NoError(t, err)
			require.Empty(t, changed)
			require.NoError(t, TickModelSale(sale.ID, now.Add(time.Hour)))
			require.Equal(t, before.Configured, saleSnapshotForName(t, spec.name).Configured)
		})
	}
}
func saleSnapshotForName(t *testing.T, name string) ModelPricingEntry {
	s, e := GetModelPricingSnapshot([]string{name})
	require.NoError(t, e)
	require.Len(t, s.Entries, 1)
	return s.Entries[0]
}

func TestCostRefreshPreservesOtherProviderNewerSnapshot(t *testing.T) {
	_, _ = setupSaleTest(t)
	require.NoError(t, StoreModelSaleCosts(`{"ds":[{"provider":"oranexa","observed_at":"new"}]}`, "oranexa"))
	require.NoError(t, StoreModelSaleCosts(`{"ds":[{"provider":"oranexa","observed_at":"old"}],"gpt":[{"provider":"yylx","observed_at":"new"}]}`, ""))
	require.NoError(t, StoreModelSaleCosts(`{"ds":[{"provider":"oranexa","observed_at":"newer"}],"gpt":[{"provider":"yylx","observed_at":"old"}]}`, "oranexa"))
	var o Option
	require.NoError(t, DB.First(&o, "key = ?", "SkymoniUpstreamCosts").Error)
	var data map[string][]map[string]any
	require.NoError(t, json.Unmarshal([]byte(o.Value), &data))
	require.Equal(t, "newer", data["ds"][0]["observed_at"])
	require.Equal(t, "new", data["gpt"][0]["observed_at"])
}
