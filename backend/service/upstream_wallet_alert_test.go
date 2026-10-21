package service

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupWalletAlertTest(t *testing.T) *model.UpstreamWalletAlertConfig {
	t.Helper()
	db, e := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, e)
	sql, _ := db.DB()
	sql.SetMaxOpenConns(1)
	old, kind := model.DB, common.MainDatabaseType()
	model.DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() { model.DB = old; common.SetMainDatabaseType(kind); sql.Close() })
	t.Setenv("BENEFITS_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	require.NoError(t, db.AutoMigrate(&model.UpstreamWallet{}, &model.UpstreamWalletCredential{}, &model.UpstreamWalletAlertConfig{}, &model.UpstreamWalletAlertDelivery{}))
	c, e := model.GetUpstreamWalletAlertConfig()
	require.NoError(t, e)
	require.False(t, c.Enabled)
	c.Enabled = true
	c.Recipients = []string{"owner@example.com", "second@example.com"}
	require.NoError(t, model.SaveUpstreamWalletAlertConfig(c))
	return c
}

func alertWallet(t *testing.T, id int, provider string, remaining float64) {
	t.Helper()
	w := model.UpstreamWallet{ID: id, Name: fmt.Sprintf("%s account %d", provider, id), Provider: provider, Remaining: remaining, Conversion: 1000, Unit: "上游额度", CalibratedAt: 1}
	require.NoError(t, model.DB.Create(&w).Error)
	require.NoError(t, model.SaveUpstreamWalletCredential(id, model.UpstreamWalletLogin{Username: provider + "-login", Password: provider + "-private<&password", LoginURL: "https://provider.example/login"}))
}

func TestUpstreamWalletAlertsThresholdsMatchingCredentialsAndRecovery(t *testing.T) {
	c := setupWalletAlertTest(t)
	alertWallet(t, 1, "yylx", .999)
	alertWallet(t, 2, "2000run", 199.99)
	alertWallet(t, 3, "oranexa", .299)
	alertWallet(t, 4, "yylx", 1)
	alertWallet(t, 5, "2000run", 200)
	alertWallet(t, 6, "oranexa", .3)
	alertWallet(t, 7, "yylx", 0)
	require.NoError(t, model.DB.Model(&model.UpstreamWallet{}).Where("id = 7").Update("calibrated_at", 0).Error)
	alertWallet(t, 8, "other", 0)
	messages := []string{}
	send := func(subject, email, body string) error {
		require.Contains(t, c.Recipients, email)
		require.Contains(t, body, "private&lt;&amp;password")
		for _, provider := range []string{"yylx", "2000run", "oranexa"} {
			if strings.HasPrefix(subject, "Skymoni 上游余额预警 · "+provider+" account") {
				require.Contains(t, body, provider+"-login")
				require.Contains(t, body, provider+"-private&lt;&amp;password")
			}
		}
		messages = append(messages, body)
		return nil
	}
	require.NoError(t, RunUpstreamWalletAlertsOnce(send, 1000))
	require.Len(t, messages, 6)
	require.NoError(t, RunUpstreamWalletAlertsOnce(send, 1001))
	require.Len(t, messages, 6)
	require.NoError(t, RunUpstreamWalletAlertsOnce(send, 1000+86400))
	require.Len(t, messages, 12)
	require.NoError(t, model.DB.Model(&model.UpstreamWallet{}).Where("id = 1").Update("remaining", 10).Error)
	require.NoError(t, RunUpstreamWalletAlertsOnce(send, 1000+86401))
	require.Len(t, messages, 12)
	require.NoError(t, model.DB.Model(&model.UpstreamWallet{}).Where("id = 1").Update("remaining", .5).Error)
	require.NoError(t, RunUpstreamWalletAlertsOnce(send, 1000+86402))
	require.Len(t, messages, 14)
	var rows []model.UpstreamWalletAlertDelivery
	require.NoError(t, model.DB.Find(&rows).Error)
	raw, _ := json.Marshal(rows)
	require.NotContains(t, string(raw), "private")
	require.NotContains(t, string(raw), "-login")
	legacy := model.UpstreamWallet{Name: "柴犬 skymoni02", Provider: "Moni", CalibratedAt: 1, Remaining: 199}
	require.True(t, model.WalletNeedsAlert(c, &legacy))
}

