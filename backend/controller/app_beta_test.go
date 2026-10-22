package controller

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupAppBetaTest(t *testing.T) *model.User {
	t.Helper()
	user, _ := setupSecurityEnrollmentTest(t)
	models := []any{&model.AppBetaAccount{}, &model.AppBetaLedger{}, &model.AppBetaCharge{}, &model.AppBetaDevice{}, &model.AppBetaChallenge{}, &model.AppBetaNonce{}}
	require.NoError(t, model.DB.AutoMigrate(models...))
	require.NoError(t, model.DB.Model(user).Updates(map[string]any{"quota": 314159, "used_quota": 7}).Error)
	// Exercise idempotent upgrade after existing data, rather than only empty migrations.
	require.NoError(t, model.ApplyAppBeta(user.Id, "测试内测"))
	require.NoError(t, model.DB.AutoMigrate(models...))
	a, err := model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	require.Equal(t, "pending", a.Status)
	require.Zero(t, a.Balance)
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		sql, err := model.DB.DB()
		require.NoError(t, err)
		sql.SetMaxOpenConns(1)
	}
	return user
}

func TestAppBetaIndependentAccounting(t *testing.T) {
	user := setupAppBetaTest(t)
	a, err := model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	review := model.AppBetaReview{Action: "approve", Amount: 100, Version: a.Version, OperationID: "approve-unique-id-0001", Note: "人工审核"}
	require.NoError(t, model.ReviewAppBeta(user.Id, 99, review))
	require.NoError(t, model.ReviewAppBeta(user.Id, 99, review)) // lost response/retry must not add twice
	changed := review
	changed.Amount = 200
	require.ErrorIs(t, model.ReviewAppBeta(user.Id, 99, changed), model.ErrBetaConflict)
	require.NoError(t, model.ApplyAppBeta(user.Id, "再次申请不会赠送"))
	a, err = model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 100, a.Balance)
	require.NoError(t, model.ReserveAppBeta(user.Id, "equal-settlement", 20))
	require.NoError(t, model.FinishAppBeta(user.Id, "equal-settlement", 20, false))
	require.NoError(t, model.FinishAppBeta(user.Id, "equal-settlement", 20, false))
	require.Error(t, model.ReserveAppBeta(user.Id, "equal-settlement", 20))
	require.NoError(t, model.ReserveAppBeta(user.Id, "failure-refund", 30))
	require.NoError(t, model.FinishAppBeta(user.Id, "failure-refund", 0, true))
	require.NoError(t, model.FinishAppBeta(user.Id, "failure-refund", 0, true))
	require.Error(t, model.FinishAppBeta(user.Id, "failure-refund", 5, false))
	require.Error(t, model.ReserveAppBeta(user.Id, "overflow", common.MaxQuota+1))
	require.Error(t, model.ReserveAppBeta(user.Id, "negative", -1))
	a, err = model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 80, a.Balance)
	assert.Zero(t, a.Reserved)
	assert.EqualValues(t, 20, a.Used)
	// Over/under estimates settle the actual existing pricing result, no wallet fallback.
	require.NoError(t, model.ReserveAppBeta(user.Id, "over-estimated", 30))
	require.NoError(t, model.FinishAppBeta(user.Id, "over-estimated", 10, false))
	require.NoError(t, model.ReserveAppBeta(user.Id, "under-estimated", 5))
	require.NoError(t, model.FinishAppBeta(user.Id, "under-estimated", 15, false))
	a, err = model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 55, a.Balance)
	assert.EqualValues(t, 45, a.Used)
	assert.Zero(t, a.Reserved)
	stale := model.AppBetaReview{Action: "adjust", Amount: 1, Version: a.Version - 1, OperationID: "stale-operation-id"}
	require.ErrorIs(t, model.ReviewAppBeta(user.Id, 99, stale), model.ErrBetaConflict)
	wallet, err := model.GetUserById(user.Id, false)
	require.NoError(t, err)
	assert.Equal(t, 314159, wallet.Quota)
	assert.Equal(t, 7, wallet.UsedQuota)
	var entries []model.AppBetaLedger
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).Order("id").Find(&entries).Error)
	assert.EqualValues(t, 55, entries[len(entries)-1].Balance)
}

