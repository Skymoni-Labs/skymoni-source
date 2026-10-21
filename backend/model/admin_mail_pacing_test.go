package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAdminMailRecentAttemptTimesSurviveReloadAndExcludeUnsentRecipients(t *testing.T) {
	now, _ := setupSaleTest(t)
	require.NoError(t, DB.AutoMigrate(&AdminMailCampaign{}, &AdminMailDelivery{}))
	at := now.Unix()
	rows := []AdminMailDelivery{
		{CampaignId: 1, Email: "old@example.com", Status: "failed", Result: "smtp_auth_535", UpdatedAt: at - 1000},
		{CampaignId: 2, Email: "auth@example.com", Status: "failed", Result: "smtp_auth_535", UpdatedAt: at - 100},
		{CampaignId: 3, Email: "success@example.com", Status: "sent", Result: "smtp_accepted", UpdatedAt: at - 20},
		{CampaignId: 4, Email: "skip@example.com", Status: "skipped", Result: "cancelled", UpdatedAt: at},
		{CampaignId: 5, Email: "pending@example.com", Status: "pending", UpdatedAt: at},
	}
	require.NoError(t, DB.Create(&rows).Error)
	for i := 0; i < 2; i++ {
		attempts, err := RecentAdminMailAttemptTimes(at - 301)
		require.NoError(t, err)
		require.Equal(t, at-20, attempts.LastAttempt)
		require.Equal(t, at-100, attempts.LastAuthFailure)
	}
	var count int64
	require.NoError(t, DB.Model(&AdminMailDelivery{}).Where("status = ?", "pending").Count(&count).Error)
	require.EqualValues(t, 1, count, "restoring the gate never claims or retries a message")
	attempts, err := RecentAdminMailAttemptTimes(at + 1)
	require.NoError(t, err)
	require.Equal(t, AdminMailAttemptTimes{}, attempts)
}
