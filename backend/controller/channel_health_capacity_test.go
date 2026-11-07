package controller

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestChannelHealthRoundProcessesSeventeenthPool(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.User{}, &model.Channel{}))
	previous := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = previous
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	require.NoError(t, db.Create(&model.User{Username: "health-capacity-root", Role: common.RoleRootUser}).Error)
	config := model.ChannelHealthConfig{Enabled: true}
	for i := range 17 {
		// A missing channel must record an unknown state without issuing a probe.
		config.Pools = append(config.Pools, model.ChannelHealthPool{
			ID: fmt.Sprintf("capacity-%02d", i), Channels: map[int]string{9000 + i: "changed"},
		})
	}
	raw, err := json.Marshal(config)
	require.NoError(t, err)
	require.NoError(t, db.Create(&model.Option{Key: model.ChannelHealthConfigKey, Value: string(raw)}).Error)
	runChannelHealthRound()
	for _, pool := range config.Pools {
		state := model.ReadChannelHealthState(pool.ID)
		require.Equal(t, "unknown", state.Status, pool.ID)
		require.NotZero(t, state.LastAt, pool.ID)
		require.Empty(t, state.History, "invalid routes must not fabricate samples")
	}
	var lease model.Option
	require.NoError(t, db.Where("key = ?", "SkymoniChannelHealthLease").First(&lease).Error)
	require.Equal(t, "0", lease.Value, "the larger round must release its own lease")
}
