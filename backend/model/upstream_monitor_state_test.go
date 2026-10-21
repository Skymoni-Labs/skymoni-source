package model

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpstreamMonitorStateKeepsLastChangeAcrossIdenticalReads(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	previous := DB
	DB = db
	t.Cleanup(func() {
		DB = previous
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&UpstreamMonitorState{}))
	start := time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)
	state, err := GetUpstreamMonitorState("yylx")
	require.NoError(t, err)
	require.Nil(t, state)
	first, err := SaveUpstreamMonitorState("yylx", `[{"name":"model-a"}]`, "[]", false, start)
	require.NoError(t, err)
	require.Equal(t, start.Unix(), first.ChangedAt)
	same, err := SaveUpstreamMonitorState("yylx", `[{"name":"model-a"}]`, "[]", false, start.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, start.Unix(), same.ChangedAt)
	require.Equal(t, start.Add(time.Minute).Unix(), same.CheckedAt)
	changed, err := SaveUpstreamMonitorState("yylx", `[{"name":"model-b"}]`, `[{"name":"model-b"}]`, true, start.Add(2*time.Minute))
	require.NoError(t, err)
	require.Equal(t, start.Add(2*time.Minute).Unix(), changed.ChangedAt)
	require.Equal(t, start.Add(2*time.Minute).Unix(), changed.PriceChangedAt)
	require.Equal(t, `[{"name":"model-b"}]`, changed.PriceChanges)
	sameAgain, err := SaveUpstreamMonitorState("yylx", `[{"name":"model-b"}]`, "[]", false, start.Add(3*time.Minute))
	require.NoError(t, err)
	require.Equal(t, changed.PriceChangedAt, sameAgain.PriceChangedAt)
	require.Equal(t, changed.PriceChanges, sameAgain.PriceChanges)
	reloaded, err := GetUpstreamMonitorState("yylx")
	require.NoError(t, err)
	require.Equal(t, changed.Summary, reloaded.Summary)
}