func TestUpstreamWalletAlertsRetryUncertainAndStaleConfig(t *testing.T) {
	c := setupWalletAlertTest(t)
	alertWallet(t, 1, "yylx", .5)
	d, e := model.ClaimUpstreamWalletAlert(1, c.Recipients[0], 1000)
	require.NoError(t, e)
	require.NotNil(t, d)
	dup, e := model.ClaimUpstreamWalletAlert(1, c.Recipients[0], 1001)
	require.NoError(t, e)
	require.Nil(t, dup)
	require.NoError(t, DeliverUpstreamWalletAlert(d, func(string, string, string) error { return errors.New("provider-private-error") }, 1000))
	dup, e = model.ClaimUpstreamWalletAlert(1, c.Recipients[0], 1299)
	require.NoError(t, e)
	require.Nil(t, dup)
	d, e = model.ClaimUpstreamWalletAlert(1, c.Recipients[0], 1300)
	require.NoError(t, e)
	require.NotNil(t, d)
	require.NoError(t, DeliverUpstreamWalletAlert(d, func(string, string, string) error { return &common.EmailDeliveryUncertain{Err: errors.New("ack lost")} }, 1300))
	dup, e = model.ClaimUpstreamWalletAlert(1, c.Recipients[0], 1600)
	require.NoError(t, e)
	require.Nil(t, dup)
	d, e = model.ClaimUpstreamWalletAlert(1, c.Recipients[0], 1300+86400)
	require.NoError(t, e)
	require.NotNil(t, d)
	c.Recipients = []string{"new@example.com"}
	require.NoError(t, model.SaveUpstreamWalletAlertConfig(c))
	require.NoError(t, DeliverUpstreamWalletAlert(d, func(string, string, string) error {
		t.Fatal("removed recipient should not receive credentials")
		return nil
	}, 1300+86400))
	var row model.UpstreamWalletAlertDelivery
	require.NoError(t, model.DB.First(&row, "wallet_id = ? AND email = ?", 1, "owner@example.com").Error)
	require.Equal(t, "skipped", row.Status)
	require.NotContains(t, row.Result, "private")
	stale := *c
	stale.Revision--
	require.ErrorIs(t, model.SaveUpstreamWalletAlertConfig(&stale), model.ErrUpstreamWalletAlertConflict)
	c.Enabled = false
	require.NoError(t, model.SaveUpstreamWalletAlertConfig(c))
	require.NoError(t, RunUpstreamWalletAlertsOnce(func(string, string, string) error { t.Fatal("disabled"); return nil }, 100000))
}

func TestUpstreamWalletAlertsMissingCredentialsStillWarnsAndValidation(t *testing.T) {
	c := setupWalletAlertTest(t)
	alertWallet(t, 1, "yylx", .5)
	require.NoError(t, model.DB.Delete(&model.UpstreamWalletCredential{}, "wallet_id = 1").Error)
	d, e := model.ClaimUpstreamWalletAlert(1, c.Recipients[0], 1000)
	require.NoError(t, e)
	require.NoError(t, DeliverUpstreamWalletAlert(d, func(_, _, body string) error {
		require.Contains(t, body, "尚未录入")
		require.NotContains(t, body, "登录密码")
		return nil
	}, 1000))
	var row model.UpstreamWalletAlertDelivery
	require.NoError(t, model.DB.First(&row, "wallet_id = ? AND email = ?", 1, c.Recipients[0]).Error)
	require.Equal(t, "smtp_accepted_credentials_missing", row.Result)
	c.Recipients = []string{" owner@example.com ", "OWNER@example.com"}
	require.NoError(t, model.ValidateUpstreamWalletAlertConfig(c))
	require.Len(t, c.Recipients, 1)
	c.Recipients = []string{"owner@example.com\r\nBcc:leak@example.com"}
	require.Error(t, model.ValidateUpstreamWalletAlertConfig(c))
	c.Recipients = []string{}
	require.Error(t, model.ValidateUpstreamWalletAlertConfig(c))
	c.Recipients = []string{"owner@example.com"}
	c.OranexaThreshold = 0
	require.Error(t, model.ValidateUpstreamWalletAlertConfig(c))
}
