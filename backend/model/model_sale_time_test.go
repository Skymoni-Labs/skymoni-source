package model

import (
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestSaleClockBranchesAuditEveryTier(t *testing.T) {
	expression := `(weekday("Asia/Shanghai") >= 1 && hour("Asia/Shanghai") < 12) && !(month("Asia/Shanghai") == 10 && day("Asia/Shanghai") <= 7) ? tier("peak", p*20+c*40+cr*2) : tier("off_peak",p*10+c*20+cr*1)`
	leaves, err := saleLeaves(expression)
	require.NoError(t, err)
	require.Len(t, leaves, 2)
	require.Equal(t, "peak", leaves[0].Label)
	require.Equal(t, "off_peak", leaves[1].Label)
	require.Equal(t, leaves[0].Min, leaves[1].Min)
	require.Equal(t, leaves[0].Max, leaves[1].Max)
	for _, condition := range []string{`hour("Asia/Shanghai") < 12 && p > 100`, `req("x") == 1`, `hour("UTC") < 12`} {
		_, err := saleLeaves(condition + ` ? tier("a", p*1+c*2) : tier("b",p*2+c*4)`)
		require.Error(t, err)
	}
}

func TestSaleClockLowTierCannotHidePeakProcurementCost(t *testing.T) {
	now, set := setupSaleTest(t)
	set(map[string]any{"provider": "yylx", "observed_at": now.Format(time.RFC3339), "billing_type": "token", "group_ratio": 1.0,
		"tiers": []any{
			map[string]any{"input_per_million": 1.0, "output_per_million": 2.0},
			map[string]any{"input_per_million": 2.0, "output_per_million": 4.0},
		}})
	p := PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `hour("Asia/Shanghai") < 12 ? tier("peak",p*300+c*600) : tier("off_peak",p*100+c*200)`}
	q := quoteModelSale(DB, "sale-test", p, 0, DefaultModelSalePolicy(), now)
	require.False(t, q.Eligible)
	for _, line := range q.Lines {
		if line.Component == "p" {
			require.Equal(t, 14.6, line.CostCNY)
		}
		if line.Component == "c" {
			require.Equal(t, 29.2, line.CostCNY)
		}
	}
	require.Len(t, q.Lines, 4)
}
