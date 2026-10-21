package controller

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDripAccountProxyRestrictsScopeAndProtectsCookies(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var calls atomic.Int32
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		assert.Equal(t, "/api/account/sync", r.URL.Path)
		assert.Equal(t, "key=appearance", r.URL.RawQuery)
		assert.Equal(t, "Bearer drip-session", r.Header.Get("Authorization"))
		assert.Equal(t, "198.51.100.12", r.Header.Get("X-Forwarded-For"))
		assert.Empty(t, r.Header.Get("Cookie"))
		assert.Empty(t, r.Header.Get("Origin"))
		w.Header().Set("Set-Cookie", "upstream-secret=1")
		w.Header().Set("Location", "https://210.126.232.60/internal")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"ok":false,"error":"请登录"}`)
	}))
	defer upstream.Close()
	router := gin.New()
	router.GET("/drip-api/account/:action", func(c *gin.Context) {
		proxyDripAccountWithClient(c, upstream.Client(), upstream.URL)
	})
	for _, path := range []string{
		"/drip-api/account/sync?key=appearance",
		"/drip-api/account/admin/users",
		"/drip-api/account/unknown",
	} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("Authorization", "Bearer drip-session")
		request.Header.Set("Cookie", "skymoni-session=private")
		request.Header.Set("Origin", "https://skymoni.com")
		request.Header.Set("X-Real-IP", "198.51.100.12")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if strings.Contains(path, "sync") {
			assert.Equal(t, http.StatusUnauthorized, response.Code)
			assert.Contains(t, response.Body.String(), "请登录")
			assert.Empty(t, response.Header().Get("Set-Cookie"))
			assert.Empty(t, response.Header().Get("Location"))
		} else {
			assert.Equal(t, http.StatusNotFound, response.Code)
		}
	}
	assert.EqualValues(t, 1, calls.Load())
}

func TestDripAccountProxyFailsClosedOnInvalidOriginAndRedirect(t *testing.T) {
	gin.SetMode(gin.TestMode)
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://210.126.232.60/internal", http.StatusFound)
	}))
	defer upstream.Close()
	client := upstream.Client()
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	for _, origin := range []string{"", "http://example.com", upstream.URL} {
		router := gin.New()
		router.GET("/drip-api/account/me", func(c *gin.Context) {
			proxyDripAccountWithClient(c, client, origin)
		})
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/drip-api/account/me", nil))
		if origin == upstream.URL {
			assert.Equal(t, http.StatusBadGateway, response.Code)
		} else {
			assert.Equal(t, http.StatusServiceUnavailable, response.Code)
		}
		assert.Empty(t, response.Header().Get("Location"))
	}
}

func TestDripAccountProxyCapsBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var calls atomic.Int32
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		assert.Equal(t, "/api/account/redeem", r.URL.Path)
		var payload map[string]string
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		assert.Equal(t, "valid", payload["code"])
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer upstream.Close()
	router := gin.New()
	router.POST("/drip-api/account/:action", func(c *gin.Context) {
		proxyDripAccountWithClient(c, upstream.Client(), upstream.URL)
	})
	for _, value := range []string{`{"code":"valid"}`, strings.Repeat("x", dripProxyMaxRequest+1)} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/drip-api/account/redeem", strings.NewReader(value)))
		if strings.HasPrefix(value, "{") {
			assert.Equal(t, http.StatusOK, response.Code)
		} else {
			assert.Equal(t, http.StatusRequestEntityTooLarge, response.Code)
		}
	}
	assert.EqualValues(t, 1, calls.Load())
}
