package service

import (
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
	"github.com/QuantumNous/new-api/model"
)

var ErrCreatorForbidden = errors.New("creator permission required")
var ErrCreatorInvalid = errors.New("invalid creator content")
var ErrCreatorConflict = errors.New("creator content changed; reload")
var creatorMutex sync.Mutex
var creatorID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
var creatorHandle = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,40}$`)
var creatorAccent = regexp.MustCompile(`^#[a-fA-F0-9]{6}$`)

const CreatorTermsVersion = "2026-10-08"
const CreatorUploadLimit int64 = 20 * 1024 * 1024

type CreatorProfile struct {
	Avatar       *string `json:"avatar,omitempty"`
	Name         string  `json:"name"`
	Handle       string  `json:"handle"`
	Bio          string  `json:"bio"`
	Website      string  `json:"website"`
	Introduction string  `json:"introduction"`
}
type CreatorMember struct {
	UserID       int            `json:"userId"`
	Profile      CreatorProfile `json:"profile"`
	Direction    string         `json:"direction"`
	TermsVersion string         `json:"termsVersion"`
	AcceptedAt   int64          `json:"acceptedAt"`
	GrantedAt    int64          `json:"grantedAt,omitempty"`
	GrantedBy    int            `json:"grantedBy,omitempty"`
	Suspended    bool           `json:"suspended"`
	Pinned       []string       `json:"pinned"`
	Saved        []string       `json:"saved"`
}
type CreatorFile struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	OwnerID   int    `json:"ownerId"`
	CreatedAt int64  `json:"createdAt"`
}
type CreatorBlock struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Title   string `json:"title"`
	Text    string `json:"text"`
	URL     string `json:"url"`
	Visible bool   `json:"visible"`
}
type CreatorLink struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	URL   string `json:"url"`
}
type CreatorMetadata struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Value string `json:"value"`
}
type CreatorSettings struct {
	Accent          string            `json:"accent"`
	Layout          string            `json:"layout"`
	CoverRatio      string            `json:"coverRatio"`
	ShowCover       bool              `json:"showCover"`
	ShowDescription bool              `json:"showDescription"`
	ShowGallery     bool              `json:"showGallery"`
	ShowFiles       bool              `json:"showFiles"`
	ShowRelated     bool              `json:"showRelated"`
	Listed          bool              `json:"listed"`
	ButtonLabel     string            `json:"buttonLabel"`
	CategoryName    string            `json:"categoryName"`
	Usage           string            `json:"usage"`
	Links           []CreatorLink     `json:"links"`
	Metadata        []CreatorMetadata `json:"metadata"`
}
type CreatorWork struct {
	ID          string           `json:"id"`
	OwnerID     int              `json:"ownerId"`
	Title       string           `json:"title"`
	Summary     string           `json:"summary"`
	Description string           `json:"description"`
	Author      string           `json:"author"`
	Category    string           `json:"category"`
	Tags        string           `json:"tags"`
	URL         string           `json:"url"`
	Cover       string           `json:"cover"`
	Images      []string         `json:"images"`
	Attachment  *CreatorFile     `json:"attachment,omitempty"`
	Style       string           `json:"style"`
	Status      string           `json:"status"`
	Revision    string           `json:"revision"`
	ReviewNote  string           `json:"reviewNote,omitempty"`
	UpdatedAt   int64            `json:"updatedAt"`
	Blocks      []CreatorBlock   `json:"blocks"`
	Settings    *CreatorSettings `json:"settings,omitempty"`
}
type CreatorRelease struct {
	ID          string       `json:"id"`
	OwnerID     int          `json:"ownerId"`
	ProjectID   string       `json:"projectId"`
	Version     string       `json:"version"`
	Platform    string       `json:"platform"`
	DownloadURL string       `json:"downloadUrl"`
	Package     *CreatorFile `json:"package,omitempty"`
	Notes       string       `json:"notes"`
	Provenance  string       `json:"provenance"`
	License     string       `json:"license"`
	SourceURL   string       `json:"sourceUrl"`
	StoreURL    string       `json:"storeUrl"`
	Status      string       `json:"status"`
	Revision    string       `json:"revision"`
	ReviewNote  string       `json:"reviewNote,omitempty"`
	UpdatedAt   int64        `json:"updatedAt"`
}
type CreatorReviewPolicy struct {
	AutoApproveWorks bool   `json:"autoApproveWorks"`
	Revision         string `json:"revision"`
}
type CreatorCatalog struct {
	HomeShowcase *CreatorHomeShowcase  `json:"homeShowcase,omitempty"`
	Showcase     *CreatorShowcase      `json:"showcase,omitempty"`
	ReviewPolicy CreatorReviewPolicy   `json:"reviewPolicy"`
	Members      map[int]CreatorMember `json:"members"`
	Works        []CreatorWork         `json:"works"`
	Releases     []CreatorRelease      `json:"releases"`
	Files        []CreatorFile         `json:"files"`
	HomeExamples []CreatorHomeExample  `json:"homeExamples,omitempty"`
}

