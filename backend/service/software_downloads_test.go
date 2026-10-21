package service

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestSoftwarePlatformDownloadsRoundTrip(t *testing.T) {
	t.Setenv("SOFTWARE_CENTER_DIR", t.TempDir())
	catalog, err := LoadSoftwareCatalog()
	require.NoError(t, err)
	catalog.Items[0].DownloadURL = ""
	catalog.Items[0].DetailURL = ""
	catalog.Items[0].Downloads = []SoftwareDownload{{Platform: "Windows", Label: "Installer", URL: "https://example.com/app.exe", Filename: "app.exe", Kind: "installer", Version: "1.0"}, {Platform: "iOS", Label: "App Store", URL: "https://apps.apple.com/app/id123", Kind: "website"}}
	require.NoError(t, SaveSoftwareCatalog(catalog))
	stored, err := LoadSoftwareCatalog()
	require.NoError(t, err)
	require.Equal(t, catalog.Items[0].Downloads, stored.Items[0].Downloads)
	for _, value := range []SoftwareDownload{
		{Platform: "Android", Label: "APK", URL: "javascript:alert(1)", Kind: "installer"},
		{Platform: "Android", Label: "APK", URL: "https://example.com/app.apk", Filename: "../app.apk", Kind: "installer"},
		{Platform: "", Label: "APK", URL: "https://example.com/app.apk", Kind: "installer"},
		{Platform: "Android", Label: "APK", URL: "https://example.com/app.apk", Kind: "invalid"},
	} {
		invalid := stored
		invalid.Items = append([]SoftwareEntry(nil), stored.Items...)
		invalid.Items[0].Downloads = []SoftwareDownload{value}
		require.ErrorIs(t, SaveSoftwareCatalog(invalid), ErrSoftwareInvalid)
		unchanged, err := LoadSoftwareCatalog()
		require.NoError(t, err)
		require.Equal(t, stored, unchanged)
	}
}