func TestAppBetaConcurrentReservationsAndSuspension(t *testing.T) {
	user := setupAppBetaTest(t)
	a, err := model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	require.NoError(t, model.ReviewAppBeta(user.Id, 99, model.AppBetaReview{Action: "approve", Amount: 100, Version: a.Version, OperationID: "approval-concurrency"}))
	results := make(chan error, 6)
	var wg sync.WaitGroup
	for i := range 6 {
		wg.Go(func() { results <- model.ReserveAppBeta(user.Id, fmt.Sprintf("concurrent-%d", i), 20) })
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else {
			assert.ErrorIs(t, err, model.ErrBetaQuota)
		}
	}
	assert.Equal(t, 5, successes)
	a, err = model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	assert.Zero(t, a.Balance)
	assert.EqualValues(t, 100, a.Reserved)
	require.NoError(t, model.DB.Create(&model.AppBetaDevice{ID: "device", TokenHash: "device-token-hash", PairHash: "device-pair-hash", UserID: user.Id, ExpiresAt: time.Now().Unix() + 3600}).Error)
	require.NoError(t, model.ReviewAppBeta(user.Id, 99, model.AppBetaReview{Action: "suspend", Version: a.Version, OperationID: "suspend-concurrency"}))
	var device model.AppBetaDevice
	require.NoError(t, model.DB.First(&device, "id = ?", "device").Error)
	assert.True(t, device.Revoked)
	require.ErrorIs(t, model.ReserveAppBeta(user.Id, "suspended-spend", 1), model.ErrBetaAccess)
	// An in-flight failure may still return its own reserve after suspension.
	var charge model.AppBetaCharge
	require.NoError(t, model.DB.Where("user_id = ? AND state = ?", user.Id, "reserved").First(&charge).Error)
	require.NoError(t, model.FinishAppBeta(user.Id, charge.RequestID, 0, true))
	a, err = model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 20, a.Balance)
	assert.EqualValues(t, 80, a.Reserved)
}

func TestAppBetaBillingSessionAndProofIsolation(t *testing.T) {
	user := setupAppBetaTest(t)
	a, err := model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	require.NoError(t, model.ReviewAppBeta(user.Id, 99, model.AppBetaReview{Action: "approve", Amount: 100, Version: a.Version, OperationID: "approve-proof-tests"}))
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/api/app-beta/chat/completions", nil)
	info := &relaycommon.RelayInfo{IsAppBeta: true, IsPlayground: true, UserId: user.Id, RequestId: "billing-equal"}
	_, apiErr := service.NewBillingSession(c, info, 20)
	require.NotNil(t, apiErr, "a spoofed path/RelayInfo cannot authorize beta billing")
	c.Set("app_beta_authenticated", true)
	c.Set("id", user.Id)
	session, apiErr := service.NewBillingSession(c, info, 20)
	require.Nil(t, apiErr)
	require.NoError(t, session.Settle(20))
	assert.False(t, session.NeedsRefund())
	info = &relaycommon.RelayInfo{IsAppBeta: true, IsPlayground: true, UserId: user.Id, RequestId: "billing-refund"}
	session, apiErr = service.NewBillingSession(c, info, 20)
	require.Nil(t, apiErr)
	assert.True(t, session.NeedsRefund())
	session.Refund(c)
	session.Refund(c)
	a, err = model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	assert.EqualValues(t, 80, a.Balance)
	assert.EqualValues(t, 20, a.Used)
	assert.Zero(t, a.Reserved)
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	public, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	require.NoError(t, err)
	device := model.AppBetaDevice{ID: "proof-device", PublicKey: public}
	token := "device-only-token"
	stamp := strconv.FormatInt(time.Now().Unix(), 10)
	nonce, err := service.AppBetaRandom(24)
	require.NoError(t, err)
	bodyHash := service.AppBetaHash("{\"test\":true}")
	message := fmt.Sprintf("skymoni-app-beta-v1\nPOST\n/api/app-beta/chat/completions\n%s\n%s\n%s\n%s", stamp, nonce, bodyHash, service.AppBetaHash(token))
	hash := sha256.Sum256([]byte(message))
	sig, err := ecdsa.SignASN1(rand.Reader, key, hash[:])
	require.NoError(t, err)
	proof := base64.StdEncoding.EncodeToString(sig)
	for _, change := range []struct{ method, path, body, token, time string }{{"GET", "/api/app-beta/chat/completions", bodyHash, token, stamp}, {"POST", "/v1/chat/completions", bodyHash, token, stamp}, {"POST", "/api/app-beta/chat/completions", service.AppBetaHash("modified"), token, stamp}, {"POST", "/api/app-beta/chat/completions", bodyHash, "other-token", stamp}, {"POST", "/api/app-beta/chat/completions", bodyHash, token, strconv.FormatInt(time.Now().Unix()-61, 10)}} {
		assert.Error(t, service.VerifyAppBetaProof(device, change.method, change.path, change.body, change.token, change.time, nonce, proof))
	}
	require.NoError(t, service.VerifyAppBetaProof(device, "POST", "/api/app-beta/chat/completions", bodyHash, token, stamp, nonce, proof))
	require.Error(t, service.VerifyAppBetaProof(device, "POST", "/api/app-beta/chat/completions", bodyHash, token, stamp, nonce, proof), "replay must fail atomically")
	t.Setenv("SKYMONI_APP_BETA_ENABLED", "1")
	t.Setenv("SKYMONI_APP_BETA_MODELS", "test-model")
	t.Setenv("SKYMONI_APP_BETA_CERT_SHA256", strings.Repeat("a", 64))
	router := gin.New()
	router.POST("/app", middleware.AppBetaDeviceAuth(true), func(c *gin.Context) { c.Status(200) })
	for _, authorization := range []string{"Bearer ordinary-api-key", "Bearer browser-token", "BetaDevice " + strings.Repeat("a", 43)} {
		request := httptest.NewRequest("POST", "/app", nil)
		request.Header.Set("Authorization", authorization)
		request.Header.Set("X-Skymoni-App", "true")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		assert.Equal(t, http.StatusUnauthorized, response.Code)
	}
}

