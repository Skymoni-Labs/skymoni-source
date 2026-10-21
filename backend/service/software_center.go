package service

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

const SoftwareUploadLimit int64 = 1024 * 1024 * 1024
const SoftwareStorageLimit int64 = 2 * SoftwareUploadLimit

var ErrSoftwareConflict = errors.New("software catalog changed; reload before saving")
var ErrSoftwareInvalid = errors.New("invalid software entry")
var ErrSoftwareStorageFull = errors.New("software upload storage is full")
var softwareStoreMutex sync.Mutex
var softwareID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
var softwareFileID = regexp.MustCompile(`^[a-f0-9]{64}$`)

type SoftwareEntry struct {
	Downloads   []SoftwareDownload `json:"downloads,omitempty"`
	ID          string             `json:"id"`
	Kind        string             `json:"kind"`
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Platform    string             `json:"platform"`
	Version     string             `json:"version"`
	DownloadURL string             `json:"downloadUrl"`
	Filename    string             `json:"filename"`
	DetailURL   string             `json:"detailUrl"`
	ImageURL    string             `json:"imageUrl"`
	Appearance  string             `json:"appearance"`
	SortOrder   int                `json:"sortOrder"`
	Published   bool               `json:"published"`
	Details     *SoftwareDetails   `json:"details,omitempty"`
}

type SoftwareDownload struct {
	Platform string `json:"platform"`
	Label    string `json:"label"`
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Kind     string `json:"kind"`
	Version  string `json:"version,omitempty"`
}

func validSoftwareDownloads(downloads []SoftwareDownload) bool {
	if len(downloads) > 16 {
		return false
	}
	for _, item := range downloads {
		if strings.TrimSpace(item.Platform) == "" || utf8.RuneCountInString(item.Platform) > 80 || strings.TrimSpace(item.Label) == "" || utf8.RuneCountInString(item.Label) > 120 || utf8.RuneCountInString(item.Version) > 60 || len(item.Filename) > 240 || strings.ContainsAny(item.Filename, "/\\\r\n\x00") || item.URL == "" || item.URL == "#installation" || !SoftwareSafeURL(item.URL, false) || !slices.Contains([]string{"installer", "website", "cloud"}, item.Kind) {
			return false
		}
	}
	return true
}

// Optional display metadata keeps catalogs created before detail pages compatible.
type SoftwareDetails struct {
	Overview           string   `json:"overview,omitempty"`
	Features           string   `json:"features,omitempty"`
	Changelog          string   `json:"changelog,omitempty"`
	Requirements       string   `json:"requirements,omitempty"`
	Publisher          string   `json:"publisher,omitempty"`
	Category           string   `json:"category,omitempty"`
	License            string   `json:"license,omitempty"`
	UpdatedAt          string   `json:"updatedAt,omitempty"`
	Screenshots        []string `json:"screenshots,omitempty"`
	ScreenshotsEnabled *bool    `json:"screenshotsEnabled,omitempty"`
	ImageLayout        string   `json:"imageLayout,omitempty"`
}

func validSoftwareDetails(details *SoftwareDetails) bool {
	if details == nil {
		return true
	}
	for _, field := range []struct {
		value string
		limit int
	}{
		{details.Overview, 12000}, {details.Features, 4000}, {details.Changelog, 4000},
		{details.Requirements, 2000}, {details.Publisher, 120}, {details.Category, 80}, {details.License, 120},
	} {
		if utf8.RuneCountInString(field.value) > field.limit {
			return false
		}
	}
	if details.UpdatedAt != "" {
		if _, err := time.Parse("2006-01-02", details.UpdatedAt); err != nil {
			return false
		}
	}
	if !slices.Contains([]string{"", "portrait", "landscape"}, details.ImageLayout) || len(details.Screenshots) > 12 {
		return false
	}
	for _, image := range details.Screenshots {
		if image == "" || !SoftwareSafeURL(image, true) {
			return false
		}
	}
	return true
}

type SoftwareCatalog struct {
	Revision string                  `json:"revision"`
	Items    []SoftwareEntry         `json:"items"`
	Featured *SoftwareFeaturedConfig `json:"featured,omitempty"`
}

// Nil keeps the legacy automatic selection; empty lists explicitly hide slots.
type SoftwareFeaturedConfig struct {
	Carousel []string `json:"carousel"`
	Tiles    []string `json:"tiles"`
}

type SoftwareFile struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Bytes    int64  `json:"bytes"`
	SHA256   string `json:"sha256"`
}

