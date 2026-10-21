package service

import (
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestModelSaleTimeMailBothTiersRemainPlanned(t *testing.T) {
	details := []model.ModelSaleTimePrices{{Model: "deepseek-v4.1-flash-low", ScheduleText: "北京时间周一至周五 09:00–12:00、14:00–18:00", Tiers: []model.ModelSaleTimePriceTier{
		{Label: "off_peak", Original: map[string]float64{"p": .015, "c": .06, "cr": .0003}, Target: map[string]float64{"p": .0135, "c": .054, "cr": .00027}},
		{Label: "peak", Original: map[string]float64{"p": .03, "c": .12, "cr": .0006}, Target: map[string]float64{"p": .027, "c": .108, "cr": .00054}},
	}}}
	rendered := renderModelSaleTimePrices(details)
	for _, text := range []string{"高峰时段", "普通时段", "09:00–12:00", "$0.0135", "$0.027", "$0.054", "$0.108", "$0.00027", "$0.00054", "计划价格须经成本核验并启用后生效"} {
		require.Contains(t, rendered, text)
	}
	require.Empty(t, renderModelSaleTimePrices(nil))
	details[0].Model = `<script>alert(1)</script>`
	rendered = renderModelSaleTimePrices(details)
	require.Contains(t, rendered, "&lt;script&gt;")
	require.NotContains(t, rendered, "<script>")
}
