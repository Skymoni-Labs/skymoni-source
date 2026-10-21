package model

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestSaleTimeDisplayBothOfficialTiersAndCache(t *testing.T) {
	expression := `(weekday("Asia/Shanghai") >= 1 && weekday("Asia/Shanghai") <= 5 && ((hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12) || (hour("Asia/Shanghai") >= 14 && hour("Asia/Shanghai") < 18))) && !(month("Asia/Shanghai") == 10 && day("Asia/Shanghai") <= 7) ? tier("peak", p*0.3+c*1.2+cr*0.006) : tier("off_peak",p*0.15+c*0.6+cr*0.003)`
	effective := PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expression}
	display := saleTimePriceTiers("deepseek-v4.1-flash-low", effective, .09, .1, 1, 1)
	require.NotNil(t, display)
	require.Equal(t, expression, display.Expression)
	require.Contains(t, display.ScheduleText, "09:00–12:00")
	require.Contains(t, display.ScheduleText, "节假日例外")
	require.Len(t, display.Tiers, 2)
	normal, peak := display.Tiers[0], display.Tiers[1]
	require.Equal(t, "off_peak", normal.Label)
	require.Equal(t, "peak", peak.Label)
	require.InDelta(t, .015, normal.Original["p"], 1e-12)
	require.InDelta(t, .0135, normal.Target["p"], 1e-12)
	require.InDelta(t, .054, normal.Target["c"], 1e-12)
	require.InDelta(t, .00027, normal.Target["cr"], 1e-12)
	require.InDelta(t, .027, peak.Target["p"], 1e-12)
	require.InDelta(t, .108, peak.Target["c"], 1e-12)
	require.InDelta(t, .00054, peak.Target["cr"], 1e-12)
	require.InDelta(t, .1, peak.OriginalMultiplier, 1e-12)
	require.InDelta(t, .1, normal.OriginalMultiplier, 1e-12)
	// A changed schedule must not inherit a hardcoded weekday description.
	changed := PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": `hour("Asia/Shanghai") < 8 ? tier("peak",p*0.3+c*1.2) : tier("off_peak",p*0.15+c*0.6)`}
	require.Empty(t, saleTimePriceTiers("deepseek-v4.1-flash-low", changed, .09, .1, 1, 1).ScheduleText)
	require.Nil(t, saleTimePriceTiers("unknown", effective, .09, .1, 1, 1))
	require.Nil(t, saleTimePriceTiers("deepseek-v4.1-flash-low", PricingValues{"ModelPrice": 1.0}, .09, .1, 1, 1))
}
