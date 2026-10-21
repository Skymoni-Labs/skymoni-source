package controller

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestUpstreamWalletFixedRequestExpression(t *testing.T) {
	var source run2000Pricing
	require.NoError(t, json.Unmarshal([]byte(`{"success":true,"group_ratio":{"default":1.2},"data":[{"model_name":"gpt-6.1-sol","quota_type":1,"model_price":99,"billing_mode":"tiered_expr","billing_expr":"tier(\"request\", fixed(0.6))","enable_groups":["default"]}]}`), &source))
	quotes, err := parse2000Monitor(source)
	require.NoError(t, err)
	require.Len(t, quotes, 1)
	require.Equal(t, "request", quotes[0].BillingType)
	quote := syncCostRecord(upstreamMonitorProvider{Provider: "2000run"}, quotes[0])
	// Six real pending requests have different token counts and the same per-request cost.
	for _, tokens := range []int{121712, 583, 38393, 40152, 40944, 42094} {
		cost, reason := calculateWalletCost(&model.Log{ModelName: "gpt-6.1-sol", PromptTokens: tokens, CompletionTokens: 95, Quota: 75000000}, nil, quote)
		require.Empty(t, reason)
		require.InDelta(t, .72, cost, 1e-12)
	}
	require.InDelta(t, .8073246362452067, .72*1.1212842170072315, 1e-12)
}

func TestUpstreamWalletDoesNotGuessDynamicExpressions(t *testing.T) {
	for _, expr := range []string{`len > 100 ? tier("request", fixed(2)) : tier("request", fixed(.6))`, `tier("request", fixed(0.6)) + p`, `tier("token", fixed(0.6))`, `tier("request", fixed(-1))`, `tier("request", fixed(NaN))`, `tier("request", fixed(1/2))`} {
		require.Nil(t, monitorFixedRequestPrice(expr), expr)
	}
	require.InDelta(t, 0, *monitorFixedRequestPrice(`tier("request", fixed(0))`), 1e-12)
	require.InDelta(t, .6, *monitorFixedRequestPrice(` tier( "request", fixed( 0.60 ) ) `), 1e-12)
}
