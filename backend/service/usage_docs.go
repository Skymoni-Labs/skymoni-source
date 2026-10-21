package service

import (
	"errors"
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

var ErrDocsInvalid = errors.New("invalid document")
var ErrDocsConflict = errors.New("document changed")
var docsMutex sync.Mutex
var docsID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

const DocsImageLimit int64 = 5 * 1024 * 1024

type DocsBlock struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Text  string `json:"text"`
	URL   string `json:"url"`
	Level int    `json:"level"`
}
type DocsPage struct {
	Title    string      `json:"title"`
	Summary  string      `json:"summary"`
	Category string      `json:"category"`
	Order    int         `json:"order"`
	Blocks   []DocsBlock `json:"blocks"`
}
type DocsEntry struct {
	ID          string    `json:"id"`
	Revision    string    `json:"revision"`
	Draft       DocsPage  `json:"draft"`
	Published   *DocsPage `json:"published,omitempty"`
	UpdatedAt   int64     `json:"updatedAt"`
	PublishedAt int64     `json:"publishedAt"`
}
type DocsCatalog struct {
	Entries []DocsEntry `json:"entries"`
}
type DocsPublic struct {
	ID string `json:"id"`
	DocsPage
	PublishedAt int64 `json:"publishedAt"`
}

func DocsDirectory() string {
	if dir := os.Getenv("USAGE_DOCS_DIR"); dir != "" {
		return dir
	}
	return "/data/usage-docs"
}

