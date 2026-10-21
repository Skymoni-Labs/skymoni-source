package controller

import (
	"math"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
	"testing"
)

func walletFloat(v float64) *float64 { return &v }
func TestUpstreamWalletCost(t *testing.T) {
	quote := UpstreamCost{BillingType: "token", InputUSDPerMillion: walletFloat(2), OutputUSDPerMillion: walletFloat(10), CacheRead: walletFloat(.2), CacheWrite: walletFloat(2.5), CacheWrite1h: walletFloat(4), GroupRatio: walletFloat(.3)}
	log := &model.Log{PromptTokens: 1000, CompletionTokens: 100}
	for _, test := range []struct {
		name     string
		other    map[string]any
		expected float64
	}{
		{"openai cache included", map[string]any{"cache_tokens": float64(400)}, .000684},
		{"anthropic cache additional", map[string]any{"usage_semantic": "anthropic", "cache_tokens": float64(400), "cache_creation_tokens_5m": float64(100), "cache_creation_tokens_1h": float64(50)}, .001059},
	} {
		t.Run(test.name, func(t *testing.T) {
			cost, why := calculateWalletCost(log, test.other, quote)
			require.Empty(t, why)
			require.InDelta(t, test.expected, cost, 1e-12)
		})
	}
	// An explicit zero cache price is valid; absent cache pricing is not free.
	quote.CacheRead = nil
	_, why := calculateWalletCost(log, map[string]any{"cache_tokens": float64(400)}, quote)
	require.NotEmpty(t, why)
	quote.CacheRead = walletFloat(0)
	cost, why := calculateWalletCost(log, map[string]any{"cache_tokens": float64(400)}, quote)
	require.Empty(t, why)
	require.InDelta(t, .00066, cost, 1e-12)
	quote = UpstreamCost{BillingType: "request", RequestUSD: walletFloat(.3), GroupRatio: walletFloat(1.2)}
	cost, why = calculateWalletCost(log, nil, quote)
	require.Empty(t, why)
	require.InDelta(t, .36, cost, 1e-12)
}

func TestUpstreamWalletUsesServingChannelCost(t *testing.T) {
	upstreamWalletCache.Lock()
	previous := upstreamWalletCache.state
	upstreamWalletCache.Unlock()
	t.Cleanup(func() {
		upstreamWalletCache.Lock()
		upstreamWalletCache.state = previous
		upstreamWalletCache.Unlock()
	})
	base := UpstreamCost{Provider: "2000run", SourceModel: "gpt-6.1-sol", BillingType: "request", RequestUSD: walletFloat(.6), GroupRatio: walletFloat(1.2), ChannelID: 175, Group: "default"}
	foreign := base
	foreign.ChannelID, foreign.RequestUSD = 388, walletFloat(10)
	otherGroup := base
	otherGroup.Group, otherGroup.RequestUSD = "vip", walletFloat(4)
	wrongModel := base
	wrongModel.SourceModel = "another-model"
	legacy := base
	legacy.ChannelID = 0
	for _, tc := range []struct {
		name     string
		quotes   []UpstreamCost
		mapping  string
		status   string
		expected float64
	}{
		{"same model many channels", []UpstreamCost{foreign, base}, "", "priced", .72},
		{"channel quote overrides legacy", []UpstreamCost{legacy, base}, "", "priced", .72},
		{"mapped alias uses exact upstream", []UpstreamCost{foreign, base}, `{"alias":"gpt-6.1-sol"}`, "priced", .72},
		{"foreign channel is not a fallback", []UpstreamCost{foreign}, "", "pending", 0},
		{"same channel ambiguous supplier group", []UpstreamCost{base, otherGroup}, "", "pending", 0},
		{"different upstream model never debited", []UpstreamCost{wrongModel}, "", "pending", 0},
		{"unambiguous legacy quote", []UpstreamCost{legacy}, "", "priced", .72},
	} {
		t.Run(tc.name, func(t *testing.T) {
			name := "gpt-6.1-sol"
			if tc.mapping != "" {
				name = "alias"
			}
			upstreamWalletCache.Lock()
			upstreamWalletCache.state = walletCacheState{
				Wallets:  map[int]model.UpstreamWallet{15: {ID: 15, Provider: "2000run", CalibratedAt: 1, Revision: 1}},
				Channels: map[int]walletChannel{175: {ID: 175, WalletID: 15, ModelMapping: tc.mapping}},
				Costs:    map[string][]UpstreamCost{name: tc.quotes},
			}
			upstreamWalletCache.Unlock()
			snapshot := estimateUpstreamWalletLog(&model.Log{Type: model.LogTypeConsume, ChannelId: 175, ModelName: name, PromptTokens: 121712, Quota: 75000000})
			require.NotNil(t, snapshot)
			require.Equal(t, tc.status, snapshot.Status)
			require.InDelta(t, tc.expected, snapshot.Cost, 1e-12)
			require.Equal(t, 15, snapshot.WalletID)
		})
	}
	// One HTTP/SSE request is one supplier fixed charge regardless of token count.
	raw, err := common.Marshal(map[string]any{"upstream_model_name": "gpt-6.1-sol"})
	require.NoError(t, err)
	for _, kind := range []int{model.LogTypeError, model.LogTypeRefund} {
		snapshot := estimateUpstreamWalletLog(&model.Log{Type: kind, ChannelId: 175, ModelName: "gpt-6.1-sol", Other: string(raw)})
		require.NotNil(t, snapshot)
		require.Equal(t, "pending", snapshot.Status)
		require.Zero(t, snapshot.Cost)
	}
}