func SoftwareDirectory() string {
	if directory := os.Getenv("SOFTWARE_CENTER_DIR"); directory != "" {
		return directory
	}
	return "/data/software-center"
}

// Atomic replacement keeps the catalog readable during uploads and process restarts.
// The OS lock also serializes writes during rolling deployments with two processes.
func withSoftwareStore(action func() error) error {
	softwareStoreMutex.Lock()
	defer softwareStoreMutex.Unlock()
	directory := SoftwareDirectory()
	if err := os.MkdirAll(filepath.Join(directory, "files"), 0755); err != nil {
		return err
	}
	lock, err := os.OpenFile(filepath.Join(directory, ".lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err := lockSoftwareFile(lock); err != nil {
		return err
	}
	defer unlockSoftwareFile(lock)
	return action()
}

func writeSoftwareJSON(path string, value any) error {
	data, err := common.Marshal(value)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".catalog-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	_, writeErr := file.Write(data)
	syncErr := file.Sync()
	closeErr := file.Close()
	if err := errors.Join(writeErr, syncErr, closeErr); err != nil {
		return err
	}
	if err := os.Chmod(file.Name(), 0600); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

func defaultSoftwareCatalog() SoftwareCatalog {
	return SoftwareCatalog{Revision: "initial", Items: []SoftwareEntry{
		{ID: "drip", Kind: "software", Name: "Drip Browser", Description: "A space for browsing, with subscriptions and proxy nodes in easy reach.", Platform: "Windows 10 / 11 · x64", Version: "0.3.28", DownloadURL: "/drip-releases/Drip-Setup-0.3.28-x64.exe", Filename: "Drip-Setup-0.3.28-x64.exe", DetailURL: "#installation", Appearance: "drip", SortOrder: 10, Published: true},
		{ID: "skymoni-mail", Kind: "software", Name: "skymoni Mail", Description: "Your inbox on the go, with verification code copying and new mail notifications.", Platform: "Android 7.0+", Version: "1.4.1", DownloadURL: "/static/downloads/skymoni-mail/1.4.1/Skymoni-Mail-1.4.1.apk", Filename: "Skymoni-Mail-1.4.1.apk", DetailURL: "https://mail.skymoni.com/login", Appearance: "mail", SortOrder: 20, Published: true},
		{ID: "cherry-studio", Kind: "tool", Name: "Cherry Studio", Description: "A desktop AI assistant for chatting with multiple models in one place.", Platform: "Windows · macOS · Linux", DetailURL: "https://cherry-ai.com", Appearance: "cherry", SortOrder: 30, Published: true},
		{ID: "cc-switch", Kind: "tool", Name: "CC Switch", Description: "Manage API configurations for Claude Code, Codex and other AI coding tools.", Platform: "Windows · macOS · Linux", DetailURL: "https://ccswitch.io", Appearance: "cc", SortOrder: 40, Published: true},
	}}
}

func LoadSoftwareCatalog() (SoftwareCatalog, error) {
	data, err := os.ReadFile(filepath.Join(SoftwareDirectory(), "catalog.json"))
	if errors.Is(err, os.ErrNotExist) {
		return defaultSoftwareCatalog(), nil
	}
	if err != nil {
		return SoftwareCatalog{}, err
	}
	var catalog SoftwareCatalog
	err = common.Unmarshal(data, &catalog)
	return catalog, err
}

func SoftwareSafeURL(value string, image bool) bool {
	if value == "" {
		return true
	}
	if strings.ContainsAny(value, "\\\r\n\x00") || len(value) > 2048 {
		return false
	}
	if !image && value == "#installation" {
		return true
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.User != nil {
		return false
	}
	if parsed.Scheme == "https" && parsed.Hostname() != "" {
		return true
	}
	prefixes := []string{"/drip-releases/", "/static/downloads/", "/api/software/files/"}
	if image {
		prefixes = []string{"/api/shop/images/", "/static/software/"}
	}
	if parsed.Scheme != "" || parsed.Host != "" || parsed.RawQuery != "" || parsed.Fragment != "" || strings.Contains(parsed.Path, "..") || strings.ContainsAny(parsed.Path, "\\\r\n\x00") {
		return false
	}
	return slices.ContainsFunc(prefixes, func(prefix string) bool { return strings.HasPrefix(value, prefix) })
}

func SaveSoftwareCatalog(catalog SoftwareCatalog) error {
	if len(catalog.Items) > 200 || catalog.Items == nil {
		return ErrSoftwareInvalid
	}
	seen := map[string]bool{}
	for i := range catalog.Items {
		item := &catalog.Items[i]
		item.Name = strings.TrimSpace(item.Name)
		if !validSoftwareDetails(item.Details) || !validSoftwareDownloads(item.Downloads) {
			return ErrSoftwareInvalid
		}
		if !softwareID.MatchString(item.ID) || seen[item.ID] || (item.Kind != "software" && item.Kind != "tool") || item.Name == "" || utf8.RuneCountInString(item.Name) > 120 || utf8.RuneCountInString(item.Description) > 2000 || utf8.RuneCountInString(item.Platform) > 200 || utf8.RuneCountInString(item.Version) > 60 || len(item.Filename) > 240 || strings.ContainsAny(item.Filename, "/\\\r\n\x00") || item.SortOrder < -100000 || item.SortOrder > 100000 || !slices.Contains([]string{"generic", "drip", "mail", "cherry", "cc"}, item.Appearance) || !SoftwareSafeURL(item.DownloadURL, false) || !SoftwareSafeURL(item.DetailURL, false) || !SoftwareSafeURL(item.ImageURL, true) || (item.Published && item.DownloadURL == "" && item.DetailURL == "" && len(item.Downloads) == 0) {
			return ErrSoftwareInvalid
		}
		seen[item.ID] = true

	}
	if catalog.Featured != nil {
		for _, placement := range []struct {
			ids   []string
			limit int
		}{{catalog.Featured.Carousel, 5}, {catalog.Featured.Tiles, 3}} {
			if placement.ids == nil || len(placement.ids) > placement.limit {
				return ErrSoftwareInvalid
			}
			selected := map[string]bool{}
			for _, id := range placement.ids {
				if !seen[id] || selected[id] {
					return ErrSoftwareInvalid
				}
				selected[id] = true
			}
		}
	}
	return withSoftwareStore(func() error {
		for i := range catalog.Items {
			item := &catalog.Items[i]
			if strings.HasPrefix(item.DownloadURL, "/api/software/files/") {
				parts := strings.Split(item.DownloadURL, "/")
				if len(parts) != 6 {
					return ErrSoftwareInvalid
				}
				file, err := LoadSoftwareFile(parts[4])
				if err != nil || file.URL != item.DownloadURL {
					return ErrSoftwareInvalid
				}
				item.Filename = file.Filename
			}
		}

		previous, err := LoadSoftwareCatalog()
		if err != nil {
			return err
		}
		if previous.Revision != catalog.Revision {
			return ErrSoftwareConflict
		}
		catalog.Revision = common.GetUUID()
		slices.SortStableFunc(catalog.Items, func(a, b SoftwareEntry) int { return a.SortOrder - b.SortOrder })
		return writeSoftwareJSON(filepath.Join(SoftwareDirectory(), "catalog.json"), catalog)
	})
}

// Installer types are stored as data, never extracted or executed on the server.
func SoftwareInstallerExtension(name string) string {
	if len(name) > 240 || name == "" || strings.ContainsAny(name, "/\\:\r\n\x00") || strings.HasPrefix(name, ".") {
		return ""
	}
	for _, extension := range []string{".tar.gz", ".exe", ".msi", ".apk", ".dmg", ".pkg", ".zip", ".7z", ".deb", ".rpm", ".appimage"} {
		if strings.HasSuffix(strings.ToLower(name), extension) {
			return extension
		}
	}
	return ""
}

func SoftwareInstallerSignature(extension string, header []byte) bool {
	switch extension {
	case ".exe":
		return len(header) >= 2 && string(header[:2]) == "MZ"
	case ".zip", ".apk":
		return len(header) >= 4 && slices.Contains([]string{"PK\x03\x04", "PK\x05\x06", "PK\x07\x08"}, string(header[:4]))
	case ".msi":
		return len(header) >= 8 && string(header[:8]) == "\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
	case ".7z":
		return len(header) >= 6 && string(header[:6]) == "7z\xbc\xaf\x27\x1c"
	case ".tar.gz":
		return len(header) >= 2 && string(header[:2]) == "\x1f\x8b"
	case ".deb":
		return len(header) >= 8 && string(header[:8]) == "!<arch>\n"
	case ".rpm":
		return len(header) >= 4 && string(header[:4]) == "\xed\xab\xee\xdb"
	case ".appimage":
		return len(header) >= 4 && string(header[:4]) == "\x7fELF"
	case ".pkg":
		return len(header) >= 4 && string(header[:4]) == "xar!"
	case ".dmg":
		return true // UDIF signatures are at the end; validated after streaming below.
	}
	return false
}

func StoreSoftwareInstaller(name string, reader io.Reader, limit int64) (SoftwareFile, error) {
	extension := SoftwareInstallerExtension(name)
	if extension == "" {
		return SoftwareFile{}, ErrSoftwareInvalid
	}
	var stored SoftwareFile
	err := withSoftwareStore(func() error {
		directory := filepath.Join(SoftwareDirectory(), "files")
		entries, err := os.ReadDir(directory)
		if err != nil {
			return err
		}
		var used int64
		for _, entry := range entries {
			if info, err := entry.Info(); err == nil && entry.Type().IsRegular() {
				used += info.Size()
			}
		}
		free, err := softwareFreeDisk(directory)
		if err != nil {
			return err
		}
		allowance := min(limit, SoftwareStorageLimit-used, free-512*1024*1024)
		if allowance <= 0 {
			return ErrSoftwareStorageFull
		}
		temp, err := os.CreateTemp(directory, ".upload-*")
		if err != nil {
			return err
		}
		defer os.Remove(temp.Name())
		defer temp.Close()
		header := make([]byte, 512)
		n, err := io.ReadFull(reader, header)
		if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
			return err
		}
		header = header[:n]
		if !SoftwareInstallerSignature(extension, header) {
			return ErrSoftwareInvalid
		}
		hash := sha256.New()
		writer := io.MultiWriter(temp, hash)
		if _, err = writer.Write(header); err != nil {
			return err
		}
		remaining := max(int64(0), allowance-int64(n))
		copied, err := io.Copy(writer, io.LimitReader(reader, remaining+1))
		size := int64(n) + copied
		if err != nil {
			return err
		}
		if size > allowance {
			return ErrSoftwareStorageFull
		}
		if size == 0 {
			return ErrSoftwareInvalid
		}
		if extension == ".dmg" {
			trailer := make([]byte, 4)
			if size < 512 {
				return ErrSoftwareInvalid
			}
			if _, err = temp.ReadAt(trailer, size-512); err != nil || string(trailer) != "koly" {
				return ErrSoftwareInvalid
			}
		}
		if err = temp.Sync(); err != nil {
			return err
		}
		if err = temp.Close(); err != nil {
			return err
		}
		if err = os.Chmod(temp.Name(), 0600); err != nil {
			return err
		}
		id := fmt.Sprintf("%x", sha256.Sum256([]byte(common.GetUUID())))
		stored = SoftwareFile{ID: id, URL: "/api/software/files/" + id + "/" + url.PathEscape(name), Filename: name, Bytes: size, SHA256: fmt.Sprintf("%x", hash.Sum(nil))}
		if err = os.Rename(temp.Name(), filepath.Join(directory, id)); err != nil {
			return err
		}
		if err = writeSoftwareJSON(filepath.Join(directory, id+".json"), stored); err != nil {
			os.Remove(filepath.Join(directory, id))
			return err
		}
		return nil
	})
	return stored, err
}

func LoadSoftwareFile(id string) (SoftwareFile, error) {
	if !softwareFileID.MatchString(id) {
		return SoftwareFile{}, os.ErrNotExist
	}
	data, err := os.ReadFile(filepath.Join(SoftwareDirectory(), "files", id+".json"))
	if err != nil {
		return SoftwareFile{}, err
	}
	var file SoftwareFile
	err = common.Unmarshal(data, &file)
	return file, err
}

func ListSoftwareFiles() ([]SoftwareFile, error) {
	items := []SoftwareFile{}
	entries, err := os.ReadDir(filepath.Join(SoftwareDirectory(), "files"))
	if errors.Is(err, os.ErrNotExist) {
		return items, nil
	}
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if id, ok := strings.CutSuffix(entry.Name(), ".json"); ok {
			file, err := LoadSoftwareFile(id)
			if err != nil {
				return nil, err
			}
			items = append(items, file)
		}
	}
	return items, nil
}

func DeleteSoftwareFile(id string) error {
	return withSoftwareStore(func() error {
		file, err := LoadSoftwareFile(id)
		if err != nil {
			return err
		}
		catalog, err := LoadSoftwareCatalog()
		if err != nil {
			return err
		}
		if slices.ContainsFunc(catalog.Items, func(item SoftwareEntry) bool { return item.DownloadURL == file.URL }) {
			return ErrSoftwareConflict
		}
		if err = os.Remove(filepath.Join(SoftwareDirectory(), "files", id)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		return os.Remove(filepath.Join(SoftwareDirectory(), "files", id+".json"))
	})
}
