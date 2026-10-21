package model

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestAdminMailScheduleDoesNotSendEarlyAndSurvivesReload(t *testing.T) {
	now, _ := setupSaleTest(t)
	require.NoError(t, DB.AutoMigrate(&AdminMailCampaign{}, &AdminMailDelivery{}))
	c := AdminMailCampaign{RequestKey: "mail-one", Subject: "优惠", Status: "draft", Content: "immutable", Html: "snapshot"}
	require.NoError(t, DB.Create(&c).Error)
	at := now.Unix() + 120
	require.NoError(t, ScheduleAdminMailCampaign(c.Id, at, now))
	require.NoError(t, ScheduleAdminMailCampaign(c.Id, at, now))
	require.Error(t, QueueAdminMailCampaign(c.Id))
	items, e := DueAdminMailCampaigns(now.Add(119 * time.Second))
	require.NoError(t, e)
	require.Empty(t, items)
	items, e = DueAdminMailCampaigns(now.Add(120 * time.Second))
	require.NoError(t, e)
	require.Len(t, items, 1)
	require.Equal(t, "immutable", string(items[0].Content))
	require.NoError(t, FinishAdminMailSchedule(items[0], "fresh countdown", nil, now.Add(120*time.Second)))
	require.NoError(t, FinishAdminMailSchedule(items[0], "duplicate snapshot", nil, now.Add(120*time.Second)))
	require.NoError(t, DB.First(&c, c.Id).Error)
	require.Equal(t, "queued", c.Status)
	require.Equal(t, "fresh countdown", string(c.Html))
}

func TestAdminMailScheduleCancellationAndFailedGuardNeverQueue(t *testing.T) {
	now, _ := setupSaleTest(t)
	require.NoError(t, DB.AutoMigrate(&AdminMailCampaign{}, &AdminMailDelivery{}))
	for _, cancelled := range []bool{false, true} {
		key := "blocked"
		if cancelled {
			key = "cancelled"
		}
		c := AdminMailCampaign{RequestKey: key, Subject: "优惠", Status: "draft", Html: "old"}
		require.NoError(t, DB.Create(&c).Error)
		require.NoError(t, ScheduleAdminMailCampaign(c.Id, now.Unix()+60, now))
		require.NoError(t, DB.First(&c, c.Id).Error)
		if cancelled {
			require.NoError(t, CancelAdminMailCampaign(c.Id))
		}
		require.NoError(t, FinishAdminMailSchedule(c, "", errors.New("成本未通过"), now.Add(time.Minute)))
		require.NoError(t, DB.First(&c, c.Id).Error)
		if cancelled {
			require.Equal(t, "cancelled", c.Status)
		} else {
			require.Equal(t, "schedule_failed", c.Status)
			require.Contains(t, c.ScheduleError, "成本未通过")
		}
		require.Error(t, QueueAdminMailCampaign(c.Id))
	}
}
