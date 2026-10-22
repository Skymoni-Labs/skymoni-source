package service

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"slices"
	"strings"
	"time"
)

const AppPackageName = "com.skyjjgw.independent.ski"

var appReleaseID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)
var appReleaseVersion = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$`)
var appReleaseHash = regexp.MustCompile(`^[a-f0-9]{64}$`)

type AppRelease struct {
	ID           string   `json:"id"`
	Version      string   `json:"version"`
	VersionCode  int64    `json:"version_code"`
	MinSDK       int      `json:"min_sdk"`
	ABIs         []string `json:"abis"`
	Upstream     string   `json:"upstream"`
	SHA256       string   `json:"sha256"`
	Size         int64    `json:"size"`
	Notes        string   `json:"notes"`
	PublishedAt  int64    `json:"published_at"`
	PackageName  string   `json:"package_name"`
	SignerSHA256 string   `json:"signer_sha256"`
}

func ValidAppABI(abi string) bool {
	return slices.Contains([]string{"arm64-v8a", "x86_64", "armeabi-v7a", "universal"}, abi)
}
func ValidateAppRelease(r AppRelease) error {
	if !appReleaseID.MatchString(r.ID) || !appReleaseVersion.MatchString(r.Version) || r.VersionCode < 1 || r.MinSDK < 21 || r.MinSDK > 100 || len(r.ABIs) == 0 || len(r.ABIs) > 4 || !appReleaseHash.MatchString(r.SHA256) || !appReleaseHash.MatchString(r.SignerSHA256) || r.Size <= 0 || r.Size > 256<<20 || r.PackageName != AppPackageName || len(r.Notes) > 8000 || r.PublishedAt <= 0 {
		return errors.New("invalid App release metadata")
	}
	for _, abi := range r.ABIs {
		if !ValidAppABI(abi) {
			return errors.New("unsupported APK ABI")
		}
	}
	u, err := url.Parse(r.Upstream)
	if err != nil || u.Scheme != "https" || u.Host != "github.com" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return errors.New("invalid APK origin")
	}
	parts := strings.Split(strings.TrimPrefix(u.Path, "/"), "/")
	if len(parts) != 6 || parts[0] != "skyjjgw" || parts[1] != "skivu" || parts[2] != "releases" || parts[3] != "download" || !appReleaseID.MatchString(parts[4]) || !appReleaseID.MatchString(parts[5]) || !strings.HasSuffix(parts[5], ".apk") {
		return errors.New("APK must be a fixed Skivu release asset")
	}
	return nil
}
func LoadAppReleases() ([]AppRelease, error) {
	path := os.Getenv("SKYMONI_APP_RELEASES_FILE")
	if path == "" {
		return []AppRelease{}, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, (64<<10)+1))
	if err != nil || len(data) > 64<<10 {
		return nil, errors.New("invalid release manifest")
	}
	var manifest struct {
		Releases []AppRelease `json:"releases"`
	}
	if json.Unmarshal(data, &manifest) != nil || len(manifest.Releases) > 30 {
		return nil, errors.New("invalid release manifest")
	}
	ids := map[string]bool{}
	for _, r := range manifest.Releases {
		if err := ValidateAppRelease(r); err != nil {
			return nil, err
		}
		if ids[r.ID] {
			return nil, errors.New("duplicate release id")
		}
		ids[r.ID] = true
	}
	if manifest.Releases == nil {
		manifest.Releases = []AppRelease{}
	}
	return manifest.Releases, nil
}

func AppReleaseHTTPClient() *http.Client {
	return &http.Client{Timeout: 10 * time.Minute, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many APK redirects")
		}
		if req.URL.Scheme != "https" || req.URL.User != nil || (req.URL.Port() != "" && req.URL.Port() != "443") || !slices.Contains([]string{"github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"}, req.URL.Hostname()) {
			return errors.New("APK redirect origin denied")
		}
		return nil
	}}
}
