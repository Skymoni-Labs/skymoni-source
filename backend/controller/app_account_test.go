package controller

import (
	"fmt"
	"net/http"
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
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupAppAccountTest(t *testing.T) (*model.User, service.AuthIdentity) {
	user, identity := setupSecurityEnrollmentTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.AppAccountGrant{}, &model.AppAccountSession{}, &model.AppBetaAccount{}, &model.AppBetaLedger{}, &model.AppBetaCharge{}, &model.SubscriptionPlan{}, &model.UserSubscription{}, &model.SubscriptionPreConsumeRecord{}))
	oldLimit, oldIssuance := common.UserSessionActiveLimit, common.UserSessionIssuanceLimit
	common.UserSessionActiveLimit = 20
	common.UserSessionIssuanceLimit = 50
	t.Cleanup(func() { common.UserSessionActiveLimit = oldLimit; common.UserSessionIssuanceLimit = oldIssuance })
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		sql, err := model.DB.DB()
		require.NoError(t, err)
		sql.SetMaxOpenConns(1)
	}
	return user, identity
}
func approveAppAccountTest(t *testing.T, user *model.User) (string, string, string) {
	t.Helper()
	verifier := strings.Repeat("v", 43)
	challenge, err := service.AppAccountChallenge(verifier)
	require.NoError(t, err)
	device, code, err := service.CreateAppAccountGrant(challenge, "我的 Android")
	require.NoError(t, err)
	require.NoError(t, model.DecideAppAccountGrant(service.AppBetaHash(code), user.Id, user.AuthVersion, true))
	return device, code, verifier
}
func nativeAppRequest(method, path, body, token string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	r := gin.New()
	r.Handle(method, path, middleware.AppAccountAuth(false), handler)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "AppAccount "+token)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func TestAppAccountGrantPKCESessionsAndRevocation(t *testing.T) {
	user, _ := setupAppAccountTest(t)
	verifier := strings.Repeat("v", 43)
	challenge, err := service.AppAccountChallenge(verifier)
	require.NoError(t, err)
	device, code, err := service.CreateAppAccountGrant(challenge, "手机")
	require.NoError(t, err)
	_, _, err = service.ExchangeAppAccount(device, strings.Repeat("x", 43), "127.0.0.1", "test")
	require.ErrorIs(t, err, model.ErrAppGrantInvalid)
	_, _, err = service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
	require.ErrorIs(t, err, model.ErrAppGrantPending)
	_, _, err = service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
	require.ErrorIs(t, err, model.ErrAppGrantSlow)
	require.NoError(t, model.DecideAppAccountGrant(service.AppBetaHash(code), user.Id, user.AuthVersion, true))
	require.Error(t, model.DecideAppAccountGrant(service.AppBetaHash(code), user.Id, user.AuthVersion, true))
	require.NoError(t, model.DB.Model(&model.AppAccountGrant{}).Where("device_hash = ?", service.AppBetaHash(device)).Update("next_poll_at", 0).Error)
	token, native, err := service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
	require.NoError(t, err)
	_, err = service.ParseAccessToken(token)
	require.Error(t, err, "native credential must not become a dashboard credential")
	_, _, err = service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
	require.ErrorIs(t, err, model.ErrAppGrantExpired)
	_, _, err = service.ValidateAppAccount(token)
	require.NoError(t, err)
	s, err := model.GetUserSessionBySID(native.SID)
	require.NoError(t, err)
	assert.Equal(t, "skivu_app", s.LoginMethod)
	count, err := model.CountActiveUserSessionsInScope(user.Id, time.Now().Unix(), "password")
	require.NoError(t, err)
	assert.EqualValues(t, 2, count)
	me := nativeAppRequest("GET", "/me", "", token, AppAccountMe)
	require.Equal(t, 200, me.Code)
	for _, field := range []string{"password", "access_token", "auth_version", "role", "email"} {
		assert.NotContains(t, me.Body.String(), `"`+field+`"`)
	}
	require.NoError(t, model.DB.AutoMigrate(&model.AppAccountGrant{}, &model.AppAccountSession{}))
	_, _, err = service.ValidateAppAccount(token)
	require.NoError(t, err, "additive re-migration keeps sessions")
	_, err = model.RevokeUserSession(user.Id, native.SID, "website_security")
	require.NoError(t, err)
	_, _, err = service.ValidateAppAccount(token)
	require.Error(t, err)
	assert.Equal(t, 401, nativeAppRequest("GET", "/me", "", token, AppAccountMe).Code)
}

func TestAppAccountLimitsDenialExpiryAndAuthVersion(t *testing.T) {
	user, _ := setupAppAccountTest(t)
	device, _, verifier := approveAppAccountTest(t, user)
	common.UserSessionActiveLimit = 1
	_, _, err := service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
	require.ErrorIs(t, err, model.ErrUserSessionLimit)
	common.UserSessionActiveLimit = 20
	common.UserSessionIssuanceLimit = 1
	_, _, err = service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
	require.ErrorIs(t, err, model.ErrUserSessionIssuanceLimit)
	common.UserSessionIssuanceLimit = 50
	token, _, err := service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(user).Update("auth_version", user.AuthVersion+1).Error)
	_, _, err = service.ValidateAppAccount(token)
	require.Error(t, err, "password/security version invalidates native sessions")
	challenge, err := service.AppAccountChallenge(verifier)
	require.NoError(t, err)
	d, c, err := service.CreateAppAccountGrant(challenge, "拒绝")
	require.NoError(t, err)
	require.NoError(t, model.DecideAppAccountGrant(service.AppBetaHash(c), user.Id, user.AuthVersion, false))
	_, _, err = service.ExchangeAppAccount(d, verifier, "127.0.0.1", "test")
	require.ErrorIs(t, err, model.ErrAppGrantDenied)
	d, _, err = service.CreateAppAccountGrant(challenge, "过期")
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(&model.AppAccountGrant{}).Where("device_hash = ?", service.AppBetaHash(d)).Update("expires_at", time.Now().Unix()-1).Error)
	_, _, err = service.ExchangeAppAccount(d, verifier, "127.0.0.1", "test")
	require.ErrorIs(t, err, model.ErrAppGrantExpired)
}

