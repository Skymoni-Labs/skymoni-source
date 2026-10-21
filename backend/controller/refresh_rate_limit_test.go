package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRefreshRateLimitIsolation(t *testing.T) {
	user, _ := setupSecurityEnrollmentTest(t)
	communityTestSchema(t)
	enabled, num, duration := common.CriticalRateLimitEnable, common.CriticalRateLimitNum, common.CriticalRateLimitDuration
	common.CriticalRateLimitEnable, common.CriticalRateLimitNum, common.CriticalRateLimitDuration = true, 1, 1200
	t.Cleanup(func() {
		common.CriticalRateLimitEnable, common.CriticalRateLimitNum, common.CriticalRateLimitDuration = enabled, num, duration
	})
	router := gin.New()
	router.POST("/critical", middleware.CriticalRateLimit(), func(c *gin.Context) { c.Status(204) })
	router.POST("/api/user/auth/refresh", middleware.RefreshRateLimit(), RefreshAuth)
	request := func(path, raw, scope string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", path, nil)
		req.RemoteAddr = "198.51.100.201:5012"
		name := service.RefreshCookieName
		if scope == "community" {
			name = "skymoni_community_refresh"
			req.Header.Set(service.CommunityScopeHeader, scope)
		}
		if raw != "" {
			req.AddCookie(&http.Cookie{Name: name, Value: raw})
		}
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		return out
	}
	require.Equal(t, 204, request("/critical", "", "").Code)
	require.Equal(t, 429, request("/critical", "", "").Code)
	// Invalid attempts on this NAT neither consume a valid session's budget nor
	// borrow its allowance by copying only its SID.
	bundle, err := service.CreateLoginSession(user.Id, "password", "198.51.100.201", "test")
	require.NoError(t, err)
	require.Equal(t, 401, request("/api/user/auth/refresh", bundle.Session.SID+".invalid", "").Code)
	require.Equal(t, 429, request("/api/user/auth/refresh", "invalid", "").Code)
	raw := bundle.RefreshToken
	for i := 0; i < 25; i++ {
		response := request("/api/user/auth/refresh", raw, "")
		require.Equal(t, 200, response.Code, response.Body.String())
		for _, cookie := range response.Result().Cookies() {
			if cookie.Name == service.RefreshCookieName {
				raw = cookie.Value
			}
		}
	}
	community, err := service.CreateLoginSession(user.Id, "community:password", "198.51.100.201", "test-community")
	require.NoError(t, err)
	require.Equal(t, 200, request("/api/user/auth/refresh", community.RefreshToken, "community").Code)
	// Exact same session remains bounded independently of cookie rotation.
	for i := 25; i < 60; i++ {
		response := request("/api/user/auth/refresh", raw, "")
		require.Equal(t, 200, response.Code, response.Body.String())
		for _, cookie := range response.Result().Cookies() {
			if cookie.Name == service.RefreshCookieName {
				raw = cookie.Value
			}
		}
	}
	limited := request("/api/user/auth/refresh", raw, "")
	require.Equal(t, 429, limited.Code)
	require.NotEmpty(t, limited.Header().Get("Retry-After"))
	require.Empty(t, limited.Result().Cookies(), "rate limiting must preserve the refresh cookie")
	require.Equal(t, 429, request("/critical", "", "").Code, "critical protection must remain unchanged")
}
