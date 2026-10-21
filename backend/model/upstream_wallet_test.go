package model

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"testing"
	"time"
)

func TestUpstreamWalletLedger(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	old, oldLog, oldType := DB, LOG_DB, common.MainDatabaseType()
	DB = db
	LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() { DB = old; LOG_DB = oldLog; common.SetMainDatabaseType(oldType); _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&UpstreamWallet{}, &UpstreamWalletBinding{}, &UpstreamWalletEvent{}, &Log{}))
	now := time.Now().Unix()
	wallet := UpstreamWallet{Name: "shared", Provider: "yylx", Unit: "USD", Remaining: 10, Conversion: 75, Revision: 1, CalibratedAt: now}
	require.NoError(t, db.Create(&wallet).Error)
	log := &Log{CreatedAt: now, Type: LogTypeConsume, ChannelId: 123, ModelName: "test"}
	payload := map[string]any{"root_info": map[string]any{"upstream_wallet_cost": UpstreamWalletSnapshot{WalletID: wallet.ID, Revision: 1, Cost: .2, Status: "priced"}}}
	raw, _ := json.Marshal(payload)
	log.Other = string(raw)
	require.NoError(t, db.Create(log).Error)
	require.NoError(t, ApplyUpstreamWalletLog(log))
	require.NoError(t, ApplyUpstreamWalletLog(log))
	require.NoError(t, db.First(&wallet, wallet.ID).Error)
	require.InDelta(t, 9.8, wallet.Remaining, 1e-12)
	require.NoError(t, AdjustUpstreamWallet(wallet.ID, 1, "recharge", 3, now, "充值补记"))
	require.NoError(t, db.First(&wallet, wallet.ID).Error)
	require.InDelta(t, 12.8, wallet.Remaining, 1e-12)
	require.NoError(t, AdjustUpstreamWallet(wallet.ID, 1, "calibrate", 20, now, "重新核验"))
	require.Error(t, AdjustUpstreamWallet(wallet.ID, 1, "calibrate", 99, now, "旧修订"))
	log.Id = 0
	require.NoError(t, db.Create(log).Error)
	require.NoError(t, ApplyUpstreamWalletLog(log))
	require.NoError(t, db.First(&wallet, wallet.ID).Error)
	require.Equal(t, 20.0, wallet.Remaining)
	require.NotContains(t, formatLogOtherJSON(log.Other, logOtherVisibilityUser), "upstream_wallet_cost")
	// Replay a durable snapshot left behind by a failed ledger insertion.
	require.NoError(t, db.Create(&UpstreamWalletBinding{ChannelID: 123, WalletID: wallet.ID}).Error)
	log.Id = 0
	payload["root_info"].(map[string]any)["upstream_wallet_cost"] = UpstreamWalletSnapshot{WalletID: wallet.ID, Revision: 2, Cost: .3, Status: "priced"}
	raw, _ = json.Marshal(payload)
	log.Other = string(raw)
	require.NoError(t, db.Create(log).Error)
	require.NoError(t, RepairUpstreamWalletLogs())
	require.NoError(t, RepairUpstreamWalletLogs())
	require.NoError(t, db.First(&wallet, wallet.ID).Error)
	require.InDelta(t, 19.7, wallet.Remaining, 1e-12)
}