func TestAppAccountConcurrentGrantIsOneUse(t *testing.T) {
	user, _ := setupAppAccountTest(t)
	device, _, verifier := approveAppAccountTest(t, user)
	var wg sync.WaitGroup
	var mu sync.Mutex
	success := 0
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, err := service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
			if err == nil {
				mu.Lock()
				success++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	assert.Equal(t, 1, success)
	var count int64
	require.NoError(t, model.DB.Model(&model.AppAccountSession{}).Count(&count).Error)
	assert.EqualValues(t, 1, count)
}

func TestAppAccountBrowserScopeAndOrdinaryFunding(t *testing.T) {
	user, identity := setupAppAccountTest(t)
	_, code, _ := approveAppAccountTest(t, user)
	path := "/authorization?code=" + code
	w := securityEnrollmentRequest("GET", path, "", "", identity, middleware.AppAccountBrowserSession)
	require.Equal(t, 200, w.Code)
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = httptest.NewRequest("POST", "/authorization", nil)
	c.Set("id", user.Id)
	middleware.AppAccountBrowserSession(c)
	require.Equal(t, 403, response.Code, "id/PAT alone cannot authorize")
	response = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(response)
	c.Request = httptest.NewRequest("GET", "/authorization", nil)
	c.Request.Header.Set(service.CommunityScopeHeader, "community")
	c.Set("id", user.Id)
	c.Set("session_id", identity.SessionID)
	c.Set("auth_version", identity.UserAuthVersion)
	c.Set("session_version", identity.SessionVersion)
	middleware.AppAccountBrowserSession(c)
	require.Equal(t, 403, response.Code)
	device, _, verifier := approveAppAccountTest(t, user)
	token, _, err := service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(user).Updates(map[string]any{"quota": 1000, "setting": `{"billing_preference":"wallet_only"}`}).Error)
	require.NoError(t, model.PublishUserAuthCache(user.Id))
	require.NoError(t, model.ApplyAppBeta(user.Id, "独立资金"))
	a, err := model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	require.NoError(t, model.ReviewAppBeta(user.Id, 99, model.AppBetaReview{Action: "approve", Amount: 777, Version: a.Version, OperationID: "account-wallet-isolation"}))
	r := gin.New()
	r.POST("/chat", middleware.AppAccountAuth(true), func(c *gin.Context) {
		info := relaycommon.GenRelayInfoOpenAI(c, &dto.GeneralOpenAIRequest{})
		assert.True(t, info.IsPlayground)
		assert.False(t, info.IsAppBeta)
		info.ForcePreConsume = true
		s, apiErr := service.NewBillingSession(c, info, 20)
		require.Nil(t, apiErr)
		require.NoError(t, s.Settle(30))
		c.Status(200)
	})
	req := httptest.NewRequest("POST", "/chat", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "AppAccount "+token)
	response = httptest.NewRecorder()
	r.ServeHTTP(response, req)
	require.Equal(t, 200, response.Code)
	quota, err := model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 970, quota)
	a, err = model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 777, a.Balance)
	assert.Zero(t, a.Used)
	// A native token cannot be sent to the browser authorization guard.
	response = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(response)
	c.Request = httptest.NewRequest(http.MethodGet, fmt.Sprint("/authorization?code=", code), nil)
	c.Request.Header.Set("Authorization", "AppAccount "+token)
	middleware.UserAuth()(c)
	require.NotEqual(t, 200, response.Code)
}

func TestAppAccountRetainsSubscriptionFundingPreference(t *testing.T) {
	user, _ := setupAppAccountTest(t)
	require.NoError(t, model.DB.Model(user).Update("quota", 1000).Error)
	plan := model.SubscriptionPlan{Title: "App ordinary subscription", TotalAmount: 100, Currency: "USD", QuotaResetPeriod: "never"}
	require.NoError(t, model.DB.Create(&plan).Error)
	sub := model.UserSubscription{UserId: user.Id, PlanId: plan.Id, AmountTotal: 100, StartTime: time.Now().Unix() - 1, EndTime: time.Now().Unix() + 3600, Status: "active", AllowWalletOverflow: false}
	require.NoError(t, model.DB.Create(&sub).Error)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/api/app-account/chat/completions", nil)
	info := &relaycommon.RelayInfo{IsPlayground: true, UserId: user.Id, RequestId: "native-subscription-1", ForcePreConsume: true}
	info.UserSetting.BillingPreference = "subscription_only"
	s, apiErr := service.NewBillingSession(c, info, 20)
	require.Nil(t, apiErr)
	require.Equal(t, service.BillingSourceSubscription, info.BillingSource)
	require.NoError(t, s.Settle(30))
	require.NoError(t, model.DB.First(&sub, sub.Id).Error)
	assert.EqualValues(t, 30, sub.AmountUsed)
	quota, err := model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 1000, quota)
	info = &relaycommon.RelayInfo{IsPlayground: true, UserId: user.Id, RequestId: "native-subscription-2", ForcePreConsume: true}
	info.UserSetting.BillingPreference = "subscription_only"
	_, apiErr = service.NewBillingSession(c, info, 80)
	require.NotNil(t, apiErr, "subscription-only must not silently fall back to wallet")
	quota, err = model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 1000, quota)
}
