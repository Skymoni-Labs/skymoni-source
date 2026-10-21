package model

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"os"
	"strings"
	"testing"
	"time"
)

func setupSaleTest(t *testing.T) (time.Time, func(map[string]any)) {
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/sales.db"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(5)
	old, typ := DB, common.MainDatabaseType()
	oldOptions := common.OptionMap
	common.OptionMap = map[string]string{}
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	initCol()
	t.Cleanup(func() {
		DB = old
		common.OptionMap = oldOptions
		common.SetMainDatabaseType(typ)
		initCol()
		sqlDB.Close()
	})
	require.NoError(t, db.AutoMigrate(&Option{}, &Channel{}, &ModelSale{}, &Model{}, &Vendor{}, &Ability{}))
	now := time.Now().Truncate(time.Second)
	url := "https://api.yylx.io"
	require.NoError(t, db.Create(&Channel{Id: 1, Status: 1, Key: "test", BaseURL: &url, Models: "sale-test", Group: "default"}).Error)
	require.NoError(t, db.Create(&Option{Key: "GroupRatio", Value: `{"default":1}`}).Error)
	cost := map[string]any{"provider": "yylx", "observed_at": now.Format(time.RFC3339), "billing_type": "token", "group_ratio": 1.0, "input_usd_per_million": 1.0, "output_usd_per_million": 2.0}
	set := func(c map[string]any) {
		var current Channel
		require.NoError(t, db.First(&current, 1).Error)
		upstream, _ := c["source_model"].(string)
		if upstream == "" {
			upstream = "sale-test"
			c["source_model"] = upstream
		}
		c["channel_id"] = 1
		c["channel_version"] = ModelSaleCostChannelVersion(current, upstream)

		raw, _ := json.Marshal(map[string]any{"sale-test": []any{c}})
		require.NoError(t, db.Save(&Option{Key: "SkymoniUpstreamCosts", Value: string(raw)}).Error)
	}
	set(cost)
	require.NoError(t, UpdateModelPricingOptions(map[string]string{"billing_setting.billing_mode": `{"sale-test":"tiered_expr"}`, "billing_setting.billing_expr": `{"sale-test":"tier(\"standard\",p*200+c*400)"}`}))
	return now, set
}
func saleInput(now time.Time) ModelSaleInput {
	return ModelSaleInput{Title: "safe sale", StartAt: now.Unix() + 60, EndAt: now.Unix() + 3600, Config: ModelSaleConfig{Models: []string{"sale-test"}, Discount: 5, Policy: DefaultModelSalePolicy(), CountdownMode: "end"}}
}
func saleSnapshot(t *testing.T) ModelPricingEntry {
	s, e := GetModelPricingSnapshot([]string{"sale-test"})
	require.NoError(t, e)
	return s.Entries[0]
}
func TestModelSaleLifecycleAndManualConflict(t *testing.T) {
	now, _ := setupSaleTest(t)
	before := saleSnapshot(t)
	sale, e := CreateModelSale(saleInput(now), now)
	require.NoError(t, e)
	require.Equal(t, before.Version, saleSnapshot(t).Version)
	sale, e = EnableModelSale(sale.ID, sale.Revision, now)
	require.NoError(t, e)
	require.Equal(t, "scheduled", sale.Status)
	require.Equal(t, before.Version, saleSnapshot(t).Version)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	active := saleSnapshot(t)
	require.NotEqual(t, before.Version, active.Version)
	require.Contains(t, active.Effective["billing_setting.billing_expr"], "190")
	require.NoError(t, TickModelSale(sale.ID, now.Add(62*time.Second)))
	require.Equal(t, active.Version, saleSnapshot(t).Version)
	require.NoError(t, TickModelSale(sale.ID, now.Add(time.Hour)))
	require.Equal(t, before.Version, saleSnapshot(t).Version)
	now = now.Add(time.Hour)
	in := saleInput(now)
	sale, e = CreateModelSale(in, now)
	require.NoError(t, e)
	sale, e = EnableModelSale(sale.ID, sale.Revision, now)
	require.NoError(t, e)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	active = saleSnapshot(t)
	manual := PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": "tier(\"standard\",p*250+c*500)"}
	require.NoError(t, UpdateModelPricing([]ModelPricingChange{{ModelName: "sale-test", ExpectedVersion: active.Version, Pricing: manual}}))
	manualVersion := saleSnapshot(t).Version
	require.NoError(t, TickModelSale(sale.ID, now.Add(62*time.Second)))
	require.Equal(t, manualVersion, saleSnapshot(t).Version)
	require.NoError(t, DB.First(sale, "id = ?", sale.ID).Error)
	require.Equal(t, "conflict", sale.Status)
}
func TestModelSaleStopsWhenCostsIncreaseAndRejectsMissingCost(t *testing.T) {
	now, set := setupSaleTest(t)
	original := saleSnapshot(t)
	sale, e := CreateModelSale(saleInput(now), now)
	require.NoError(t, e)
	sale, e = EnableModelSale(sale.ID, sale.Revision, now)
	require.NoError(t, e)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	set(map[string]any{"provider": "yylx", "observed_at": now.Format(time.RFC3339), "billing_type": "token", "group_ratio": 1.0, "input_usd_per_million": 100.0, "output_usd_per_million": 200.0})
	require.NoError(t, TickModelSale(sale.ID, now.Add(62*time.Second)))
	require.Equal(t, original.Version, saleSnapshot(t).Version)
	require.NoError(t, DB.First(sale, "id = ?", sale.ID).Error)
	require.Equal(t, "blocked", sale.Status)
	next, e := CreateModelSale(saleInput(now), now)
	require.NoError(t, e)
	_, e = EnableModelSale(next.ID, next.Revision, now)
	require.Error(t, e)
	require.Equal(t, original.Version, saleSnapshot(t).Version)
	set(map[string]any{"provider": "yylx", "observed_at": now.Add(-73 * time.Hour).Format(time.RFC3339), "billing_type": "token", "group_ratio": 1.0, "input_usd_per_million": 1.0, "output_usd_per_million": 2.0})
	_, e = EnableModelSale(next.ID, next.Revision, now)
	require.ErrorContains(t, e, "过期")
}
func TestModelSaleOverlapAndRevision(t *testing.T) {
	now, _ := setupSaleTest(t)
	one, e := CreateModelSale(saleInput(now), now)
	require.NoError(t, e)
	_, e = EnableModelSale(one.ID, 0, now)
	require.ErrorIs(t, e, ErrModelSaleConflict)
	one, e = EnableModelSale(one.ID, one.Revision, now)
	require.NoError(t, e)
	two, e := CreateModelSale(saleInput(now), now)
	require.NoError(t, e)
	_, e = EnableModelSale(two.ID, two.Revision, now)
	require.ErrorContains(t, e, "重叠")
	_, e = DisableModelSale(one.ID, one.Revision, now)
	require.NoError(t, e)
	two, e = EnableModelSale(two.ID, two.Revision, now)
	require.NoError(t, e)
	require.Equal(t, "scheduled", two.Status)
}
func TestModelSalePriceScalingPreservesTiers(t *testing.T) {
	old := PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `len <= 272000 ? tier("short",p*20+c*40+cr*2) : tier("long",p*40+c*60+cr*4)`}
	target, e := saleDiscountPricing("sale-test", old, old, .95)
	require.NoError(t, e)
	expr := target["billing_setting.billing_expr"].(string)
	require.Contains(t, expr, "272000")
	leaves, e := saleLeaves(expr)
	require.NoError(t, e)
	require.Len(t, leaves, 2)
	require.Equal(t, int64(272001), leaves[1].Min)
	require.Equal(t, 19.0, leaves[0].Prices["p"])
	require.Equal(t, 38.0, leaves[1].Prices["p"])
	fixed := PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `tier("request",fixed(2))`}
	target, e = saleDiscountPricing("sale-test", fixed, fixed, .95)
	require.NoError(t, e)
	require.True(t, strings.Contains(target["billing_setting.billing_expr"].(string), "fixed(1.9)"))
}
func TestModelSaleQuoteMatchesContextAndMinimumGroup(t *testing.T) {
	now, set := setupSaleTest(t)
	threshold := int64(100)
	set(map[string]any{"provider": "yylx", "observed_at": now.Format(time.RFC3339), "billing_type": "token", "group_ratio": 1.0, "tiers": []any{map[string]any{"max_tokens": threshold, "input_per_million": 1.0, "output_per_million": 2.0}, map[string]any{"min_tokens": threshold, "input_per_million": 2.0, "output_per_million": 4.0}}})
	pricing := PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `len <= 100 ? tier("short",p*200+c*400) : tier("long",p*400+c*800)`}
	q := quoteModelSale(DB, "sale-test", pricing, 5, DefaultModelSalePolicy(), now)
	require.True(t, q.Eligible, q.Reason)
	require.Equal(t, 47.17, q.MaxDiscount)
	require.NoError(t, DB.Create(&Option{Key: "GroupGroupRatio", Value: `{"vip":{"default":0.1}}`}).Error)
	q = quoteModelSale(DB, "sale-test", pricing, 5, DefaultModelSalePolicy(), now)
	require.False(t, q.Eligible)
}
func TestModelSaleAutomaticWritersRespectScheduledAndActivePrices(t *testing.T) {
	now, _ := setupSaleTest(t)
	initial := saleSnapshot(t)
	require.NoError(t, UpdateModelPricing([]ModelPricingChange{{ModelName: "sale-test", ExpectedVersion: initial.Version, PricingSource: ModelPricingSourceUpstream}}))
	before := saleSnapshot(t)
	sale, e := CreateModelSale(saleInput(now), now)
	require.NoError(t, e)
	sale, e = EnableModelSale(sale.ID, sale.Revision, now)
	require.NoError(t, e)
	// The original was upstream-managed, so source==manual alone cannot protect
	// a scheduled activity from a background writer before the first tick.
	require.Equal(t, ModelPricingSourceUpstream, before.PricingSource)
	changed := PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `tier("standard",p*300+c*600)`}
	updated, e := UpdateAutomaticModelPricing([]ModelPricingChange{{ModelName: "sale-test", ExpectedVersion: before.Version, Pricing: changed}})
	require.NoError(t, e)
	require.Empty(t, updated)
	require.Equal(t, before.Version, saleSnapshot(t).Version)
	offers, promotions, e := CurrentModelSaleOffers(now)
	require.NoError(t, e)
	require.Len(t, offers, 1)
	require.Empty(t, promotions)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	active := saleSnapshot(t)
	updated, e = UpdateAutomaticModelPricing([]ModelPricingChange{{ModelName: "sale-test", ExpectedVersion: active.Version, Pricing: changed}})
	require.NoError(t, e)
	require.Empty(t, updated)
	require.Equal(t, active.Version, saleSnapshot(t).Version)
	offers, promotions, e = CurrentModelSaleOffers(now.Add(62 * time.Second))
	require.NoError(t, e)
	require.Len(t, offers, 1)
	require.Equal(t, before.Effective, promotions["sale-test"].Original)
	require.NoError(t, TickModelSale(sale.ID, now.Add(time.Hour)))
	require.Equal(t, before.Version, saleSnapshot(t).Version)
	offers, promotions, e = CurrentModelSaleOffers(now.Add(time.Hour))
	require.NoError(t, e)
	require.Empty(t, offers)
	require.Empty(t, promotions)
	updated, e = UpdateAutomaticModelPricing([]ModelPricingChange{{ModelName: "sale-test", ExpectedVersion: before.Version, Pricing: changed}})
	require.NoError(t, e)
	require.Equal(t, []string{"sale-test"}, updated)
}
func TestModelSaleMappingRequiresMatchedCostAndStopsOnChangedRoute(t *testing.T) {
	now, set := setupSaleTest(t)
	mapping := `{"sale-test":"upstream-real"}`
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", 1).Update("model_mapping", mapping).Error)
	pricing := saleSnapshot(t).Effective
	quote := quoteModelSale(DB, "sale-test", pricing, 5, DefaultModelSalePolicy(), now)
	require.False(t, quote.Eligible)
	require.Contains(t, quote.Reason, "映射")
	set(map[string]any{"provider": "yylx", "source_model": "upstream-real", "observed_at": now.Format(time.RFC3339), "billing_type": "token", "group_ratio": 1., "input_usd_per_million": 1., "output_usd_per_million": 2.})
	quote = quoteModelSale(DB, "sale-test", pricing, 5, DefaultModelSalePolicy(), now)
	require.True(t, quote.Eligible, quote.Reason)
	sale, e := CreateModelSale(saleInput(now), now)
	require.NoError(t, e)
	sale, e = EnableModelSale(sale.ID, sale.Revision, now)
	require.NoError(t, e)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", 1).Update("model_mapping", `{"sale-test":"unknown-expensive"}`).Error)
	require.NoError(t, TickModelSale(sale.ID, now.Add(62*time.Second)))
	require.NoError(t, DB.First(sale, "id = ?", sale.ID).Error)
	require.Equal(t, "blocked", sale.Status)
	require.Equal(t, pricing, saleSnapshot(t).Effective)
}
func TestModelSalePublicOffersHideManualPriceConflicts(t *testing.T) {
	now, _ := setupSaleTest(t)
	sale, e := CreateModelSale(saleInput(now), now)
	require.NoError(t, e)
	sale, e = EnableModelSale(sale.ID, sale.Revision, now)
	require.NoError(t, e)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	active := saleSnapshot(t)
	changed := PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `tier("standard",p*300+c*600)`}
	require.NoError(t, UpdateModelPricing([]ModelPricingChange{{ModelName: "sale-test", ExpectedVersion: active.Version, Pricing: changed}}))
	offers, promotions, e := CurrentModelSaleOffers(now.Add(62 * time.Second))
	require.NoError(t, e)
	require.Empty(t, offers)
	require.Empty(t, promotions)
}
func TestModelSaleUsesActualCashRevenueAndProviderCreditCost(t *testing.T) {
	now, _ := setupSaleTest(t)
	file := t.TempDir() + "/cost-basis.json"
	require.NoError(t, os.WriteFile(file, []byte(`{"net_cny_per_dollar":0.08,"costs":{"yylx":6.72}}`), 0600))
	t.Setenv("SKYMONI_UPSTREAM_SYNC_CONFIG", file)
	q := quoteModelSale(DB, "sale-test", saleSnapshot(t).Effective, 5, DefaultModelSalePolicy(), now)
	require.True(t, q.Eligible, q.Reason)
	require.Equal(t, .1, q.CashCNYPerCredit)
	for _, line := range q.Lines {
		if line.Component == "p" {
			require.InDelta(t, 20, line.SaleCNY, 1e-9)
			require.InDelta(t, 19, line.TargetCNY, 1e-9)
			require.InDelta(t, 6.72, line.CostCNY, 1e-9)
		}
	}
	require.NoError(t, os.WriteFile(file, []byte(`{"net_cny_per_dollar":0.001,"costs":{"yylx":6.72}}`), 0600))
	q = quoteModelSale(DB, "sale-test", saleSnapshot(t).Effective, 5, DefaultModelSalePolicy(), now)
	require.True(t, q.Eligible, "bulk-package net revenue must not replace selected 9.9-package basis")
	t.Setenv("SKYMONI_UPSTREAM_SYNC_CONFIG", file+"-missing")
	q = quoteModelSale(DB, "sale-test", saleSnapshot(t).Effective, 5, DefaultModelSalePolicy(), now)
	require.False(t, q.Eligible)
	require.Contains(t, q.Reason, "无法读取")
}

