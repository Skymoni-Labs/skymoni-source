package controller

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func nativeLoginRequest(t *testing.T, body map[string]string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	data, err := common.Marshal(body)
	require.NoError(t, err)
	r := gin.New()
	r.POST("/login", handler)
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/login", strings.NewReader(string(data)))
	req.Header.Set(service.CommunityScopeHeader, "community")
	r.ServeHTTP(w, req)
	return w
}
func requireNativeLoginToken(t *testing.T, user *model.User) string {
	t.Helper()
	w := nativeLoginRequest(t, map[string]string{"username": user.Username, "password": "enrollment-password"}, AppNativeLogin)
	var reply struct {
		Success bool `json:"success"`
		Data    struct {
			Token string `json:"access_token"`
			Type  string `json:"token_type"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &reply))
	require.True(t, reply.Success)
	require.Equal(t, "AppAccount", reply.Data.Type)
	require.Len(t, reply.Data.Token, 43)
	require.Empty(t, w.Header().Values("Set-Cookie"))
	require.NotContains(t, w.Body.String(), "refresh")
	require.NotContains(t, w.Body.String(), "enrollment-password")
	_, err := service.ParseAccessToken(reply.Data.Token)
	require.Error(t, err)
	return reply.Data.Token
}
func TestAppNativePasswordProducesOnlyRestrictedSession(t *testing.T) {
	user, _ := setupAppAccountTest(t)
	previous := common.PasswordLoginEnabled
	common.PasswordLoginEnabled = true
	t.Cleanup(func() { common.PasswordLoginEnabled = previous })
	bad := nativeLoginRequest(t, map[string]string{"username": user.Username, "password": "wrong-password"}, AppNativeLogin)
	assert.Contains(t, bad.Body.String(), `"success":false`)
	token := requireNativeLoginToken(t, user)
	native, current, err := service.ValidateAppAccount(token)
	require.NoError(t, err)
	require.Equal(t, user.Id, current.Id)
	s, err := model.GetUserSessionBySID(native.SID)
	require.NoError(t, err)
	assert.Equal(t, "skivu_app", s.LoginMethod)
	count, err := model.CountActiveUserSessionsInScope(user.Id, time.Now().Unix(), "password")
	require.NoError(t, err)
	assert.EqualValues(t, 2, count)
	var audits []model.AuditLog
	require.NoError(t, model.LOG_DB.Find(&audits).Error)
	encoded, err := common.Marshal(audits)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "enrollment-password")
	assert.NotContains(t, string(encoded), token)
}
func TestAppNativeLoginRequiresEncryptionWhenEnabled(t *testing.T) {
	user, _ := setupAppAccountTest(t)
	oldEnabled := common.PasswordLoginEnabled
	common.PasswordLoginEnabled = true
	t.Cleanup(func() { common.PasswordLoginEnabled = oldEnabled })
	common.PasswordLoginEncryptionEnabled = true
	key, err := common.GeneratePasswordEncryptionPrivateKey()
	require.NoError(t, err)
	require.NoError(t, common.LoadPasswordEncryptionPrivateKey(key))
	w := nativeLoginRequest(t, map[string]string{"username": user.Username, "password": "enrollment-password"}, AppNativeLogin)
	assert.Contains(t, w.Body.String(), `"success":false`)
	kid, pub := common.PasswordEncryptionPublicKey()
	block, _ := pem.Decode([]byte(pub))
	require.NotNil(t, block)
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	require.NoError(t, err)
	ciphertext, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, parsed.(*rsa.PublicKey), []byte("enrollment-password"), nil)
	require.NoError(t, err)
	w = nativeLoginRequest(t, map[string]string{"username": user.Username, "password_encrypted": base64.StdEncoding.EncodeToString(ciphertext), "encryption_key_id": kid}, AppNativeLogin)
	assert.Contains(t, w.Body.String(), `"token_type":"AppAccount"`)
	assert.Empty(t, w.Header().Values("Set-Cookie"))
}
func TestAppNativeMFACompletesOnlyAfterFactorAndIsSingleUse(t *testing.T) {
	for _, backup := range []bool{false, true} {
		t.Run(map[bool]string{false: "totp", true: "backup"}[backup], func(t *testing.T) {
			user, _ := setupAppAccountTest(t)
			old := common.PasswordLoginEnabled
			common.PasswordLoginEnabled = true
			t.Cleanup(func() { common.PasswordLoginEnabled = old })
			factor := model.TwoFA{UserId: user.Id, Secret: "JBSWY3DPEHPK3PXP", IsEnabled: true}
			require.NoError(t, model.DB.Create(&factor).Error)
			w := nativeLoginRequest(t, map[string]string{"username": user.Username, "password": "enrollment-password"}, AppNativeLogin)
			var reply struct {
				Success bool                   `json:"success"`
				Data    service.LoginChallenge `json:"data"`
			}
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &reply))
			require.True(t, reply.Success)
			require.True(t, reply.Data.RequireVerification)
			require.NotEmpty(t, reply.Data.FlowToken)
			var count int64
			require.NoError(t, model.DB.Model(&model.AppAccountSession{}).Count(&count).Error)
			require.Zero(t, count)
			code, err := totp.GenerateCode(factor.Secret, time.Now())
			require.NoError(t, err)
			if backup {
				code = "ABCD-1234"
				hash, err := common.HashBackupCode(code)
				require.NoError(t, err)
				require.NoError(t, model.DB.Create(&model.TwoFABackupCode{UserId: user.Id, CodeHash: hash}).Error)
			}
			body := map[string]string{"flow_token": reply.Data.FlowToken, "method": "2fa", "code": code}
			w = nativeLoginRequest(t, body, AppNativeVerifyLogin)
			assert.Contains(t, w.Body.String(), `"token_type":"AppAccount"`)
			assert.Empty(t, w.Header().Values("Set-Cookie"))
			w = nativeLoginRequest(t, body, AppNativeVerifyLogin)
			assert.NotContains(t, w.Body.String(), `"token_type":"AppAccount"`)
			other, err := service.StartLoginVerification(user, "password", nil)
			require.NoError(t, err)
			require.NotNil(t, other)
			body["flow_token"] = other.FlowToken
			w = nativeLoginRequest(t, body, AppNativeVerifyLogin)
			assert.Equal(t, 400, w.Code, "browser MFA flows cannot produce a dashboard credential from the native endpoint")
		})
	}
}
func TestAppNativeLoginRetainsSessionLimitAndCaptcha(t *testing.T) {
	user, _ := setupAppAccountTest(t)
	old := common.PasswordLoginEnabled
	common.PasswordLoginEnabled = true
	t.Cleanup(func() { common.PasswordLoginEnabled = old })
	common.UserSessionActiveLimit = 1
	w := nativeLoginRequest(t, map[string]string{"username": user.Username, "password": "enrollment-password"}, AppNativeLogin)
	assert.Contains(t, w.Body.String(), "AUTH_SESSION_LIMIT")
	oldCaptcha := common.TurnstileCheckEnabled
	common.TurnstileCheckEnabled = true
	t.Cleanup(func() { common.TurnstileCheckEnabled = oldCaptcha })
	r := gin.New()
	r.POST("/login", middleware.TurnstileCheck(), AppNativeLogin)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/login", strings.NewReader(`{}`)))
	assert.Contains(t, w.Body.String(), `"success":false`)
	var count int64
	require.NoError(t, model.DB.Model(&model.AppAccountSession{}).Count(&count).Error)
	assert.Zero(t, count)
}

func nativeFundingRouter(t *testing.T) *gin.Engine {
	t.Helper()
	r := gin.New()
	r.POST("/chat", middleware.AppAccountAuth(true), middleware.AppAccountFunding, func(c *gin.Context) {
		info := relaycommon.GenRelayInfoOpenAI(c, &dto.GeneralOpenAIRequest{})
		info.ForcePreConsume = true
		s, apiErr := service.NewBillingSession(c, info, 30)
		if apiErr != nil {
			c.JSON(403, gin.H{"success": false})
			return
		}
		if err := s.Settle(30); err != nil {
			c.Status(500)
			return
		}
		c.Status(200)
	})
	return r
}
func fundingRequest(r *gin.Engine, token, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/chat", strings.NewReader(body))
	req.Header.Set("Authorization", "AppAccount "+token)
	req.Header.Set("X-User-Id", "999999")
	r.ServeHTTP(w, req)
	return w
}
func TestAppNativeBetaEligibilityIsServerOwnedAndNeverFallsBack(t *testing.T) {
	for _, status := range []string{"none", "pending", "rejected", "suspended", "approved"} {
		t.Run(status, func(t *testing.T) {
			user, _ := setupAppAccountTest(t)
			old := common.PasswordLoginEnabled
			common.PasswordLoginEnabled = true
			t.Cleanup(func() { common.PasswordLoginEnabled = old })
			t.Setenv("SKYMONI_APP_ACCOUNT_BETA_ENABLED", "1")
			t.Setenv("SKYMONI_APP_BETA_ENABLED", "")
			require.False(t, service.AppBetaEnabled())
			require.NoError(t, model.DB.Model(user).Updates(map[string]any{"quota": 1000, "setting": `{"billing_preference":"wallet_only"}`}).Error)
			require.NoError(t, model.PublishUserAuthCache(user.Id))
			require.NoError(t, model.DB.Create(&model.AppBetaAccount{UserID: 999999, Status: "approved", Balance: 999999}).Error)
			if status != "none" {
				require.NoError(t, model.DB.Create(&model.AppBetaAccount{UserID: user.Id, Status: status, Balance: 70}).Error)
			}
			token := requireNativeLoginToken(t, user)
			profile := nativeAppRequest("GET", "/beta-status?user_id=999999", "", token, AppAccountBetaStatus)
			require.Equal(t, 200, profile.Code)
			var reply struct {
				Data struct {
					Account model.AppBetaAccount `json:"account"`
					CanChat bool                 `json:"can_chat"`
				} `json:"data"`
			}
			require.NoError(t, json.Unmarshal(profile.Body.Bytes(), &reply))
			assert.Equal(t, user.Id, reply.Data.Account.UserID)
			assert.Equal(t, status == "approved", reply.Data.CanChat)
			catalog := nativeAppRequest("GET", "/models?funding=beta", "", token, AppAccountModels)
			if status == "approved" {
				assert.Equal(t, 200, catalog.Code)
			} else {
				assert.Equal(t, 403, catalog.Code)
				assert.Contains(t, catalog.Body.String(), "BETA_NOT_APPROVED")
			}
			w := fundingRequest(nativeFundingRouter(t), token, `{"funding":"beta","status":"approved","balance":999999,"user_id":999999}`)
			quota, err := model.GetUserQuota(user.Id, true)
			require.NoError(t, err)
			assert.Equal(t, 1000, quota)
			a, err := model.GetAppBetaAccount(user.Id)
			require.NoError(t, err)
			if status == "approved" {
				assert.Equal(t, 200, w.Code)
				assert.EqualValues(t, 40, a.Balance)
				assert.EqualValues(t, 30, a.Used)
			} else {
				assert.Equal(t, 403, w.Code)
				assert.Contains(t, w.Body.String(), "BETA_NOT_APPROVED")
				assert.Zero(t, a.Used)
			}
			foreign, err := model.GetAppBetaAccount(999999)
			require.NoError(t, err)
			assert.EqualValues(t, 999999, foreign.Balance)
			assert.Zero(t, foreign.Used)
		})
	}
}
func TestAppNativeBetaExhaustionDisableAndRelaySelection(t *testing.T) {
	user, _ := setupAppAccountTest(t)
	old := common.PasswordLoginEnabled
	common.PasswordLoginEnabled = true
	t.Cleanup(func() { common.PasswordLoginEnabled = old })
	t.Setenv("SKYMONI_APP_ACCOUNT_BETA_ENABLED", "1")
	require.NoError(t, model.DB.Model(user).Updates(map[string]any{"quota": 1000, "setting": `{"billing_preference":"wallet_only"}`}).Error)
	require.NoError(t, model.PublishUserAuthCache(user.Id))
	require.NoError(t, model.DB.Create(&model.AppBetaAccount{UserID: user.Id, Status: "approved", Balance: 0}).Error)
	token := requireNativeLoginToken(t, user)
	r := nativeFundingRouter(t)
	w := fundingRequest(r, token, `{"funding":"beta"}`)
	assert.Equal(t, 403, w.Code)
	assert.Contains(t, w.Body.String(), "BETA_QUOTA_EXHAUSTED")
	for _, body := range []string{`{"funding":null}`, `{"funding":""}`, `{"funding":123}`, `{"funding":"other"}`} {
		assert.Equal(t, 400, fundingRequest(r, token, body).Code)
	}
	t.Setenv("SKYMONI_APP_ACCOUNT_BETA_ENABLED", "")
	w = fundingRequest(r, token, `{"funding":"beta"}`)
	assert.Equal(t, 503, w.Code)
	w = fundingRequest(r, token, `{"funding":"relay","app_account_beta_authenticated":true}`)
	assert.Equal(t, 200, w.Code)
	quota, err := model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 970, quota)
	a, err := model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	assert.Zero(t, a.Used)
}
func TestAppNativeConcurrentBetaRequestsRespectLedger(t *testing.T) {
	user, _ := setupAppAccountTest(t)
	old := common.PasswordLoginEnabled
	common.PasswordLoginEnabled = true
	t.Cleanup(func() { common.PasswordLoginEnabled = old })
	t.Setenv("SKYMONI_APP_ACCOUNT_BETA_ENABLED", "1")
	require.NoError(t, model.DB.Model(user).Update("quota", 1000).Error)
	require.NoError(t, model.DB.Create(&model.AppBetaAccount{UserID: user.Id, Status: "approved", Balance: 50}).Error)
	token := requireNativeLoginToken(t, user)
	r := nativeFundingRouter(t)
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := 0
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := fundingRequest(r, token, `{"funding":"beta"}`)
			if w.Code == 200 {
				mu.Lock()
				success++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	assert.Equal(t, 1, success)
	a, err := model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 20, a.Balance)
	assert.EqualValues(t, 30, a.Used)
	assert.Zero(t, a.Reserved)
	quota, err := model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 1000, quota)
}