func TestAppBetaHTTPReviewAndPairing(t *testing.T) {
	user := setupAppBetaTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.CommunityAdmission{}, &model.CommunityAccessConfig{}, &model.CommunityInvite{}))
	root := model.User{Username: "beta-root", AffCode: "beta-root", Role: common.RoleRootUser, Status: common.UserStatusEnabled}
	require.NoError(t, model.DB.Create(&root).Error)
	rootBundle, err := service.CreateLoginSession(root.Id, "password", "127.0.0.1", "beta-http")
	require.NoError(t, err)
	community, err := service.CreateLoginSession(user.Id, "community:password", "127.0.0.1", "beta-community")
	require.NoError(t, err)
	router := gin.New()
	router.GET("/api/user/app-beta", middleware.AdminAuth(), AppBetaBrowserSession, AdminListAppBeta)
	router.GET("/api/user/app-beta/:id", middleware.AdminAuth(), AppBetaBrowserSession, AdminGetAppBeta)
	router.POST("/api/user/app-beta/:id", middleware.AdminAuth(), AppBetaBrowserSession, AdminReviewAppBeta)
	router.GET("/api/creators/app-beta", middleware.UserAuth(), AppBetaBrowserSession, GetAppBetaSelf)
	router.POST("/api/creators/app-beta/pair", middleware.UserAuth(), AppBetaBrowserSession, PairAppBeta)
	request := func(method, path, body, token string, scope bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		if scope {
			req.Header.Set(service.CommunityScopeHeader, "community")
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	response := request("GET", "/api/user/app-beta?status=pending", "", rootBundle.AccessToken, false)
	assert.Equal(t, 200, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), "enrollment-user")
	response = request("GET", "/api/user/app-beta?status=pending", "", community.AccessToken, true)
	assert.Equal(t, 401, response.Code, "community sessions cannot cross into relay administration")
	ordinary, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "beta-non-admin")
	require.NoError(t, err)
	response = request("GET", "/api/user/app-beta?status=pending", "", ordinary.AccessToken, false)
	assert.Equal(t, 403, response.Code, "ordinary relay users cannot administer beta accounts")
	a, err := model.GetAppBetaAccount(user.Id)
	require.NoError(t, err)
	body, err := common.Marshal(model.AppBetaReview{Action: "approve", Amount: 123, Version: a.Version, OperationID: "http-review-manual-01"})
	require.NoError(t, err)
	response = request("POST", fmt.Sprintf("/api/user/app-beta/%d", user.Id), string(body), rootBundle.AccessToken, false)
	require.Equal(t, 200, response.Code, response.Body.String())
	device := model.AppBetaDevice{ID: "http-pair-device", PairHash: service.AppBetaHash("ABCDEF0123456789"), TokenHash: "http-device-token", PairExpires: time.Now().Unix() + 300, ExpiresAt: time.Now().Unix() + 3600}
	require.NoError(t, model.DB.Create(&device).Error)
	response = request("POST", "/api/creators/app-beta/pair", `{"code":"ABCD-EF01-2345-6789"}`, community.AccessToken, true)
	require.Equal(t, 200, response.Code, response.Body.String())
	response = request("POST", "/api/creators/app-beta/pair", `{"code":"ABCD-EF01-2345-6789"}`, community.AccessToken, true)
	assert.Equal(t, 400, response.Code)
	response = request("GET", "/api/creators/app-beta", "", community.AccessToken, true)
	require.Equal(t, 200, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), `"balance":123`)
	assert.NotContains(t, response.Body.String(), "http-device-token")
	assert.NotContains(t, response.Body.String(), device.PairHash)
}
