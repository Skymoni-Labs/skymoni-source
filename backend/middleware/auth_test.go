package middleware

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupDashboardAuthMiddlewareTest(t *testing.T) {
	t.Helper()
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousType := common.MainDatabaseType()
	previousRedis := common.RedisEnabled
	previousSecret := common.SessionSecret
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.AuditLog{}))
	require.NoError(t, model.InitSecurityProtection(db))
	model.DB = db
	model.LOG_DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.SessionSecret = "middleware-auth-test-secret"
	t.Cleanup(func() {
		require.NoError(t, model.FlushUserActivity(context.Background()))
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.SetMainDatabaseType(previousType)
		common.RedisEnabled = previousRedis
		common.SessionSecret = previousSecret
	})
}

func TestAuthenticatedRequestsRecordActivityWithoutChangingLogin(t *testing.T) {
	// Initialize the real database dialect helpers used by relay key validation.
	previousDB, previousPath, previousMaster := model.DB, common.SQLitePath, common.IsMasterNode
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	t.Setenv("SQL_DSN", "local")
	t.Setenv("LOG_SQL_DSN", "")
	common.SQLitePath, common.IsMasterNode = t.TempDir()+"/activity.db", false
	require.NoError(t, model.InitDB())
	initializedDB := model.DB
	t.Cleanup(func() {
		connection, err := initializedDB.DB()
		require.NoError(t, err)
		require.NoError(t, connection.Close())
		model.DB, common.SQLitePath, common.IsMasterNode = previousDB, previousPath, previousMaster
		common.SetDatabaseTypes(previousMainType, previousLogType)
	})
	setupDashboardAuthMiddlewareTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Token{}))
	user := createMiddlewarePATUser(t, "active-user", "activity-pat")
	require.NoError(t, model.DB.Model(user).UpdateColumn("last_login_at", 100).Error)
	now := time.Now().Unix()
	session := &model.UserSession{SID: "activity-session", UserID: user.Id, Version: 1, UserAuthVersion: 1,
		Status: model.UserSessionStatusActive, RefreshHash: "synthetic-refresh-hash", ExpiresAt: now + 3600}
	require.NoError(t, model.CreateUserSession(session))
	identity := service.AuthIdentity{UserID: user.Id, SessionID: session.SID, UserAuthVersion: 1, SessionVersion: 1}
	access, _, err := service.IssueAccessToken(identity)
	require.NoError(t, err)
	apiKey := strings.Repeat("a", 48)
	require.NoError(t, model.DB.Create(&model.Token{UserId: user.Id, Key: apiKey, Status: common.TokenStatusEnabled, UnlimitedQuota: true, ExpiredTime: -1}).Error)
	router := gin.New()
	handler := func(c *gin.Context) { c.Status(http.StatusNoContent) }
	router.GET("/dashboard", UserAuth(), handler)
	router.GET("/relay", TokenAuth(), handler)
	router.GET("/key-usage", TokenAuthReadOnly(), handler)
	for _, tc := range []struct {
		name, path, credential string
		status                 int
		active                 bool
	}{
		{"website or native App session", "/dashboard", access, http.StatusNoContent, true},
		{"personal access token", "/dashboard", "activity-pat", http.StatusNoContent, true},
		{"relay API key", "/relay", "sk-" + apiKey, http.StatusNoContent, true},
		{"read-only key usage", "/key-usage", "sk-" + apiKey, http.StatusNoContent, true},
		{"expired session", "/dashboard", issueExpiredDashboardAccessToken(t, identity), http.StatusUnauthorized, false},
		{"tampered session", "/dashboard", tamperDashboardToken(access), http.StatusUnauthorized, false},
		{"invalid API key", "/relay", "sk-" + strings.Repeat("b", 48), http.StatusUnauthorized, false},
		{"untrusted client user ID", "/dashboard", "", http.StatusUnauthorized, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.NoError(t, model.DB.Model(user).UpdateColumn("last_active_at", 1).Error)
			request := httptest.NewRequest(http.MethodGet, tc.path, nil)
			request.Header.Set("New-Api-User", "999999")
			if tc.credential != "" {
				request.Header.Set("Authorization", "Bearer "+tc.credential)
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assert.Equal(t, tc.status, response.Code)
			require.NoError(t, model.FlushUserActivity(context.Background()))
			var got model.User
			require.NoError(t, model.DB.First(&got, user.Id).Error)
			assert.EqualValues(t, 100, got.LastLoginAt)
			if tc.active {
				assert.GreaterOrEqual(t, got.LastActiveAt, now)
			} else {
				assert.EqualValues(t, 1, got.LastActiveAt)
			}
		})
	}
	require.NoError(t, model.DB.Model(session).UpdateColumn("status", model.UserSessionStatusRevoked).Error)
	require.NoError(t, model.DB.Model(user).UpdateColumn("last_active_at", 1).Error)
	request := httptest.NewRequest(http.MethodGet, "/dashboard", nil)
	request.Header.Set("Authorization", "Bearer "+access)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	assert.Equal(t, http.StatusUnauthorized, response.Code)
	require.NoError(t, model.FlushUserActivity(context.Background()))
	var got model.User
	require.NoError(t, model.DB.First(&got, user.Id).Error)
	assert.EqualValues(t, 1, got.LastActiveAt, "revoked sessions cannot refresh activity")
}