func CreatorDirectory() string {
	if path := os.Getenv("CREATOR_CENTER_DIR"); path != "" {
		return path
	}
	return "/data/creator-center"
}

// The process and OS locks protect shared data during rolling deployments.
func WithCreatorCatalog(write bool, action func(*CreatorCatalog) error) error {
	creatorMutex.Lock()
	defer creatorMutex.Unlock()
	dir := CreatorDirectory()
	if err := os.MkdirAll(filepath.Join(dir, "files"), 0700); err != nil {
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
	c := CreatorCatalog{Members: map[int]CreatorMember{}, Works: []CreatorWork{}, Releases: []CreatorRelease{}, Files: []CreatorFile{}}
	raw, err := os.ReadFile(filepath.Join(dir, "catalog.json"))
	if err == nil {
		if err = common.Unmarshal(raw, &c); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	// Old catalogs keep manual review until an administrator explicitly changes it.
	if c.ReviewPolicy.Revision == "" {
		c.ReviewPolicy.Revision = "initial"
	}
	if err = action(&c); err != nil || !write {
		return err
	}
	raw, err = common.Marshal(c)
	if err != nil {
		return err
	}
	if len(raw) > 64*1024*1024 {
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
	// Persist the directory entry as well as the file before acknowledging success.
	folder, err := os.Open(dir)
	if err == nil {
		_ = folder.Sync()
		_ = folder.Close()
	}
	return nil
}

// CreatorMemberStatus exposes identity state without private profile or work data.
func CreatorMemberStatus(c *CreatorCatalog, uid int) string {
	m, ok := c.Members[uid]
	if !ok {
		return "none"
	}
	if m.Suspended {
		return "suspended"
	}
	if m.AcceptedAt > 0 {
		return "active"
	}
	if m.GrantedAt > 0 {
		return "authorized"
	}
	return "none"
}

// GrantCreator allows activation without a recharge. Only the user can accept terms.
func GrantCreator(uid, actor int) (string, bool, error) {
	status, changed := "", false
	if uid <= 0 || actor <= 0 {
		return status, changed, ErrCreatorInvalid
	}
	err := WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		member := c.Members[uid]
		if member.Suspended {
			return ErrCreatorForbidden
		}
		if member.AcceptedAt == 0 && member.GrantedAt == 0 {
			member.UserID, member.GrantedAt, member.GrantedBy = uid, time.Now().Unix(), actor
			member.Pinned, member.Saved = []string{}, []string{}
			c.Members[uid] = member
			changed = true
		}
		status = CreatorMemberStatus(c, uid)
		return nil
	})
	return status, changed, err
}

func CreatorActive(c *CreatorCatalog, uid int) bool {
	m, ok := c.Members[uid]
	return ok && !m.Suspended && m.AcceptedAt > 0
}

// Resolve identity at read time so previously submitted works follow profile edits.
func CreatorWorkIdentity(c *CreatorCatalog, w CreatorWork) CreatorWork {
	if member, ok := c.Members[w.OwnerID]; ok {
		w.Author = member.Profile.Name
	}
	return w
}

func SaveCreatorReviewPolicy(autoApprove bool, revision string) (CreatorReviewPolicy, error) {
	var policy CreatorReviewPolicy
	err := WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		if revision != c.ReviewPolicy.Revision {
			return ErrCreatorConflict
		}
		policy = CreatorReviewPolicy{AutoApproveWorks: autoApprove, Revision: common.GetUUID()}
		c.ReviewPolicy = policy
		return nil
	})
	return policy, err
}
func CreatorPublic(c *CreatorCatalog, w CreatorWork) bool {
	return w.Status == "published" && CreatorActive(c, w.OwnerID) && (w.Settings == nil || w.Settings.Listed)
}
func creatorText(s string, max int) bool {
	return utf8.ValidString(s) && utf8.RuneCountInString(s) <= max
}
func creatorURL(s string) bool {
	if s == "" {
		return true
	}
	if len(s) > 2048 {
		return false
	}
	u, e := url.Parse(s)
	return e == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != "" && u.User == nil
}
func creatorImage(s string) bool {
	if s == "" {
		return true
	}
	if creatorURL(s) {
		return true
	}
	return len(s) <= 400000 && (strings.HasPrefix(s, "data:image/jpeg;base64,") || strings.HasPrefix(s, "data:image/png;base64,") || strings.HasPrefix(s, "data:image/webp;base64,"))
}
func validCreatorProfile(p CreatorProfile) bool {
	if p.Avatar != nil {
		if _, err := NormalizeProfileAvatar(*p.Avatar); err != nil {
			return false
		}
	}
	return strings.TrimSpace(p.Name) != "" && creatorText(p.Name, 40) && creatorHandle.MatchString(p.Handle) && creatorText(p.Bio, 180) && creatorText(p.Introduction, 4000) && creatorURL(p.Website)
}
func ActivateCreator(uid int, p CreatorProfile, direction, terms string, eligible bool) error {
	if !validCreatorProfile(p) || terms != CreatorTermsVersion || !slices.Contains([]string{"website", "software", "design", "article", "workflow", "other"}, direction) {
		return ErrCreatorInvalid
	}
	return WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		if old, ok := c.Members[uid]; ok {
			if old.Suspended {
				return ErrCreatorForbidden
			}
			if old.AcceptedAt > 0 {
				return nil
			}
		}
		policy, err := model.CommunityPolicy(model.DB)
		if err != nil {
			return err
		}
		if !policy.CreatorApplicationsOpen {
			return ErrCreatorApplicationsClosed
		}
		old := c.Members[uid]
		if !eligible && old.GrantedAt == 0 {
			return ErrCreatorForbidden
		}
		for _, m := range c.Members {
			if strings.EqualFold(m.Profile.Handle, p.Handle) {
				return ErrCreatorConflict
			}
		}
		c.Members[uid] = CreatorMember{UserID: uid, Profile: p, Direction: direction, TermsVersion: terms, AcceptedAt: time.Now().Unix(), GrantedAt: old.GrantedAt, GrantedBy: old.GrantedBy, Pinned: []string{}, Saved: []string{}}
		cfg, err := model.GetCreatorHomeConfig(model.DB)
		if err != nil {
			return err
		}
		return ensureHomeAuthors(c, cfg)
	})
}
func SaveCreatorProfile(uid int, p CreatorProfile, pinned, saved []string) error {
	if !validCreatorProfile(p) || len(pinned) > 6 || len(saved) > 500 {
		return ErrCreatorInvalid
	}
	return WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		for id, m := range c.Members {
			if id != uid && strings.EqualFold(m.Profile.Handle, p.Handle) {
				return ErrCreatorConflict
			}
		}
		for _, id := range pinned {
			if !slices.ContainsFunc(c.Works, func(w CreatorWork) bool { return w.ID == id && w.OwnerID == uid }) {
				return ErrCreatorInvalid
			}
		}
		m := c.Members[uid]
		// Older clients omit avatar; changing pins or text must preserve it.
		if p.Avatar == nil {
			p.Avatar = m.Profile.Avatar
		} else if m.Profile.Avatar == nil || *p.Avatar != *m.Profile.Avatar {
			value, err := NormalizeProfileAvatar(*p.Avatar)
			if err != nil {
				return ErrCreatorInvalid
			}
			p.Avatar = &value
		}
		m.Profile = p
		m.Pinned = pinned
		m.Saved = saved
		c.Members[uid] = m
		for i := range c.Works {
			if c.Works[i].OwnerID == uid {
				c.Works[i].Author = p.Name
			}
		}
		return nil
	})
}
func creatorFileOwned(c *CreatorCatalog, f *CreatorFile, uid int) bool {
	return f == nil || slices.ContainsFunc(c.Files, func(stored CreatorFile) bool {
		return stored.ID == f.ID && stored.OwnerID == uid && stored.Name == f.Name && stored.Size == f.Size
	})
}
func validCreatorWork(w CreatorWork) bool {
	if !creatorID.MatchString(w.ID) || !creatorText(w.Title, 100) || !creatorText(w.Summary, 220) || !creatorText(w.Description, 12000) || !creatorText(w.Tags, 400) || !creatorURL(w.URL) || !creatorImage(w.Cover) || len(w.Images) > 12 || len(w.Blocks) > 24 {
		return false
	}
	if !slices.Contains([]string{"website", "software", "design", "article", "workflow", "other"}, w.Category) || !slices.Contains([]string{"horizon", "notes", "palette", "flow", "guide", "orbit", "cloud", "prompt"}, w.Style) {
		return false
	}
	for _, s := range w.Images {
		if !creatorImage(s) {
			return false
		}
	}
	for _, b := range w.Blocks {
		if !creatorID.MatchString(b.ID) || !slices.Contains([]string{"heading", "text", "markdown", "gallery", "link", "code", "callout", "list", "divider"}, b.Type) || !creatorText(b.Title, 120) || !creatorText(b.Text, 12000) || !creatorURL(b.URL) {
			return false
		}
	}
	if s := w.Settings; s != nil {
		if !creatorAccent.MatchString(s.Accent) || !slices.Contains([]string{"story", "showcase", "compact"}, s.Layout) || !slices.Contains([]string{"wide", "standard", "square"}, s.CoverRatio) || len(s.Links) > 6 || len(s.Metadata) > 8 || !creatorText(s.ButtonLabel, 40) || !creatorText(s.CategoryName, 40) || !creatorText(s.Usage, 2000) {
			return false
		}
		for _, l := range s.Links {
			if !creatorText(l.Label, 80) || !creatorURL(l.URL) {
				return false
			}
		}
		for _, m := range s.Metadata {
			if !creatorText(m.Label, 80) || !creatorText(m.Value, 300) {
				return false
			}
		}
	}
	return (w.Status == "draft" || w.Status == "review") && (w.Status != "review" || (strings.TrimSpace(w.Title) != "" && utf8.RuneCountInString(w.Summary) >= 8))
}
func SaveCreatorWork(uid int, w CreatorWork) (CreatorWork, error) {
	if !validCreatorWork(w) {
		return w, ErrCreatorInvalid
	}
	encoded, err := common.Marshal(w)
	if err != nil || len(encoded) > 4*1024*1024 {
		return w, ErrCreatorInvalid
	}
	err = WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		if !creatorFileOwned(c, w.Attachment, uid) {
			return ErrCreatorForbidden
		}
		index := -1
		count := 0
		for i, old := range c.Works {
			if old.OwnerID == uid {
				count++
			}
			if old.ID == w.ID {
				if old.OwnerID != uid {
					return ErrCreatorForbidden
				}
				if w.Revision != old.Revision {
					return ErrCreatorConflict
				}
				index = i
			}
		}
		if index < 0 && count >= 100 {
			return ErrCreatorInvalid
		}
		w.OwnerID = uid
		w.Author = c.Members[uid].Profile.Name
		if w.Status == "review" && c.ReviewPolicy.AutoApproveWorks {
			w.Status = "published"
		}
		w.ReviewNote = ""
		w.Revision = common.GetUUID()
		w.UpdatedAt = time.Now().UnixMilli()
		if index < 0 {
			c.Works = append(c.Works, w)
		} else {
			c.Works[index] = w
		}
		return nil
	})
	return w, err
}
func DeleteCreatorWork(uid int, id, revision string) error {
	return WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		i := slices.IndexFunc(c.Works, func(w CreatorWork) bool { return w.ID == id && w.OwnerID == uid })
		if i < 0 {
			return os.ErrNotExist
		}
		if c.Works[i].Revision != revision {
			return ErrCreatorConflict
		}
		c.Works = append(c.Works[:i], c.Works[i+1:]...)
		c.Releases = slices.DeleteFunc(c.Releases, func(r CreatorRelease) bool { return r.ProjectID == id && r.OwnerID == uid })
		for k, m := range c.Members {
			m.Pinned = slices.DeleteFunc(m.Pinned, func(s string) bool { return s == id })
			m.Saved = slices.DeleteFunc(m.Saved, func(s string) bool { return s == id })
			c.Members[k] = m
		}
		return nil
	})
}
func SaveCreatorRelease(uid int, r CreatorRelease) (CreatorRelease, error) {
	if !creatorID.MatchString(r.ID) || !creatorText(r.Version, 40) || r.Version == "" || !creatorText(r.Notes, 4000) || utf8.RuneCountInString(r.Notes) < 8 || !creatorText(r.License, 120) || !creatorURL(r.DownloadURL) || !creatorURL(r.SourceURL) || !creatorURL(r.StoreURL) || (r.DownloadURL == "" && r.Package == nil) || !slices.Contains([]string{"Windows", "macOS", "Linux", "Android", "iOS", "Web"}, r.Platform) || !slices.Contains([]string{"original", "authorized", "open-source"}, r.Provenance) || (r.Status != "draft" && r.Status != "review") {
		return r, ErrCreatorInvalid
	}
	if r.Provenance == "open-source" && (r.License == "" || r.SourceURL == "") {
		return r, ErrCreatorInvalid
	}
	err := WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		if !slices.ContainsFunc(c.Works, func(w CreatorWork) bool { return w.ID == r.ProjectID && w.OwnerID == uid && w.Category == "software" }) || !creatorFileOwned(c, r.Package, uid) {
			return ErrCreatorForbidden
		}
		index := -1
		for i, old := range c.Releases {
			if old.ID == r.ID {
				if old.OwnerID != uid {
					return ErrCreatorForbidden
				}
				if old.Revision != r.Revision {
					return ErrCreatorConflict
				}
				index = i
			} else if old.ProjectID == r.ProjectID && old.Version == r.Version && old.Platform == r.Platform {
				return ErrCreatorConflict
			}
		}
		if index < 0 && len(c.Releases) >= 5000 {
			return ErrCreatorInvalid
		}
		r.OwnerID = uid
		r.Revision = common.GetUUID()
		r.ReviewNote = ""
		r.UpdatedAt = time.Now().UnixMilli()
		if index < 0 {
			c.Releases = append(c.Releases, r)
		} else {
			c.Releases[index] = r
		}
		return nil
	})
	return r, err
}

