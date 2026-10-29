package service

import (
	"encoding/json"
	"github.com/stretchr/testify/require"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func runtimeFixture() RuntimeRelease {
	return RuntimeRelease{ID: "v0.1.0", Version: "0.1.0", VersionCode: 1, PackageName: "org.example.runtime", Component: "org.example.runtime/org.example.runtime.Service", SignerSHA256: strings.Repeat("a", 64), MinSDK: 26, ABI: "arm64-v8a", SHA256: strings.Repeat("b", 64), Size: 260000000, Upstream: "https://github.com/owner/runtime/releases/download/v0.1.0/runtime.apk"}
}
func TestRuntimeReleaseOriginsAndIdentity(t *testing.T) {
	valid := runtimeFixture()
	require.NoError(t, ValidateRuntimeRelease(valid))
	for _, origin := range []string{"https://127.0.0.1/a.apk", "http://github.com/owner/runtime/releases/download/v1/a.apk", "https://github.com/owner/runtime/releases/download/v1/../a.apk", "https://github.com/owner/runtime/releases/download/v1/a.apk?url=http://internal", "https://github.com/owner/runtime/releases/download/v1/%61.apk"} {
		r := valid
		r.Upstream = origin
		require.Error(t, ValidateRuntimeRelease(r), origin)
	}
	r := valid
	r.PackageName = AppPackageName
	require.Error(t, ValidateRuntimeRelease(r))
	r = valid
	r.Component = "org.other/org.other.Service"
	require.Error(t, ValidateRuntimeRelease(r))
	r = valid
	r.SignerSHA256 = ""
	require.Error(t, ValidateRuntimeRelease(r))
	r = valid
	r.Size = 513 << 20
	require.Error(t, ValidateRuntimeRelease(r))
	// Adding runtime distribution never broadens the host update origin rule.
	require.Error(t, ValidateAppRelease(AppRelease{ID: "v1", Version: "1.0.0", VersionCode: 1, MinSDK: 26, ABIs: []string{"arm64-v8a"}, Upstream: valid.Upstream, SHA256: valid.SHA256, SignerSHA256: valid.SignerSHA256, Size: 100, PackageName: AppPackageName, PublishedAt: 1}))
}
func TestRuntimeRegistryRejectsPartialDuplicateAndUnknownData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "runtimes.json")
	t.Setenv("SKYMONI_RUNTIME_RELEASES_FILE", path)
	valid := runtimeFixture()
	data, _ := json.Marshal(map[string]any{"releases": []RuntimeRelease{valid}})
	require.NoError(t, os.WriteFile(path, data, 0600))
	got, err := LoadRuntimeReleases()
	require.NoError(t, err)
	require.Len(t, got, 1)
	for _, raw := range []string{`{"releases":[]} {}`, `{"releases":[],"unknown":1}`, `{"releases":[{}]}`} {
		require.NoError(t, os.WriteFile(path, []byte(raw), 0600))
		_, err = LoadRuntimeReleases()
		require.Error(t, err)
	}
	data, _ = json.Marshal(map[string]any{"releases": []RuntimeRelease{valid, valid}})
	require.NoError(t, os.WriteFile(path, data, 0600))
	_, err = LoadRuntimeReleases()
	require.Error(t, err)
}
