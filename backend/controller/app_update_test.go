package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type appUpdateTransport func(*http.Request) (*http.Response, error)

func (f appUpdateTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestAppUpdateSameAssetAcrossABIsAndFixedProxy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	content := []byte("isolated APK fixture: no real code or external download")
	h := sha256.Sum256(content)
	release := service.AppRelease{ID: "v0.1.0-2", Version: "0.1.0", VersionCode: 2, MinSDK: 24, ABIs: []string{"arm64-v8a", "x86_64"}, Upstream: "https://github.com/skyjjgw/skivu/releases/download/v0.1.0-2/Skivu.apk", SHA256: hex.EncodeToString(h[:]), SignerSHA256: strings.Repeat("b", 64), Size: int64(len(content)), PackageName: service.AppPackageName, PublishedAt: 1792650000}
	data, err := json.Marshal(map[string]any{"releases": []service.AppRelease{release}})
	require.NoError(t, err)
	p := filepath.Join(t.TempDir(), "releases.json")
	require.NoError(t, os.WriteFile(p, data, 0600))
	t.Setenv("SKYMONI_APP_RELEASES_FILE", p)
	r := gin.New()
	r.GET("/latest", GetAppUpdate)
	r.GET("/download/:release/:abi", DownloadAppUpdate)
	for _, abi := range release.ABIs {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/latest?platform=android&abi="+abi+"&version_code=1", nil))
		require.Equal(t, 200, w.Code)
		require.Contains(t, w.Body.String(), `"available":true`)
		require.Contains(t, w.Body.String(), "https://skymoni.com/api/app-update/download/"+release.ID+"/"+abi)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/latest?abi=arm64-v8a&version_code=2", nil))
	require.Contains(t, w.Body.String(), `"available":false`)
	old := appUpdateHTTPClient
	t.Cleanup(func() { appUpdateHTTPClient = old })
	calls := 0
	appUpdateHTTPClient = &http.Client{Transport: appUpdateTransport(func(req *http.Request) (*http.Response, error) {
		calls++
		require.Equal(t, release.Upstream, req.URL.String())
		require.Empty(t, req.Header.Get("Authorization"))
		return &http.Response{StatusCode: 200, ContentLength: release.Size, Body: io.NopCloser(strings.NewReader(string(content))), Header: make(http.Header)}, nil
	})}
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/download/unknown/arm64-v8a?url=http://internal", nil))
	require.Equal(t, 404, w.Code)
	require.Zero(t, calls)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/download/"+release.ID+"/arm64-v8a?url=http://internal", nil))
	require.Equal(t, 200, w.Code)
	require.Equal(t, content, w.Body.Bytes())
	require.Equal(t, release.SHA256, w.Header().Get("X-Content-SHA256"))
	require.Equal(t, 1, calls)
	w = httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/download/"+release.ID+"/arm64-v8a", nil)
	req.Header.Set("Range", "bytes=10-")
	r.ServeHTTP(w, req)
	require.Equal(t, 416, w.Code)
	require.Equal(t, 1, calls)
}
