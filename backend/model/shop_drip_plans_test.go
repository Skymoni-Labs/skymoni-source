package model

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDripLegacyReceiptDuration(t *testing.T) {
	t.Setenv("BENEFITS_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("L", 32))))
	encrypted, err := encryptBenefit(BenefitConfig{ValidityDays: 0}, "shop-order")
	require.NoError(t, err)
	order := ShopOrder{Encrypted: encrypted, DripQuotaGiB: 100, PriceCents: 35000}
	days, err := ShopOrderDurationDays(order)
	require.NoError(t, err)
	require.Zero(t, days)
	display := BenefitConfig{Format: "markdown", Instructions: "保留原教程"}
	require.NoError(t, applyDripReceiptPlan(&display, order, true))
	require.Zero(t, display.ValidityDays)
	require.Contains(t, display.Summary, "原订阅期限")
	require.Contains(t, display.Summary, "实付 350")
	require.Contains(t, display.Instructions, "保留原教程")
	require.NotContains(t, display.Summary, "0 天")
}
