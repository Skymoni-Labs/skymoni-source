package model

import (
	"encoding/json"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestHealthAutomaticRestoreProtectsManualAndChangedRoutes(t *testing.T) {
	setupChannelStatusTest(t)
	require.NoError(t, DB.AutoMigrate(&Option{}, &Model{}, &AuditLog{}))
	require.NoError(t, DB.Where("key LIKE ?", "SkymoniChannelHealth%").Delete(&Option{}).Error)
	ch := Channel{Name: "health", Key: "private", Models: "health-deepseek", Group: "default", Status: 1}
	require.NoError(t, DB.Create(&ch).Error)
	require.NoError(t, DB.Create(&Ability{ChannelId: ch.Id, Model: ch.Models, Group: "default", Enabled: true}).Error)
	p := ChannelHealthPool{ID: "test", Provider: "starway", Multiplier: 0.3, Model: ch.Models, Auto: true, Channels: map[int]string{ch.Id: ChannelHealthSignature(&ch)}}
	raw, _ := json.Marshal(ChannelHealthConfig{Enabled: true, Pools: []ChannelHealthPool{p}})
	require.NoError(t, DB.Create(&Option{Key: ChannelHealthConfigKey, Value: string(raw)}).Error)
	n, err := ApplyChannelHealth(p, false)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	n, err = ApplyChannelHealth(p, true)
	require.NoError(t, err)
	require.Zero(t, n) // unpublished
	meta := Model{ModelName: ch.Models, Status: 1}
	require.NoError(t, DB.Create(&meta).Error)
	t.Cleanup(func() { DB.Unscoped().Delete(&meta); DB.Where("key LIKE ?", "SkymoniChannelHealth%").Delete(&Option{}) })
	n, err = ApplyChannelHealth(p, true)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", ch.Id).Update("status", 2).Error)
	n, err = ApplyChannelHealth(p, true)
	require.NoError(t, err)
	require.Zero(t, n)
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", ch.Id).Updates(map[string]any{"status": 1, "key": "new-key"}).Error)
	n, err = ApplyChannelHealth(p, false)
	require.NoError(t, err)
	require.Zero(t, n)
}

func TestHealthLogRejectsEmptyAndFailedStreams(t *testing.T) {
	ok, count := ChannelHealthLogOutcome(Log{Type: LogTypeConsume, CompletionTokens: 0})
	require.False(t, ok)
	require.True(t, count)
	ok, count = ChannelHealthLogOutcome(Log{Type: LogTypeConsume, CompletionTokens: 3, Other: `{"stream_status":{"status":"error"}}`})
	require.False(t, ok)
	require.True(t, count)
	_, count = ChannelHealthLogOutcome(Log{Type: LogTypeError, Content: "context_length_exceeded"})
	require.False(t, count)
	_, count = ChannelHealthLogOutcome(Log{Type: LogTypeConsume, TokenName: "线路抽样检测"})
	require.False(t, count)
}

func TestHealthRecentLogsUseStoredChannelColumn(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Log{}))
	old := LOG_DB
	LOG_DB = DB
	t.Cleanup(func() { LOG_DB = old; DB.Where("token_name = ?", "health-query-fixture").Delete(&Log{}) })
	row := Log{ChannelId: 991234, CreatedAt: 12345, Type: LogTypeConsume, TokenName: "health-query-fixture", CompletionTokens: 1}
	require.NoError(t, DB.Create(&row).Error)
	rows, err := RecentChannelHealthLogs([]int{991234}, 12000)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, row.ChannelId, rows[0].ChannelId)
	rows, err = RecentChannelHealthLogs([]int{991235}, 12000)
	require.NoError(t, err)
	require.Empty(t, rows)
}
