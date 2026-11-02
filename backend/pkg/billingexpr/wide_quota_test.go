package billingexpr_test

import (
	"testing"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/stretchr/testify/require"
)

// Synthetic usage at published long-context prices must retain the full charge
// with 1e8 units per dollar, including when it exceeds the old int32 boundary.
func TestLongContextChargeAboveInt32IsNotClamped(t *testing.T) {
	const expr = `len <= 272000 ? tier("standard", p * 22.753240 + c * 113.766197 + cr * 2.275324) : tier("long_context", p * 45.506479 + c * 170.649296 + cr * 4.550648)`
	snap := &billingexpr.BillingSnapshot{
		BillingMode: "tiered_expr", ExprString: expr, ExprHash: billingexpr.ExprHashString(expr),
		GroupRatio: 1, QuotaPerUnit: 100_000_000,
	}
	for _, tc := range []struct {
		name   string
		tokens billingexpr.TokenParams
		want   int
	}{
		{"uncached", billingexpr.TokenParams{P: 600000, C: 2000, Len: 600000}, 2_764_518_599},
		{"cached", billingexpr.TokenParams{P: 60000, C: 4000, CR: 480000, Len: 540000}, 559_729_696},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result, err := billingexpr.ComputeTieredQuota(snap, tc.tokens)
			require.NoError(t, err)
			require.Nil(t, result.Clamp)
			require.Equal(t, tc.want, result.ActualQuotaAfterGroup)
			require.Equal(t, "long_context", result.MatchedTier)
			preConsume, err := billingexpr.QuotaRoundStrict(result.ActualQuotaBeforeGroup)
			require.NoError(t, err, "the same valid amount must also be accepted before forwarding")
			require.Equal(t, tc.want, preConsume)
		})
	}
}
