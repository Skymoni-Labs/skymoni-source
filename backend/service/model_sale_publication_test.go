package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestModelSalePublicationGIFLabelsRemainHonest(t *testing.T) {
	now := time.Unix(1700000000, 0)
	sale := model.ModelSale{Status: "draft", StartAt: now.Unix() + 600, EndAt: now.Unix() + 3600, AnnouncementManaged: true, AnnouncementEnabled: true, AnnouncementAt: now.Unix() + 60, Config: model.ModelSaleConfig{CountdownMode: "end"}}
	target, label := ModelSaleCountdownTarget(sale, now)
	require.Equal(t, sale.AnnouncementAt, target)
	require.Equal(t, "PREVIEW / UNTIL PUBLICATION", label)
	target, label = ModelSaleCountdownTarget(sale, now.Add(60*time.Second))
	require.Equal(t, sale.EndAt, target)
	require.Equal(t, "ANNOUNCEMENT / UNTIL PLANNED END", label)
	sale.Config.CountdownMode = "auto"
	target, label = ModelSaleCountdownTarget(sale, now.Add(60*time.Second))
	require.Equal(t, sale.StartAt, target)
	require.Equal(t, "ANNOUNCEMENT / UNTIL PLANNED START", label)
	sale.AnnouncementEnabled = false
	_, label = ModelSaleCountdownTarget(sale, now.Add(60*time.Second))
	require.Equal(t, "PREVIEW / NOT PUBLISHED", label)
}
