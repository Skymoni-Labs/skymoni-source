package service

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func testAppRelease() AppRelease {
	return AppRelease{ID: "v0.1.0-2", Version: "0.1.0", VersionCode: 2, MinSDK: 24, ABIs: []string{"arm64-v8a", "x86_64"}, Upstream: "https://github.com/skyjjgw/skivu/releases/download/v0.1.0-2/Skivu.apk", SHA256: strings.Repeat("a", 64), SignerSHA256: strings.Repeat("b", 64), Size: 100, PackageName: AppPackageName, PublishedAt: 1792650000}
}
func TestAppUpdateRejectsArbitraryOriginsAndMetadata(t *testing.T) {
	r := testAppRelease()
	require.NoError(t, ValidateAppRelease(r))
	for _, upstream := range []string{"http://github.com/skyjjgw/skivu/releases/download/v1/Skivu.apk", "https://github.com/another/repo/releases/download/v1/Skivu.apk", "https://127.0.0.1/private.apk", "https://github.com/skyjjgw/skivu/releases/download/v1/../../secret.apk", "https://github.com/skyjjgw/skivu/releases/download/v1/Skivu.apk?url=http://internal"} {
		copy := r
		copy.Upstream = upstream
		require.Error(t, ValidateAppRelease(copy))
	}
	copy := r
	copy.PackageName = "other.package"
	require.Error(t, ValidateAppRelease(copy))
	copy = r
	copy.SignerSHA256 = ""
	require.Error(t, ValidateAppRelease(copy))
	copy = r
	copy.Size = 257 << 20
	require.Error(t, ValidateAppRelease(copy))
	client := AppReleaseHTTPClient()
	for _, target := range []string{"http://release-assets.githubusercontent.com/a", "https://localhost/a", "https://release-assets.githubusercontent.com.evil.example/a", "https://release-assets.githubusercontent.com:444/a"} {
		u, err := url.Parse(target)
		require.NoError(t, err)
		require.Error(t, client.CheckRedirect(&http.Request{URL: u}, nil))
	}
	u, _ := url.Parse("https://release-assets.githubusercontent.com/asset?signature=public-fixture")
	require.NoError(t, client.CheckRedirect(&http.Request{URL: u}, nil))
}
func TestAppUpdateManifestFailsClosed(t *testing.T) {
	t.Setenv("SKYMONI_APP_RELEASES_FILE", "")
	releases, err := LoadAppReleases()
	require.NoError(t, err)
	require.Empty(t, releases)
	p := filepath.Join(t.TempDir(), "releases.json")
	t.Setenv("SKYMONI_APP_RELEASES_FILE", p)
	require.NoError(t, os.WriteFile(p, []byte(`{"releases":[]}`), 0600))
	releases, err = LoadAppReleases()
	require.NoError(t, err)
	require.Empty(t, releases)
	require.NoError(t, os.WriteFile(p, []byte(`{"releases":[{"upstream":"https://127.0.0.1/secret"}]}`), 0600))
	_, err = LoadAppReleases()
	require.Error(t, err)
	require.NoError(t, os.WriteFile(p, []byte(strings.Repeat("x", (64<<10)+1)), 0600))
	_, err = LoadAppReleases()
	require.Error(t, err)
}
