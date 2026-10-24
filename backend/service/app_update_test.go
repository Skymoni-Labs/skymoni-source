package service

import (
	"encoding/json"
	"fmt"
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

func TestAppUpdateCatalogPreservesHistoryBeyondThirty(t *testing.T) {
	path := filepath.Join(t.TempDir(), "releases.json")
	t.Setenv("SKYMONI_APP_RELEASES_FILE", path)
	entries := make([]AppRelease, 0, maxAppReleaseEntries+1)
	for i := 1; i <= maxAppReleaseEntries+1; i++ {
		release := testAppRelease()
		release.ID = fmt.Sprintf("v0.2.%d", i)
		release.Version = fmt.Sprintf("0.2.%d", i)
		release.VersionCode = int64(i)
		entries = append(entries, release)
		if i != 31 && i != maxAppReleaseEntries && i != maxAppReleaseEntries+1 {
			continue
		}
		raw, err := json.Marshal(map[string]interface{}{"releases": entries})
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(path, raw, 0600))
		loaded, err := LoadAppReleases()
		if i > maxAppReleaseEntries {
			require.Error(t, err)
			continue
		}
		require.NoError(t, err)
		require.Len(t, loaded, i)
		foundOldest := false
		for _, release := range loaded {
			if release.ID == "v0.2.1" {
				foundOldest = true
			}
		}
		require.True(t, foundOldest, "old download IDs must remain available")
	}
}

func TestAppUpdateCatalogByteLimitStillFailsClosed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "releases.json")
	t.Setenv("SKYMONI_APP_RELEASES_FILE", path)
	raw := []byte(`{"releases":[]}`)
	raw = append(raw, []byte(strings.Repeat(" ", maxAppReleaseManifestBytes-len(raw)))...)
	require.NoError(t, os.WriteFile(path, raw, 0600))
	_, err := LoadAppReleases()
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(path, append(raw, ' '), 0600))
	_, err = LoadAppReleases()
	require.Error(t, err)
}