// Both processes in a rolling deploy share this lock and atomically replaced file.
func WithDocsCatalog(write bool, fn func(*DocsCatalog) error) error {
	docsMutex.Lock()
	defer docsMutex.Unlock()
	dir := DocsDirectory()
	if err := os.MkdirAll(filepath.Join(dir, "images"), 0700); err != nil {
		return err
	}
	lock, err := os.OpenFile(filepath.Join(dir, ".lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err = lockSoftwareFile(lock); err != nil {
		return err
	}
	defer unlockSoftwareFile(lock)
	data := DocsCatalog{Entries: []DocsEntry{}}
	raw, err := os.ReadFile(filepath.Join(dir, "catalog.json"))
	if err == nil {
		if err = common.Unmarshal(raw, &data); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err = fn(&data); err != nil || !write {
		return err
	}
	raw, err = common.Marshal(data)
	if err != nil {
		return err
	}
	if len(raw) > 32*1024*1024 {
		return ErrSoftwareStorageFull
	}
	temp, err := os.CreateTemp(dir, ".catalog-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if _, err = temp.Write(raw); err == nil {
		err = temp.Sync()
	}
	closeErr := temp.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err = os.Rename(temp.Name(), filepath.Join(dir, "catalog.json")); err != nil {
		return err
	}
	if folder, err := os.Open(dir); err == nil {
		_ = folder.Sync()
		_ = folder.Close()
	}
	return nil
}

func ValidDocsURL(raw string) bool {
	if raw == "" {
		return false
	}
	if strings.HasPrefix(raw, "/api/docs/images/") {
		return docsID.MatchString(strings.TrimPrefix(raw, "/api/docs/images/"))
	}
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Hostname() != "" && u.User == nil
}

func validateDocs(page *DocsPage) error {
	page.Title = strings.TrimSpace(page.Title)
	page.Category = strings.TrimSpace(page.Category)
	if page.Title == "" || utf8.RuneCountInString(page.Title) > 160 || len(page.Summary) > 2000 || utf8.RuneCountInString(page.Category) > 60 || page.Order < 0 || page.Order > 10000 || len(page.Blocks) > 200 {
		return ErrDocsInvalid
	}
	seen := map[string]bool{}
	size := 0
	for _, block := range page.Blocks {
		if !docsID.MatchString(block.ID) || seen[block.ID] {
			return ErrDocsInvalid
		}
		seen[block.ID] = true
		size += len(block.Text) + len(block.URL)
		switch block.Type {
		case "heading":
			if block.Level < 1 || block.Level > 3 || utf8.RuneCountInString(block.Text) > 300 {
				return ErrDocsInvalid
			}
		case "text", "list", "code", "callout", "divider":
		case "image":
			if block.URL != "" && !ValidDocsURL(block.URL) {
				return ErrDocsInvalid
			}
		default:
			return ErrDocsInvalid
		}
	}
	if size > 512*1024 {
		return ErrDocsInvalid
	}
	if page.Blocks == nil {
		page.Blocks = []DocsBlock{}
	}
	return nil
}

func SaveDocs(id, revision, action string, page DocsPage) (DocsEntry, error) {
	var result DocsEntry
	if !docsID.MatchString(id) || revision == "" {
		return result, ErrDocsInvalid
	}
	if action != "save" && action != "publish" && action != "unpublish" && action != "delete" {
		return result, ErrDocsInvalid
	}
	if action == "save" || action == "publish" {
		if err := validateDocs(&page); err != nil {
			return result, err
		}
	}
	err := WithDocsCatalog(true, func(c *DocsCatalog) error {
		index := slices.IndexFunc(c.Entries, func(e DocsEntry) bool { return e.ID == id })
		current := DocsEntry{ID: id, Revision: "new"}
		if index >= 0 {
			current = c.Entries[index]
		} else if action == "delete" || action == "unpublish" {
			return os.ErrNotExist
		}
		if current.Revision != revision {
			return ErrDocsConflict
		}
		if action == "delete" {
			c.Entries = slices.Delete(c.Entries, index, index+1)
			return nil
		}
		if index < 0 && len(c.Entries) >= 500 {
			return ErrSoftwareStorageFull
		}
		if action == "save" || action == "publish" {
			current.Draft = page
		}
		if action == "publish" {
			for _, b := range page.Blocks {
				if b.Type == "image" && strings.HasPrefix(b.URL, "/api/docs/images/") {
					if _, err := os.Stat(DocsImagePath(strings.TrimPrefix(b.URL, "/api/docs/images/"))); err != nil {
						return ErrDocsInvalid
					}
				}
			}
			published := page
			published.Blocks = slices.Clone(page.Blocks)
			current.Published = &published
			current.PublishedAt = time.Now().Unix()
		}
		if action == "unpublish" {
			current.Published = nil
			current.PublishedAt = 0
		}
		current.Revision = common.GetUUID()
		current.UpdatedAt = time.Now().Unix()
		result = current
		if index < 0 {
			c.Entries = append(c.Entries, current)
		} else {
			c.Entries[index] = current
		}
		return nil
	})
	return result, err
}

func PublicDocs(detail string) ([]DocsPublic, error) {
	pages := []DocsPublic{}
	err := WithDocsCatalog(false, func(c *DocsCatalog) error {
		for _, entry := range c.Entries {
			if entry.Published == nil || (detail != "" && detail != entry.ID) {
				continue
			}
			page := *entry.Published
			if detail == "" {
				page.Blocks = nil
			}
			pages = append(pages, DocsPublic{ID: entry.ID, DocsPage: page, PublishedAt: entry.PublishedAt})
		}
		return nil
	})
	slices.SortStableFunc(pages, func(a, b DocsPublic) int {
		if a.Order != b.Order {
			return a.Order - b.Order
		}
		return strings.Compare(a.Title, b.Title)
	})
	if err == nil && detail != "" && len(pages) == 0 {
		err = os.ErrNotExist
	}
	return pages, err
}

func DocsImagePath(id string) string { return filepath.Join(DocsDirectory(), "images", id) }
func StoreDocsImage(raw []byte) (string, error) {
	id := common.GetUUID()
	err := WithDocsCatalog(false, func(_ *DocsCatalog) error {
		var size int64
		files, err := os.ReadDir(filepath.Join(DocsDirectory(), "images"))
		if err != nil {
			return err
		}
		for _, f := range files {
			info, err := f.Info()
			if err != nil {
				return err
			}
			size += info.Size()
		}
		if size+int64(len(raw)) > 512*1024*1024 {
			return ErrSoftwareStorageFull
		}
		f, err := os.OpenFile(DocsImagePath(id), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return err
		}
		_, err = f.Write(raw)
		if err == nil {
			err = f.Sync()
		}
		closeErr := f.Close()
		if err != nil {
			_ = os.Remove(DocsImagePath(id))
			return err
		}
		return closeErr
	})
	return id, err
}
func OpenDocsImage(id string, admin bool) (io.ReadSeeker, error) {
	if !docsID.MatchString(id) {
		return nil, os.ErrNotExist
	}
	err := WithDocsCatalog(false, func(c *DocsCatalog) error {
		if admin {
			return nil
		}
		for _, e := range c.Entries {
			if e.Published != nil {
				for _, b := range e.Published.Blocks {
					if b.Type == "image" && b.URL == "/api/docs/images/"+id {
						return nil
					}
				}
			}
		}
		return os.ErrNotExist
	})
	if err != nil {
		return nil, err
	}
	return os.Open(DocsImagePath(id))
}
