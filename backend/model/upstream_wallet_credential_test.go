package model

import (
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupWalletCredentialTest(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	old, oldType := DB, common.MainDatabaseType()
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() { DB = old; common.SetMainDatabaseType(oldType); _ = sqlDB.Close() })
	t.Setenv("BENEFITS_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	require.NoError(t, db.AutoMigrate(&UpstreamWallet{}, &UpstreamWalletCredential{}, &UpstreamWalletVault{}, &UpstreamWalletUnlockAttempt{}))
	hash, err := common.Password2Hash("test-view-key")
	require.NoError(t, err)
	require.NoError(t, db.Create(&UpstreamWalletVault{Slot: "active", UnlockHash: hash}).Error)
	require.NoError(t, db.Create(&UpstreamWallet{ID: 1, Name: "first", Remaining: 123, Revision: 1}).Error)
	require.NoError(t, db.Create(&UpstreamWallet{ID: 2, Name: "second", Remaining: 456, Revision: 1}).Error)
}

func TestUpstreamWalletCredentialEncryptedAndBound(t *testing.T) {
	setupWalletCredentialTest(t)
	login := UpstreamWalletLogin{Username: "upstream-user", Password: "test-provider-password", LoginURL: "https://provider.example/login", Note: "saved local record"}
	require.NoError(t, SaveUpstreamWalletCredential(1, login))
	var row UpstreamWalletCredential
	require.NoError(t, DB.First(&row, 1).Error)
	require.NotContains(t, row.Encrypted, login.Password)
	raw, err := json.Marshal(row)
	require.NoError(t, err)
	require.NotContains(t, string(raw), "encrypted")
	require.NotContains(t, string(raw), login.Password)
	stored, err := ReadUpstreamWalletCredential(1)
	require.NoError(t, err)
	require.Equal(t, login, *stored)
	row.WalletID = 2
	require.NoError(t, DB.Create(&row).Error)
	_, err = ReadUpstreamWalletCredential(2)
	require.ErrorIs(t, err, ErrWalletVaultUnavailable)
	var w UpstreamWallet
	require.NoError(t, DB.First(&w, 1).Error)
	require.Equal(t, 123.0, w.Remaining)
	require.Equal(t, 1, w.Revision)
}

func TestUpstreamWalletCredentialUpdateAndValidation(t *testing.T) {
	setupWalletCredentialTest(t)
	login := UpstreamWalletLogin{Username: "user", Password: "first-pass", LoginURL: "https://provider.example"}
	require.NoError(t, SaveUpstreamWalletCredential(1, login))
	login.Password = "updated-pass"
	require.NoError(t, SaveUpstreamWalletCredential(1, login))
	actual, err := ReadUpstreamWalletCredential(1)
	require.NoError(t, err)
	require.Equal(t, "updated-pass", actual.Password)
	var count int64
	require.NoError(t, DB.Model(&UpstreamWalletCredential{}).Count(&count).Error)
	require.Equal(t, int64(1), count)
	login.LoginURL = "javascript:alert(1)"
	require.Error(t, SaveUpstreamWalletCredential(1, login))
	login.LoginURL = "https://provider.example"
	require.ErrorIs(t, SaveUpstreamWalletCredential(999, login), ErrWalletCredentialMissing)
	_, err = ReadUpstreamWalletCredential(2)
	require.ErrorIs(t, err, ErrWalletCredentialMissing)
}

func TestUpstreamWalletUnlockPersistsFailureLimit(t *testing.T) {
	setupWalletCredentialTest(t)
	for i := 0; i < 4; i++ {
		require.ErrorIs(t, VerifyUpstreamWalletUnlock(99, "wrong-key"), ErrWalletUnlock)
	}
	require.ErrorIs(t, VerifyUpstreamWalletUnlock(99, "wrong-key"), ErrWalletUnlockLocked)
	require.ErrorIs(t, VerifyUpstreamWalletUnlock(99, "test-view-key"), ErrWalletUnlockLocked)
	var attempt UpstreamWalletUnlockAttempt
	require.NoError(t, DB.First(&attempt, 99).Error)
	require.Equal(t, 5, attempt.Failures)
	require.NoError(t, DB.Model(&attempt).Update("window_at", time.Now().Unix()-901).Error)
	require.NoError(t, VerifyUpstreamWalletUnlock(99, "test-view-key"))
	require.NoError(t, DB.First(&attempt, 99).Error)
	require.Zero(t, attempt.Failures)
}

func TestUpstreamWalletUnlockUnavailableAndIndependentUsers(t *testing.T) {
	setupWalletCredentialTest(t)
	require.ErrorIs(t, VerifyUpstreamWalletUnlock(0, "test-view-key"), ErrWalletUnlock)
	require.ErrorIs(t, VerifyUpstreamWalletUnlock(1, "wrong-key"), ErrWalletUnlock)
	require.NoError(t, VerifyUpstreamWalletUnlock(2, "test-view-key"))
	require.NoError(t, DB.Delete(&UpstreamWalletVault{}, "slot = ?", "active").Error)
	require.ErrorIs(t, VerifyUpstreamWalletUnlock(2, "test-view-key"), ErrWalletVaultUnavailable)
}

func TestUpstreamWalletCredentialKeyRequired(t *testing.T) {
	setupWalletCredentialTest(t)
	t.Setenv("BENEFITS_ENCRYPTION_KEY", "")
	require.ErrorIs(t, SaveUpstreamWalletCredential(1, UpstreamWalletLogin{Username: "user", Password: "test-pass", LoginURL: "https://provider.example"}), ErrWalletVaultUnavailable)
}
