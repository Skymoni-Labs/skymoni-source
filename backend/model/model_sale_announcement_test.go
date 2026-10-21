package model

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestModelSaleAnnouncementTimeGatePersistsWithoutChangingPrices(t *testing.T) {
	now, _ := setupSaleTest(t)
	before := saleSnapshot(t)
	sale, err := CreateModelSale(saleInput(now), now)
	require.NoError(t, err)
	sale, err = ScheduleModelSaleAnnouncement(sale.ID, sale.Revision, now.Unix()+30, now)
	require.NoError(t, err)
	require.Equal(t, "draft", sale.Status)
	require.Empty(t, sale.Plan)
	require.Equal(t, before.Version, saleSnapshot(t).Version)
	var saved ModelSale
	require.NoError(t, DB.First(&saved, "id = ?", sale.ID).Error)
	require.True(t, saved.AnnouncementEnabled)
	require.Equal(t, "scheduled", ModelSalePublicationState(saved, now.Add(29*time.Second)))
	offers, promotions, err := CurrentModelSaleOffers(now.Add(29 * time.Second))
	require.NoError(t, err)
	require.Empty(t, offers)
	require.Empty(t, promotions)
	offers, promotions, err = CurrentModelSaleOffers(now.Add(30 * time.Second))
	require.NoError(t, err)
	require.Len(t, offers, 1)
	require.Empty(t, promotions)
	require.Equal(t, "announced", offers[0].Status)
	require.True(t, offers[0].AnnouncementOnly)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	require.Equal(t, before.Version, saleSnapshot(t).Version)
	sale, err = CancelModelSaleAnnouncement(sale.ID, sale.Revision, now.Add(31*time.Second))
	require.NoError(t, err)
	offers, _, err = CurrentModelSaleOffers(now.Add(32 * time.Second))
	require.NoError(t, err)
	require.Empty(t, offers)
	require.Equal(t, "draft", sale.Status)
	require.Equal(t, before.Version, saleSnapshot(t).Version)
}

func TestModelSaleAnnouncementRejectsCostsConflictsAndUnsafeTimes(t *testing.T) {
	now, set := setupSaleTest(t)
	sale, err := CreateModelSale(saleInput(now), now)
	require.NoError(t, err)
	_, err = ScheduleModelSaleAnnouncement(sale.ID, 0, now.Unix(), now)
	require.ErrorIs(t, err, ErrModelSaleConflict)
	for _, at := range []int64{now.Unix() - 61, sale.EndAt, now.Unix() + 31*86400} {
		_, err = ScheduleModelSaleAnnouncement(sale.ID, sale.Revision, at, now)
		require.Error(t, err)
	}
	sale, err = ScheduleModelSaleAnnouncement(sale.ID, sale.Revision, now.Unix(), now)
	require.NoError(t, err)
	set(map[string]any{"provider": "yylx", "observed_at": now.Format(time.RFC3339), "billing_type": "token", "group_ratio": 1.0, "input_usd_per_million": 100.0, "output_usd_per_million": 200.0})
	offers, _, err := CurrentModelSaleOffers(now)
	require.NoError(t, err)
	require.Empty(t, offers)
	_, err = ScheduleModelSaleAnnouncement(sale.ID, sale.Revision, now.Unix(), now)
	require.Error(t, err)
}

func TestModelSaleAnnouncementEditCancelsAndPricingActivationRemainsSeparate(t *testing.T) {
	now, _ := setupSaleTest(t)
	sale, err := CreateModelSale(saleInput(now), now)
	require.NoError(t, err)
	sale, err = ScheduleModelSaleAnnouncement(sale.ID, sale.Revision, now.Unix()+120, now)
	require.NoError(t, err)
	in := saleInput(now)
	in.Revision = sale.Revision
	in.Title = "reviewed edit"
	sale, err = UpdateModelSale(sale.ID, in, now)
	require.NoError(t, err)
	require.False(t, sale.AnnouncementEnabled)
	require.Empty(t, sale.AnnouncementPlan)
	sale, err = EnableModelSale(sale.ID, sale.Revision, now)
	require.NoError(t, err)
	offers, _, err := CurrentModelSaleOffers(now)
	require.NoError(t, err)
	require.Empty(t, offers)
	sale, err = ScheduleModelSaleAnnouncement(sale.ID, sale.Revision, now.Unix()+120, now)
	require.NoError(t, err)
	require.NoError(t, TickModelSale(sale.ID, now.Add(61*time.Second)))
	offers, _, err = CurrentModelSaleOffers(now.Add(61 * time.Second))
	require.NoError(t, err)
	require.Empty(t, offers)
	offers, promotions, err := CurrentModelSaleOffers(now.Add(120 * time.Second))
	require.NoError(t, err)
	require.Len(t, offers, 1)
	require.Len(t, promotions, 1)
	require.Equal(t, "active", offers[0].Status)
	var active ModelSale
	require.NoError(t, DB.First(&active, "id = ?", sale.ID).Error)
	price := saleSnapshot(t).Version
	_, err = CancelModelSaleAnnouncement(sale.ID, active.Revision, now.Add(121*time.Second))
	require.NoError(t, err)
	require.Equal(t, price, saleSnapshot(t).Version)
}

func TestModelSaleAnnouncementHidesChangedPricesAndExpires(t *testing.T) {
	now, _ := setupSaleTest(t)
	sale, err := CreateModelSale(saleInput(now), now)
	require.NoError(t, err)
	sale, err = ScheduleModelSaleAnnouncement(sale.ID, sale.Revision, now.Unix(), now)
	require.NoError(t, err)
	offers, _, err := CurrentModelSaleOffers(time.Unix(sale.EndAt, 0))
	require.NoError(t, err)
	require.Empty(t, offers)
	require.NoError(t, UpdateModelPricingOptions(map[string]string{"billing_setting.billing_expr": `{"sale-test":"tier(\"standard\",p*250+c*500)"}`}))
	offers, _, err = CurrentModelSaleOffers(now)
	require.NoError(t, err)
	require.Empty(t, offers)
}
