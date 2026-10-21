package controller

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func credentialRouter(t *testing.T, role int) (*gin.Engine, func(string) map[string]string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	old, oldLog, oldType := model.DB, model.LOG_DB, common.MainDatabaseType()
	oldRedis := common.RedisEnabled
	common.RedisEnabled = false
	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		model.DB = old
		model.LOG_DB = oldLog
		common.SetMainDatabaseType(oldType)
		common.RedisEnabled = oldRedis
		_ = sqlDB.Close()
	})
	t.Setenv("BENEFITS_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	require.NoError(t, db.AutoMigrate(&model.UpstreamWallet{}, &model.UpstreamWalletCredential{}, &model.UpstreamWalletVault{}, &model.UpstreamWalletUnlockAttempt{}, &model.Log{}, &model.AuditLog{}, &model.User{}))
	require.NoError(t, db.Create(&model.User{Id: 1, Username: "test-root", Role: common.RoleRootUser, Status: common.UserStatusEnabled}).Error)
	require.NoError(t, db.Create(&model.UpstreamWallet{ID: 1, Name: "test-account", Remaining: 77}).Error)
	hash, err := common.Password2Hash("test-view-key")
	require.NoError(t, err)
	require.NoError(t, db.Create(&model.UpstreamWalletVault{Slot: "active", UnlockHash: hash}).Error)
	require.NoError(t, model.SaveUpstreamWalletCredential(1, model.UpstreamWalletLogin{Username: "test-user", Password: "test-provider-pass", LoginURL: "https://provider.example"}))
	private, err := common.GeneratePasswordEncryptionPrivateKey()
	require.NoError(t, err)
	require.NoError(t, common.LoadPasswordEncryptionPrivateKey(private))
	kid, public := common.PasswordEncryptionPublicKey()
	block, _ := pem.Decode([]byte(public))
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	require.NoError(t, err)
	encrypt := func(value string) map[string]string {
		data, e := rsa.EncryptOAEP(sha256.New(), rand.Reader, parsed.(*rsa.PublicKey), []byte(value), nil)
		require.NoError(t, e)
		return map[string]string{"encrypted": base64.StdEncoding.EncodeToString(data), "kid": kid}
	}
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("role", role); c.Set("id", 1) })
	r.GET("/wallet/:id/credential", GetUpstreamWalletCredentialStatus)
	r.GET("/wallet/encryption-key", GetUpstreamWalletEncryptionKey)
	r.POST("/wallet/:id/reveal", RevealUpstreamWalletCredential)
	r.PUT("/wallet/:id/credential", UpdateUpstreamWalletCredential)
	return r, encrypt
}

func credentialRequest(t *testing.T, r http.Handler, method, path string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	body, _ := json.Marshal(payload)
	w := httptest.NewRecorder()
	request := httptest.NewRequest(method, path, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, request)
	return w
}

func TestUpstreamWalletCredentialRootOnlyAndMetadata(t *testing.T) {
	for _, role := range []int{0, common.RoleCommonUser, common.RoleAdminUser, common.RoleRootUser} {
		t.Run(string(rune('a'+role)), func(t *testing.T) {
			r, _ := credentialRouter(t, role)
			w := credentialRequest(t, r, "GET", "/wallet/1/credential", nil)
			if role != common.RoleRootUser {
				require.Equal(t, 403, w.Code)
			} else {
				require.Equal(t, 200, w.Code)
				require.Contains(t, w.Body.String(), `"exists":true`)
			}
			require.NotContains(t, w.Body.String(), "test-provider-pass")
			require.NotContains(t, w.Body.String(), "test-user")
			require.Equal(t, "no-store, private", w.Header().Get("Cache-Control"))
			if role != common.RoleRootUser {
				denied := credentialRequest(t, r, "POST", "/wallet/1/reveal", map[string]string{})
				require.Equal(t, 403, denied.Code)
			}
		})
	}
}

func TestUpstreamWalletCredentialIndependentEncryptionKey(t *testing.T) {
	r, _ := credentialRouter(t, common.RoleRootUser)
	old := common.PasswordLoginEncryptionEnabled
	common.PasswordLoginEncryptionEnabled = false
	t.Cleanup(func() { common.PasswordLoginEncryptionEnabled = old })
	w := credentialRequest(t, r, "GET", "/wallet/encryption-key", nil)
	require.Equal(t, 200, w.Code)
	require.Contains(t, w.Body.String(), "public_key")
	require.NotContains(t, w.Body.String(), "PRIVATE KEY")
	require.False(t, common.PasswordLoginEncryptionEnabled)
}

func TestUpstreamWalletCredentialEncryptedUnlockAndAudit(t *testing.T) {
	r, encrypt := credentialRouter(t, common.RoleRootUser)
	wrong := encrypt("wrong-key")
	w := credentialRequest(t, r, "POST", "/wallet/1/reveal", map[string]string{"unlock_key_encrypted": wrong["encrypted"], "encryption_key_id": wrong["kid"]})
	require.Equal(t, 403, w.Code)
	require.NotContains(t, w.Body.String(), "test-provider-pass")
	valid := encrypt("test-view-key")
	w = credentialRequest(t, r, "POST", "/wallet/1/reveal", map[string]string{"unlock_key_encrypted": valid["encrypted"], "encryption_key_id": valid["kid"]})
	require.Equal(t, 200, w.Code)
	require.Contains(t, w.Body.String(), "test-provider-pass")
	require.Equal(t, "no-store, private", w.Header().Get("Cache-Control"))
	var logs []model.AuditLog
	require.NoError(t, model.LOG_DB.Find(&logs).Error)
	require.NotEmpty(t, logs)
	require.Len(t, logs, 2)
	require.False(t, logs[0].Success)
	require.Equal(t, 403, logs[0].Status)
	require.True(t, logs[1].Success)
	require.Equal(t, 200, logs[1].Status)
	encoded, err := json.Marshal(logs)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "test-provider-pass")
	require.NotContains(t, string(encoded), "test-view-key")
	require.NotContains(t, string(encoded), valid["encrypted"])
	var wallet model.UpstreamWallet
	require.NoError(t, model.DB.First(&wallet, 1).Error)
	require.Equal(t, 77.0, wallet.Remaining)
}

func TestUpstreamWalletCredentialRejectPlaintextAndUpdate(t *testing.T) {
	r, encrypt := credentialRouter(t, common.RoleRootUser)
	w := credentialRequest(t, r, "POST", "/wallet/1/reveal", map[string]string{"unlock_key": "test-view-key"})
	require.Equal(t, 403, w.Code)
	valid := encrypt("test-view-key")
	password := encrypt("updated-provider-pass")
	w = credentialRequest(t, r, "PUT", "/wallet/1/credential", map[string]string{"unlock_key_encrypted": valid["encrypted"], "encryption_key_id": valid["kid"], "username": "updated-user", "login_url": "https://provider.example/login", "password_encrypted": password["encrypted"]})
	require.Equal(t, 200, w.Code)
	require.NotContains(t, w.Body.String(), "updated-provider-pass")
	login, err := model.ReadUpstreamWalletCredential(1)
	require.NoError(t, err)
	require.Equal(t, "updated-provider-pass", login.Password)
}