func issueExpiredDashboardAccessToken(t *testing.T, identity service.AuthIdentity) string {
	t.Helper()
	claims := jwt.MapClaims{
		"iss":       "new-api",
		"aud":       []string{"new-api-dashboard"},
		"sub":       fmt.Sprintf("%d", identity.UserID),
		"token_use": "access",
		"sid":       identity.SessionID,
		"uv":        identity.UserAuthVersion,
		"sv":        identity.SessionVersion,
		"exp":       time.Now().Add(-time.Minute).Unix(),
		"nbf":       time.Now().Add(-2 * time.Minute).Unix(),
		"iat":       time.Now().Add(-2 * time.Minute).Unix(),
	}
	mac := hmac.New(sha256.New, []byte(common.SessionSecret))
	_, err := mac.Write([]byte("new-api/auth/access/v1"))
	require.NoError(t, err)
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(mac.Sum(nil))
	require.NoError(t, err)
	return token
}

func tamperDashboardToken(token string) string {
	tamperAt := len(token) - 2
	replacement := "x"
	if token[tamperAt] == 'x' {
		replacement = "y"
	}
	return token[:tamperAt] + replacement + token[tamperAt+1:]
}

func createMiddlewarePATUser(t *testing.T, username, token string) *model.User {
	t.Helper()
	user := &model.User{
		Username: username, Password: "password-placeholder", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, Group: "default", AccessToken: &token, AuthVersion: 1,
		AffCode: "middleware-aff-" + username,
	}
	require.NoError(t, model.DB.Create(user).Error)
	return user
}