func TestModelSaleIndividualMultipliersRespectCostFloorAndRestore(t *testing.T) {
	now, _ := setupSaleTest(t)
	before := saleSnapshot(t)
	var ch Channel
	require.NoError(t, DB.First(&ch, 1).Error)
	ch.Models = "sale-test,sale-other"
	require.NoError(t, DB.Save(&ch).Error)
	var opt Option
	require.NoError(t, DB.First(&opt, "key = ?", "SkymoniUpstreamCosts").Error)
	var costs map[string][]map[string]any
	require.NoError(t, json.Unmarshal([]byte(opt.Value), &costs))
	raw, _ := json.Marshal(costs["sale-test"])
	var second []map[string]any
	require.NoError(t, json.Unmarshal(raw, &second))
	second[0]["source_model"] = "sale-other"
	second[0]["channel_version"] = ModelSaleCostChannelVersion(ch, "sale-other")
	costs["sale-other"] = second
	raw, _ = json.Marshal(costs)
	opt.Value = string(raw)
	require.NoError(t, DB.Save(&opt).Error)
	require.NoError(t, UpdateModelPricingOptions(map[string]string{"billing_setting.billing_mode": `{"sale-test":"tiered_expr","sale-other":"tiered_expr"}`, "billing_setting.billing_expr": `{"sale-test":"tier(\"standard\",p*200+c*400)","sale-other":"tier(\"standard\",p*400+c*800)"}`}))
	in := saleInput(now)
	in.Config.Models = []string{"sale-test", "sale-other"}
	in.Config.Discount = 0
	in.Config.Multipliers = map[string]float64{"sale-test": .8, "sale-other": .6}
	sale, e := CreateModelSale(in, now)
	require.NoError(t, e)
	sale, e = EnableModelSale(sale.ID, sale.Revision, now)
	require.NoError(t, e)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	snap, e := GetModelPricingSnapshot([]string{"sale-test", "sale-other"})
	require.NoError(t, e)
	prices := map[string]ModelPricingEntry{}
	for _, v := range snap.Entries {
		prices[v.ModelName] = v
	}
	require.Contains(t, prices["sale-test"].Effective["billing_setting.billing_expr"], "160")
	require.Contains(t, prices["sale-other"].Effective["billing_setting.billing_expr"], "240")
	require.NoError(t, TickModelSale(sale.ID, now.Add(3601*time.Second)))
	require.Equal(t, before.Effective, saleSnapshot(t).Effective)
	in.StartAt = now.Unix() + 4000
	in.EndAt = now.Unix() + 8000
	in.Config.Multipliers["sale-test"] = .01
	blocked, e := CreateModelSale(in, now)
	require.NoError(t, e)
	_, e = EnableModelSale(blocked.ID, blocked.Revision, now)
	require.ErrorContains(t, e, "最低允许价格倍率")
	require.Equal(t, before.Effective, saleSnapshot(t).Effective)
}
