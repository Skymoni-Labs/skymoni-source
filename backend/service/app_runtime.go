package service

import (
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var runtimePackage = regexp.MustCompile(`^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,15}$`)
var runtimeClass = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_.$]{0,240}$`)
var runtimeRepository = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$`)

type RuntimeRelease struct {
	ID           string `json:"id"`
	Version      string `json:"version"`
	VersionCode  int64  `json:"version_code"`
	PackageName  string `json:"package_name"`
	Component    string `json:"component"`
	SignerSHA256 string `json:"signer_sha256"`
	MinSDK       int    `json:"min_sdk"`
	ABI          string `json:"abi"`
	SHA256       string `json:"sha256"`
	Size         int64  `json:"size"`
	Upstream     string `json:"upstream"`
	Notes        string `json:"notes"`
}

func ValidRuntimePackage(value string) bool {
	return runtimePackage.MatchString(value) && value != AppPackageName
}
func ValidateRuntimeRelease(r RuntimeRelease) error {
	parts := strings.Split(r.Component, "/")
	if !appReleaseID.MatchString(r.ID) || !appReleaseVersion.MatchString(r.Version) || r.VersionCode < 1 || !ValidRuntimePackage(r.PackageName) || len(parts) != 2 || parts[0] != r.PackageName || !strings.HasPrefix(parts[1], r.PackageName+".") || !runtimeClass.MatchString(parts[1]) || !appReleaseHash.MatchString(r.SignerSHA256) || !appReleaseHash.MatchString(r.SHA256) || r.Size <= 0 || r.Size > 512<<20 || r.MinSDK < 26 || r.MinSDK > 100 || (r.ABI != "arm64-v8a" && r.ABI != "x86_64") || len(r.Notes) > 4000 {
		return errors.New("invalid runtime release")
	}
	u, err := url.Parse(r.Upstream)
	if err != nil || u.Scheme != "https" || u.Host != "github.com" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.RawPath != "" {
		return errors.New("invalid runtime origin")
	}
	p := strings.Split(strings.TrimPrefix(u.Path, "/"), "/")
	if len(p) != 6 || !runtimeRepository.MatchString(p[0]) || !runtimeRepository.MatchString(p[1]) || p[0] == "." || p[0] == ".." || p[1] == "." || p[1] == ".." || p[2] != "releases" || p[3] != "download" || !appReleaseID.MatchString(p[4]) || !appReleaseID.MatchString(p[5]) || !strings.HasSuffix(p[5], ".apk") {
		return errors.New("runtime must be a fixed release asset")
	}
	return nil
}

// Only the operator-owned registry selects upstreams. No request URL, package
// parameter or plugin is allowed to register or change an upstream URL.
func LoadRuntimeReleases() ([]RuntimeRelease, error) {
	path := os.Getenv("SKYMONI_RUNTIME_RELEASES_FILE")
	if path == "" {
		app := os.Getenv("SKYMONI_APP_RELEASES_FILE")
		if app == "" {
			return []RuntimeRelease{}, nil
		}
		path = filepath.Join(filepath.Dir(app), "runtimes.json")
	}
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return []RuntimeRelease{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, 256<<10+1))
	if err != nil || len(data) > 256<<10 {
		return nil, errors.New("invalid runtime registry")
	}
	var registry struct {
		Releases []RuntimeRelease `json:"releases"`
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&registry) != nil || decoder.Decode(new(any)) != io.EOF || len(registry.Releases) > 128 {
		return nil, errors.New("invalid runtime registry")
	}
	seen := map[string]bool{}
	for _, r := range registry.Releases {
		if ValidateRuntimeRelease(r) != nil {
			return nil, errors.New("invalid runtime metadata")
		}
		key := r.PackageName + "/" + r.ID + "/" + r.ABI
		if seen[key] {
			return nil, errors.New("duplicate runtime release")
		}
		seen[key] = true
	}
	return registry.Releases, nil
}