func TestUserAuthAllowsOpaqueDottedPAT(t *testing.T) {
	setupDashboardAuthMiddlewareTest(t)
	user := createMiddlewarePATUser(t, "dotted-pat-user", "opaque.key.with-dots")
	router := gin.New()
	router.GET("/protected", UserAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"id": c.GetInt("id")})
	})
	request := httptest.NewRequest(http.MethodGet, "/protected", nil)
	request.Header.Set("Authorization", "Bearer opaque.key.with-dots")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	assert.Equal(t, http.StatusOK, response.Code)
	var body struct {
		ID int `json:"id"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body))
	assert.Equal(t, user.Id, body.ID)
}

func TestUserAuthNeverFallsBackForRecognizedInvalidInternalJWT(t *testing.T) {
	setupDashboardAuthMiddlewareTest(t)
	identity := service.AuthIdentity{UserID: 42, SessionID: "session-42", UserAuthVersion: 1, SessionVersion: 1}
	token, _, err := service.IssueAccessToken(identity)
	require.NoError(t, err)
	tampered := tamperDashboardToken(token)
	createMiddlewarePATUser(t, "jwt-fallback-user", tampered)
	router := gin.New()
	router.GET("/protected", UserAuth(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodGet, "/protected", nil)
	request.Header.Set("Authorization", "Bearer "+tampered)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	assert.Equal(t, http.StatusUnauthorized, response.Code)
	assert.Contains(t, response.Body.String(), "AUTH_UNAUTHORIZED")
}

func TestTryUserAuthCredentialClassification(t *testing.T) {
	setupDashboardAuthMiddlewareTest(t)
	gin.SetMode(gin.TestMode)

	patUser := createMiddlewarePATUser(t, "optional-pat-user", "optional.pat.with-dots")
	internalUser := createMiddlewarePATUser(t, "optional-session-user", "unrelated-pat")
	now := time.Now().Unix()
	session := &model.UserSession{
		SID:             "optional-auth-session",
		UserID:          internalUser.Id,
		Version:         1,
		UserAuthVersion: internalUser.AuthVersion,
		Status:          model.UserSessionStatusActive,
		RefreshHash:     "refresh-hash",
		LoginMethod:     "password",
		LastActiveAt:    now,
		ExpiresAt:       now + 3600,
	}
	require.NoError(t, model.CreateUserSession(session))
	identity := service.AuthIdentity{
		UserID:          internalUser.Id,
		SessionID:       session.SID,
		UserAuthVersion: session.UserAuthVersion,
		SessionVersion:  session.Version,
	}
	accessToken, _, err := service.IssueAccessToken(identity)
	require.NoError(t, err)
	require.NoError(t, model.DB.AutoMigrate(&model.AuthFlow{}))
	binding, err := service.BindVerificationOperation(service.VerificationOperation{Scope: "channel.key.read", Context: []byte(`{"channel_id":123}`)})
	require.NoError(t, err)
	securityProof, _, err := service.IssueSecurityProof(identity, "2fa", binding)
	require.NoError(t, err)
	externalToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"iss": "external-issuer",
		"aud": "external-audience",
		"exp": time.Now().Add(time.Minute).Unix(),
	}).SignedString([]byte("external-secret"))
	require.NoError(t, err)

	router := gin.New()
	router.GET("/optional", TryUserAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"id":               c.GetInt("id"),
			"use_access_token": c.GetBool("use_access_token"),
		})
	})

	tests := []struct {
		name          string
		token         string
		wantStatus    int
		wantUserID    int
		wantPAT       bool
		wantErrorCode string
	}{
		{name: "no authorization header", wantStatus: http.StatusOK},
		{name: "opaque unmatched credential", token: "opaque-relay-key", wantStatus: http.StatusOK},
		{name: "dotted unmatched credential", token: "ordinary.key.with-dots", wantStatus: http.StatusOK},
		{name: "third party jwt", token: externalToken, wantStatus: http.StatusOK},
		{name: "valid pat", token: "optional.pat.with-dots", wantStatus: http.StatusOK, wantUserID: patUser.Id, wantPAT: true},
		{name: "valid internal access jwt", token: accessToken, wantStatus: http.StatusOK, wantUserID: internalUser.Id},
		{name: "expired internal access jwt", token: issueExpiredDashboardAccessToken(t, identity), wantStatus: http.StatusUnauthorized, wantErrorCode: "AUTH_TOKEN_EXPIRED"},
		{name: "tampered internal access jwt", token: tamperDashboardToken(accessToken), wantStatus: http.StatusUnauthorized, wantErrorCode: "AUTH_UNAUTHORIZED"},
		{name: "security proof used as access", token: securityProof, wantStatus: http.StatusUnauthorized, wantErrorCode: "AUTH_UNAUTHORIZED"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/optional", nil)
			if test.token != "" {
				request.Header.Set("Authorization", "Bearer "+test.token)
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assert.Equal(t, test.wantStatus, response.Code)
			if test.wantErrorCode != "" {
				assert.Contains(t, response.Body.String(), test.wantErrorCode)
				return
			}
			var body struct {
				ID             int  `json:"id"`
				UseAccessToken bool `json:"use_access_token"`
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body))
			assert.Equal(t, test.wantUserID, body.ID)
			assert.Equal(t, test.wantPAT, body.UseAccessToken)
		})
	}

	requiredRouter := gin.New()
	requiredRouter.GET("/required", UserAuth(), func(c *gin.Context) { c.Status(http.StatusNoContent) })
	requiredRequest := httptest.NewRequest(http.MethodGet, "/required", nil)
	requiredRequest.Header.Set("Authorization", "Bearer ordinary-unmatched-key")
	requiredResponse := httptest.NewRecorder()
	requiredRouter.ServeHTTP(requiredResponse, requiredRequest)
	assert.Equal(t, http.StatusUnauthorized, requiredResponse.Code, "required dashboard authentication must not adopt optional-auth fallback semantics")

	var patUserQueries int
	forcedCacheError := errors.New("forced PAT user cache lookup failure")
	const callbackName = "test:optional-auth-pat-user-cache-failure"
	require.NoError(t, model.DB.Callback().Query().Before("gorm:query").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement.Table != "users" {
			return
		}
		patUserQueries++
		if patUserQueries == 2 {
			tx.AddError(forcedCacheError)
		}
	}))
	cacheFailureRequest := httptest.NewRequest(http.MethodGet, "/optional", nil)
	cacheFailureRequest.Header.Set("Authorization", "Bearer optional.pat.with-dots")
	cacheFailureResponse := httptest.NewRecorder()
	router.ServeHTTP(cacheFailureResponse, cacheFailureRequest)
	model.DB.Callback().Query().Remove(callbackName)
	assert.Equal(t, http.StatusInternalServerError, cacheFailureResponse.Code)
	assert.Contains(t, cacheFailureResponse.Body.String(), "AUTH_INTERNAL_ERROR")

	require.NoError(t, model.FlushUserActivity(context.Background()))
	sqlDB, err := model.DB.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())
	databaseFailureRequest := httptest.NewRequest(http.MethodGet, "/optional", nil)
	databaseFailureRequest.Header.Set("Authorization", "Bearer database-failure-key")
	databaseFailureResponse := httptest.NewRecorder()
	router.ServeHTTP(databaseFailureResponse, databaseFailureRequest)
	assert.Equal(t, http.StatusInternalServerError, databaseFailureResponse.Code)
	assert.Contains(t, databaseFailureResponse.Body.String(), "AUTH_INTERNAL_ERROR")
}

func TestAPIKeyFromWebSocketSubprotocol(t *testing.T) {
	tests := []struct {
		name      string
		protocols string
		wantKey   string
		wantOK    bool
	}{
		{
			name:      "responses protocol only",
			protocols: "responses",
			wantOK:    false,
		},
		{
			name:      "realtime protocol only",
			protocols: "realtime",
			wantOK:    false,
		},
		{
			name:      "responses with insecure key",
			protocols: "responses, openai-insecure-api-key.sk-test",
			wantKey:   "sk-test",
			wantOK:    true,
		},
		{
			name:      "realtime with beta and insecure key",
			protocols: "realtime, openai-insecure-api-key.sk-realtime, openai-beta.realtime-v1",
			wantKey:   "sk-realtime",
			wantOK:    true,
		},
		{
			name:      "empty insecure key",
			protocols: "responses, openai-insecure-api-key.",
			wantOK:    false,
		},
		{
			name:      "bare insecure marker is not a key",
			protocols: "openai-insecure-api-key",
			wantOK:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotKey, gotOK := apiKeyFromWebSocketSubprotocol(tt.protocols)
			assert.Equal(t, tt.wantOK, gotOK)
			assert.Equal(t, tt.wantKey, gotKey)
		})
	}
}

func TestApplyWebSocketSubprotocolAuthorizationDoesNotOverrideProtocolOnly(t *testing.T) {
	header := http.Header{}
	header.Set("Authorization", "Bearer sk-original")
	header.Set("Sec-WebSocket-Protocol", "responses")
	header.Add("Sec-WebSocket-Protocol", "openai-beta.realtime-v1")

	assert.False(t, applyWebSocketSubprotocolAuthorization(header))
	assert.Equal(t, "Bearer sk-original", header.Get("Authorization"))
}

func TestApplyWebSocketSubprotocolAuthorizationOverridesWithInsecureKey(t *testing.T) {
	header := http.Header{}
	header.Set("Authorization", "Bearer sk-original")
	header.Set("Sec-WebSocket-Protocol", "responses, openai-insecure-api-key.sk-from-protocol")

	assert.True(t, applyWebSocketSubprotocolAuthorization(header))
	assert.Equal(t, "Bearer sk-from-protocol", header.Get("Authorization"))
}

func TestApplyWebSocketSubprotocolAuthorizationReadsRepeatedHeaders(t *testing.T) {
	header := http.Header{}
	header.Set("Authorization", "Bearer sk-original")
	header.Add("Sec-WebSocket-Protocol", "responses")
	header.Add("Sec-WebSocket-Protocol", "openai-insecure-api-key.sk-later-field")

	assert.True(t, applyWebSocketSubprotocolAuthorization(header))
	assert.Equal(t, "Bearer sk-later-field", header.Get("Authorization"))
}
