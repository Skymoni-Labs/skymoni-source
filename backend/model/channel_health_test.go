package model

import (
	"encoding/json"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestHealthSharedModelPoolsRecoverTogether(t *testing.T) {
	setupChannelStatusTest(t)
	require.NoError(t, DB.AutoMigrate(&Option{}, &Model{}, &AuditLog{}))
	require.NoError(t, DB.Where("key LIKE ?", "SkymoniChannelHealth%").Delete(&Option{}).Error)
	t.Cleanup(func() { DB.Where("key LIKE ?", "SkymoniChannelHealth%").Delete(&Option{}) })
	ch := Channel{Name: "shared-gpt", Key: "private", Models: "health-astra,health-sol", Group: "default", Status: 1}
	require.NoError(t, DB.Create(&ch).Error)
	for _, name := range []string{"health-astra", "health-sol"} {
		require.NoError(t, DB.Create(&Model{ModelName: name, Status: 1}).Error)
		require.NoError(t, DB.Create(&Ability{ChannelId: ch.Id, Model: name, Group: "default", Enabled: true}).Error)
	}
	t.Cleanup(func() {
		DB.Unscoped().Where("model_name IN ?", []string{"health-astra", "health-sol"}).Delete(&Model{})
	})
	astra := ChannelHealthPool{ID: "shared-astra", Provider: "oranexa", Account: "shared", GroupID: 28, Model: "health-astra", Auto: true, Channels: map[int]string{ch.Id: ChannelHealthSignature(&ch)}}
	sol := astra
	sol.ID, sol.Model = "shared-sol", "health-sol"
	raw, err := json.Marshal(ChannelHealthConfig{Enabled: true, Pools: []ChannelHealthPool{astra, sol}})
	require.NoError(t, err)
	require.NoError(t, DB.Create(&Option{Key: ChannelHealthConfigKey, Value: string(raw)}).Error)
	n, err := ApplyChannelHealth(astra, false)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	n, err = ApplyChannelHealth(sol, true)
	require.NoError(t, err)
	require.Zero(t, n, "an unobserved peer cannot reopen shared keys")
	require.NoError(t, SaveChannelHealthState(astra.ID, ChannelHealthState{Failures: 3, LastAt: time.Now().Unix()}))
	n, err = ApplyChannelHealth(sol, true)
	require.NoError(t, err)
	require.Zero(t, n, "another model's failures retain the shared-key shutdown")
	require.NoError(t, SaveChannelHealthState(astra.ID, ChannelHealthState{Successes: 1, LastAt: time.Now().Unix()}))
	n, err = ApplyChannelHealth(sol, true)
	require.NoError(t, err)
	require.Equal(t, 1, n, "the recovered model can restore a peer-owned shutdown")
	var restored Channel
	require.NoError(t, DB.First(&restored, ch.Id).Error)
	require.Equal(t, 1, restored.Status)
	require.NoError(t, DB.Model(&Channel{}).Where("id = ?", ch.Id).Updates(map[string]any{"status": 2, "other_info": `{"status_reason":"manual operation"}`}).Error)
	n, err = ApplyChannelHealth(sol, true)
	require.NoError(t, err)
	require.Zero(t, n, "manual shutdown stays protected")
}

func TestHealthAutomaticRestoreProtectsManualAndChangedRoutes(t *testing.T) {
	setupChannelStatusTest(t)
	require.NoError(t, DB.AutoMigrate(&Option{}, &Model{}, &AuditLog{}))
	require.NoError(t, DB.Where("key LIKE ?", "SkymoniChannelHealth%").Delete(&Option{}).Error)
	ch := Channel{Name: "health", Key: "private", Models: "health-deepseek", Group: "default", Status: 1}
	require.NoError(t, DB.Create(&ch).Error)
	require.NoError(t, DB.Create(&Ability{ChannelId: ch.Id, Model: ch.Models, Group: "default", Enabled: true}).Error)
	p := ChannelHealthPool{ID: "test", Provider: "starway", Multiplier: 0.3, GroupID: 4, Model: ch.Models, Auto: true, Channels: map[int]string{ch.Id: ChannelHealthSignature(&ch)}}
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
	_, count = ChannelHealthLogOutcome(Log{Type: LogTypeConsume, CompletionTokens: 3, Other: `{"stream_status":{"status":"error","end_reason":"client_gone"}}`})
	require.False(t, count)
	_, count = ChannelHealthLogOutcome(Log{Type: LogTypeError, Content: "status_code=403, 内容审计命中风险规则，请调整输入后重试"})
	require.False(t, count)
	_, count = ChannelHealthLogOutcome(Log{Type: LogTypeConsume, TokenName: "线路抽样检测"})
	require.False(t, count)
}

func TestHealthOranexaGroupAutoManagement(t *testing.T) {
	setupChannelStatusTest(t)
	require.NoError(t, DB.AutoMigrate(&Option{}, &Model{}, &AuditLog{}))
	require.NoError(t, DB.Where("key LIKE ?", "SkymoniChannelHealth%").Delete(&Option{}).Error)
	ch := Channel{Name: "oranexa-group", Key: "private", Models: "test-oranexa-health", Group: "default", Status: 1}
	require.NoError(t, DB.Create(&ch).Error)
	require.NoError(t, DB.Create(&Ability{ChannelId: ch.Id, Model: ch.Models, Group: "default", Enabled: true}).Error)
	meta := Model{ModelName: ch.Models, Status: 1}
	require.NoError(t, DB.Create(&meta).Error)
	t.Cleanup(func() { DB.Unscoped().Delete(&meta); DB.Where("key LIKE ?", "SkymoniChannelHealth%").Delete(&Option{}) })
	p := ChannelHealthPool{ID: "oranexa", Provider: "oranexa", GroupID: 29, Multiplier: 0.07, Model: ch.Models, Auto: true, Channels: map[int]string{ch.Id: ChannelHealthSignature(&ch)}, ChannelAccounts: map[int]string{ch.Id: "account"}}
	raw, err := json.Marshal(ChannelHealthConfig{Enabled: true, Pools: []ChannelHealthPool{p}})
	require.NoError(t, err)
	require.NoError(t, DB.Create(&Option{Key: ChannelHealthConfigKey, Value: string(raw)}).Error)
	valid, err := ValidChannelHealthChannels(p)
	require.NoError(t, err)
	require.Len(t, valid, 1)
	p.ChannelAccounts = map[int]string{ch.Id: ""}
	_, err = ValidChannelHealthChannels(p)
	require.Error(t, err)
	p.ChannelAccounts[ch.Id] = "account"
	n, err := ApplyChannelHealth(p, false)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	n, err = ApplyChannelHealth(p, true)
	require.NoError(t, err)
	require.Equal(t, 1, n)
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

func TestHealthStarwayLowGroupOptIn(t *testing.T) {
	setupChannelStatusTest(t)
	require.NoError(t, DB.AutoMigrate(&Option{}, &Model{}, &AuditLog{}))
	require.NoError(t, DB.Where("key LIKE ?", "SkymoniChannelHealth%").Delete(&Option{}).Error)
	priority := int64(321)
	ch := Channel{Name: "low-group-health", Key: "private", Models: "test-low-health", Group: "default", Status: 1, Priority: &priority}
	require.NoError(t, DB.Create(&ch).Error)
	require.NoError(t, DB.Create(&Ability{ChannelId: ch.Id, Model: ch.Models, Group: "default", Enabled: true, Priority: &priority}).Error)
	meta := Model{ModelName: ch.Models, Status: 1}
	require.NoError(t, DB.Create(&meta).Error)
	t.Cleanup(func() { DB.Unscoped().Delete(&meta); DB.Where("key LIKE ?", "SkymoniChannelHealth%").Delete(&Option{}) })
	p := ChannelHealthPool{ID: "low", Provider: "starway", GroupID: 34, Multiplier: 0.003, Model: ch.Models, Auto: true, Channels: map[int]string{ch.Id: ChannelHealthSignature(&ch)}}
	for _, variant := range []ChannelHealthPool{
		{Auto: true, Provider: "unapproved-provider", GroupID: 34},
		{Auto: false, Provider: "starway", GroupID: 34},
		{Auto: true, Provider: "starway", GroupID: 0},
	} {
		variant.Channels = p.Channels
		n, err := ApplyChannelHealth(variant, false)
		require.NoError(t, err)
		require.Zero(t, n)
	}
	raw, err := json.Marshal(ChannelHealthConfig{Enabled: true, Pools: []ChannelHealthPool{p}})
	require.NoError(t, err)
	require.NoError(t, DB.Create(&Option{Key: ChannelHealthConfigKey, Value: string(raw)}).Error)
	n, err := ApplyChannelHealth(p, false)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	n, err = ApplyChannelHealth(p, true)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	var restored Channel
	require.NoError(t, DB.First(&restored, ch.Id).Error)
	require.Equal(t, 1, restored.Status)
	require.Equal(t, priority, *restored.Priority)
	var ability Ability
	require.NoError(t, DB.Where("channel_id = ?", ch.Id).First(&ability).Error)
	require.True(t, ability.Enabled)
	require.Equal(t, priority, *ability.Priority)
}
