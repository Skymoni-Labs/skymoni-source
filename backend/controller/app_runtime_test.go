package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type runtimeRoundTrip func(*http.Request) (*http.Response, error)

func (f runtimeRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestRuntimeProxyUsesOnlyRegistryAndStreamsBytes(t *testing.T) {
	content := "runtime APK fixture"
	sum := sha256.Sum256([]byte(content))
	release := service.RuntimeRelease{ID: "v0.1.0", Version: "0.1.0", VersionCode: 1, PackageName: "org.example.runtime", Component: "org.example.runtime/org.example.runtime.Service", SignerSHA256: strings.Repeat("a", 64), MinSDK: 26, ABI: "x86_64", SHA256: hex.EncodeToString(sum[:]), Size: int64(len(content)), Upstream: "https://github.com/owner/runtime/releases/download/v0.1.0/runtime.apk"}
	path := filepath.Join(t.TempDir(), "runtimes.json")
	t.Setenv("SKYMONI_RUNTIME_RELEASES_FILE", path)
	data, _ := json.Marshal(map[string]any{"releases": []service.RuntimeRelease{release}})
	require.NoError(t, os.WriteFile(path, data, 0600))
	old := runtimeHTTPClient
	defer func() { runtimeHTTPClient = old }()
	calls := 0
	runtimeHTTPClient = &http.Client{Transport: runtimeRoundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		require.Equal(t, release.Upstream, r.URL.String())
		require.Empty(t, r.Header.Get("Authorization"))
		return &http.Response{StatusCode: 200, ContentLength: int64(len(content)), Body: io.NopCloser(strings.NewReader(content)), Header: http.Header{}}, nil
	})}
	router := gin.New()
	router.GET("/latest", GetAppRuntime)
	router.GET("/download/:package/:release/:abi", DownloadAppRuntime)
	router.HEAD("/download/:package/:release/:abi", DownloadAppRuntime)
	request := func(method, url string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(method, url, nil))
		return w
	}
	w := request("GET", "/latest?package=org.example.runtime&abi=x86_64")
	require.Equal(t, 200, w.Code)
	require.NotContains(t, w.Body.String(), "github.com")
	require.Contains(t, w.Body.String(), "https://skymoni.com/api/app-runtime/download/")
	w = request("GET", "/download/org.example.runtime/v0.1.0/x86_64?url=http://127.0.0.1/private")
	require.Equal(t, 200, w.Code)
	require.Equal(t, content, w.Body.String())
	require.Empty(t, w.Header().Get("Location"))
	require.Equal(t, release.SHA256, w.Header().Get("X-Content-SHA256"))
	require.Equal(t, 1, calls)
	w = request("HEAD", "/download/org.example.runtime/v0.1.0/x86_64")
	require.Equal(t, 200, w.Code)
	require.Empty(t, w.Body.String())
	w = request("GET", "/download/org.other/v0.1.0/x86_64")
	require.Equal(t, 404, w.Code)
	require.Equal(t, 2, calls)
	req := httptest.NewRequest("GET", "/download/org.example.runtime/v0.1.0/x86_64", nil)
	req.Header.Set("Range", "bytes=0-10")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, 416, w.Code)
	require.Equal(t, 2, calls)
}