func TestUpstreamWalletSupplierPeakCost(t *testing.T) {
	quote := UpstreamCost{BillingType: "token", InputUSDPerMillion: walletFloat(1), OutputUSDPerMillion: walletFloat(2), GroupRatio: walletFloat(.5), TimePricing: &model.ModelSaleCostTimePricing{Timezone: "Asia/Shanghai", Periods: []model.ModelSaleCostTimePeriod{{Start: "09:00", End: "12:00", Multiplier: 2}, {Start: "14:00", End: "18:00", Multiplier: 2}}}}
	zone := time.FixedZone("Asia/Shanghai", 8*60*60)
	for _, tc := range []struct {
		name     string
		at       time.Time
		weekdays bool
		expected float64
	}{
		{"before peak", time.Date(2026, 10, 12, 8, 59, 0, 0, zone), false, .0006},
		{"peak starts", time.Date(2026, 10, 12, 9, 0, 0, 0, zone), false, .0012},
		{"peak ends", time.Date(2026, 10, 12, 12, 0, 0, 0, zone), false, .0006},
		{"afternoon peak", time.Date(2026, 10, 12, 14, 0, 0, 0, zone), true, .0012},
		{"weekend low", time.Date(2026, 10, 11, 10, 0, 0, 0, zone), true, .0006},
		{"weekend normal model still peaks", time.Date(2026, 10, 11, 10, 0, 0, 0, zone), false, .0012},
	} {
		t.Run(tc.name, func(t *testing.T) {
			quote.TimePricing.WeekdaysOnly = tc.weekdays
			cost, why := calculateWalletCost(&model.Log{CreatedAt: tc.at.Unix(), PromptTokens: 1000, CompletionTokens: 100}, nil, quote)
			require.Empty(t, why)
			require.InDelta(t, tc.expected, cost, 1e-12)
		})
	}
	_, why := calculateWalletCost(&model.Log{PromptTokens: 1000}, nil, quote)
	require.NotEmpty(t, why)
	quote.TimePricing.WeekdaysOnly = false
	cost, why := calculateWalletCost(&model.Log{CreatedAt: time.Date(2026, 10, 12, 12, 0, 30, 0, zone).Unix(), UseTime: 60, PromptTokens: 1000, CompletionTokens: 100}, nil, quote)
	require.Empty(t, why)
	require.InDelta(t, .0012, cost, 1e-12, "crossing the end of a peak period keeps the request-start cost")
	_, why = calculateWalletCost(&model.Log{CreatedAt: 1, UseTime: math.MaxInt, PromptTokens: 1000}, nil, quote)
	require.NotEmpty(t, why)
	quote = UpstreamCost{BillingType: "request", RequestUSD: walletFloat(math.MaxFloat64), GroupRatio: walletFloat(2)}
	_, why = calculateWalletCost(&model.Log{}, nil, quote)
	require.NotEmpty(t, why)
}
func TestUpstreamWalletCostDoesNotUseRetailQuota(t *testing.T) {
	quote := UpstreamCost{BillingType: "token", InputUSDPerMillion: walletFloat(1), OutputUSDPerMillion: walletFloat(2)}
	a := &model.Log{PromptTokens: 100, CompletionTokens: 50, Quota: 1}
	b := *a
	b.Quota = 999999
	first, why := calculateWalletCost(a, nil, quote)
	require.Empty(t, why)
	second, _ := calculateWalletCost(&b, nil, quote)
	require.Equal(t, first, second)
	_, why = calculateWalletCost(a, map[string]any{"tool_surcharges": []any{map[string]any{"tool": "search"}}}, quote)
	require.NotEmpty(t, why)
}
func TestUpstreamWalletCostTier(t *testing.T) {
	min := int64(2000)
	max := int64(1999)
	quote := UpstreamCost{BillingType: "token", GroupRatio: walletFloat(.2), Tiers: []upstreamMonitorTier{{MaxTokens: &max, InputPerMillion: walletFloat(1), OutputPerMillion: walletFloat(2)}, {MinTokens: &min, InputPerMillion: walletFloat(3), OutputPerMillion: walletFloat(4)}}}
	cost, why := calculateWalletCost(&model.Log{PromptTokens: 2000, CompletionTokens: 100}, nil, quote)
	require.Empty(t, why)
	require.InDelta(t, .00128, cost, 1e-12)
}