// Review never grants software-center administration to a creator. Approved
// releases are available from the approved project; platform curation stays separate.
func ReviewCreatorContent(kind, id, revision, decision, note string) error {
	if !slices.Contains([]string{"approve", "reject", "unpublish"}, decision) || !creatorText(note, 500) {
		return ErrCreatorInvalid
	}
	return WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		status := "draft"
		if decision == "approve" {
			status = "published"
		}
		if kind == "work" {
			for i, w := range c.Works {
				if w.ID != id {
					continue
				}
				if w.Revision != revision {
					return ErrCreatorConflict
				}
				if decision == "approve" && (w.Status != "review" || !CreatorActive(c, w.OwnerID)) {
					return ErrCreatorInvalid
				}
				w.Status = status
				w.ReviewNote = note
				w.Revision = common.GetUUID()
				w.UpdatedAt = time.Now().UnixMilli()
				c.Works[i] = w
				return nil
			}
		} else if kind == "release" {
			for i, r := range c.Releases {
				if r.ID != id {
					continue
				}
				if r.Revision != revision {
					return ErrCreatorConflict
				}
				if decision == "approve" && (r.Status != "review" || !slices.ContainsFunc(c.Works, func(w CreatorWork) bool { return w.ID == r.ProjectID && CreatorPublic(c, w) })) {
					return ErrCreatorInvalid
				}
				r.Status = status
				r.ReviewNote = note
				r.Revision = common.GetUUID()
				r.UpdatedAt = time.Now().UnixMilli()
				c.Releases[i] = r
				return nil
			}
		}
		return os.ErrNotExist
	})
}
func StoreCreatorFile(uid int, name string, reader io.Reader) (CreatorFile, error) {
	f := CreatorFile{ID: common.GetUUID(), Name: name, OwnerID: uid, CreatedAt: time.Now().Unix()}
	ext := strings.ToLower(filepath.Ext(name))
	if name == "" || name != filepath.Base(name) || strings.ContainsAny(name, "\\/\r\n\x00") || !creatorText(name, 120) || !slices.Contains([]string{".zip", ".7z", ".pdf", ".txt", ".json", ".md", ".csv", ".exe", ".msi", ".dmg", ".apk", ".deb", ".appimage"}, ext) {
		return f, ErrCreatorInvalid
	}
	err := WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		var own, total int64
		for _, file := range c.Files {
			total += file.Size
			if file.OwnerID == uid {
				own += file.Size
			}
		}
		free, err := softwareFreeDisk(CreatorDirectory())
		if err != nil {
			return err
		}
		if own >= 100*1024*1024 || total >= 1024*1024*1024 || free < 1024*1024*1024 {
			return ErrSoftwareStorageFull
		}
		path := filepath.Join(CreatorDirectory(), "files", f.ID)
		out, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return err
		}
		n, err := io.Copy(out, io.LimitReader(reader, CreatorUploadLimit+1))
		if err == nil {
			err = out.Sync()
		}
		closeErr := out.Close()
		if err != nil || closeErr != nil || n == 0 || n > CreatorUploadLimit || own+n > 100*1024*1024 || total+n > 1024*1024*1024 {
			_ = os.Remove(path)
			return ErrSoftwareStorageFull
		}
		f.Size = n
		c.Files = append(c.Files, f)
		return nil
	})
	if err != nil {
		_ = os.Remove(filepath.Join(CreatorDirectory(), "files", f.ID))
	}
	return f, err
}
func DeleteCreatorFile(uid int, id string) error {
	err := WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		i := slices.IndexFunc(c.Files, func(f CreatorFile) bool { return f.ID == id && f.OwnerID == uid })
		if i < 0 {
			return os.ErrNotExist
		}
		for _, w := range c.Works {
			if w.Attachment != nil && w.Attachment.ID == id {
				return ErrCreatorConflict
			}
		}
		for _, r := range c.Releases {
			if r.Package != nil && r.Package.ID == id {
				return ErrCreatorConflict
			}
		}
		// Remove the reference first; a failed filesystem cleanup is recoverable garbage.
		c.Files = append(c.Files[:i], c.Files[i+1:]...)
		return nil
	})
	if err != nil {
		return err
	}
	return os.Remove(CreatorFilePath(id))
}
func CreatorFilePath(id string) string { return filepath.Join(CreatorDirectory(), "files", id) }
func CreatorFileURL(id string) string  { return fmt.Sprintf("/api/creators/files/%s", id) }
