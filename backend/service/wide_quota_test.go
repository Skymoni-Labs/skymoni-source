package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestBillingSessionPreConsumeAndSettleAboveInt32(t *testing.T) {
	const userID, tokenID = 8901, 8901
	const openingQuota, preQuota = 10_000_000_000, 2_300_000_000
	const tokenKey = "test-large-request-quota"
	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 100_000_000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })
	for _, tc := range []struct {
		name        string
		actualQuota int
	}{
		{"additional charge", 2_750_000_000},
		{"partial refund", 1_500_000_000},
	} {
		t.Run(tc.name, func(t *testing.T) {
			truncate(t)
			actualQuota := tc.actualQuota
			seedUser(t, userID, openingQuota)
			seedToken(t, tokenID, userID, tokenKey, openingQuota)
			c, _ := gin.CreateTestContext(nil)
			info := &relaycommon.RelayInfo{UserId: userID, TokenId: tokenID, TokenKey: tokenKey, ForcePreConsume: true}
			info.UserSetting.BillingPreference = "wallet_only"
			quota, clamp := common.QuotaRoundChecked(preQuota)
			info.QuotaClamp = clamp
			require.Nil(t, PreConsumeBilling(c, quota, info))
			require.Nil(t, info.QuotaClamp)
			require.Equal(t, preQuota, info.Billing.GetPreConsumedQuota())
			got, err := model.GetUserQuota(userID, false)
			require.NoError(t, err)
			require.Equal(t, openingQuota-preQuota, got)

			require.NoError(t, SettleBilling(c, info, actualQuota))
			require.NoError(t, SettleBilling(c, info, actualQuota), "settlement must stay idempotent")
			got, err = model.GetUserQuota(userID, false)
			require.NoError(t, err)
			require.Equal(t, openingQuota-actualQuota, got)
			var token model.Token
			require.NoError(t, model.DB.First(&token, tokenID).Error)
			require.Equal(t, openingQuota-actualQuota, token.RemainQuota)
			require.Equal(t, actualQuota, token.UsedQuota)
		})
	}
}
