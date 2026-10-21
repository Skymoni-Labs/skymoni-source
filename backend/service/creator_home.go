package service

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	_ "golang.org/x/image/webp"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrCreatorHomeStorage = errors.New("存储空间不足，暂时无法保存图片，请稍后重试")

func checkCreatorHomeStorage() error {
	free, err := softwareFreeDisk(CreatorDirectory())
	if err != nil {
		return err
	}
	if free < 1024*1024*1024 {
		return ErrCreatorHomeStorage
	}
	return nil
}

type HomeCreator struct {
	UserID   int    `json:"userId"`
	Name     string `json:"name"`
	Avatar   string `json:"avatar"`
	Visible  bool   `json:"visible"`
	Position int    `json:"position"`
}
type CreatorHomeState struct {
	Showcase CreatorHomeShowcase      `json:"showcase"`
	Config   model.CreatorHomeConfig  `json:"config"`
	Cards    []model.CreatorHomeCard  `json:"cards"`
	Orders   []model.CreatorHomeOrder `json:"orders"`
	Authors  []HomeCreator            `json:"authors"`
	Works    []CreatorWork            `json:"works"`
	Balance  float64                  `json:"balance"`
	Examples []CreatorHomeExample     `json:"examples"`
}

// Editorial examples are configuration only: never create fake creators,
// moderation submissions or paid entitlements for them.
type CreatorHomeExample struct {
	ID       string `json:"id"`
	Hidden   bool   `json:"hidden"`
	Position int    `json:"position"`
	Revision string `json:"revision"`
}

func homeExamples(c *CreatorCatalog) []CreatorHomeExample {
	ids := []string{"horizon", "notes", "soft-ui", "paper-flow", "first-api", "orbit", "clouds", "prompt-lab"}
	items := make([]CreatorHomeExample, 0, len(ids))
	for i, id := range ids {
		item := CreatorHomeExample{ID: id, Position: i, Revision: "initial"}
		for _, saved := range c.HomeExamples {
			if saved.ID == id {
				item = saved
				break
			}
		}
		items = append(items, item)
	}
	slices.SortStableFunc(items, func(a, b CreatorHomeExample) int { return a.Position - b.Position })
	return items
}

func SaveCreatorHomeExample(id, revision string, hidden bool, position int) error {
	if position < 0 || position > 100000 {
		return model.ErrCreatorHomeInvalid
	}
	return WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		items := homeExamples(c)
		index := slices.IndexFunc(items, func(item CreatorHomeExample) bool { return item.ID == id })
		if index < 0 {
			return model.ErrCreatorHomeInvalid
		}
		if items[index].Revision != revision {
			return model.ErrCreatorHomeConflict
		}
		items[index].Hidden, items[index].Position, items[index].Revision = hidden, position, common.GetUUID()
		c.HomeExamples = items
		return nil
	})
}

type FeaturedCreatorWork struct {
	CreatorWork
	HomePoster string `json:"homePoster"`
}

func homeWorkSummary(w CreatorWork, c *CreatorCatalog) CreatorWork {
	// Artwork and full project content are loaded from their own endpoints.
	// Home curation should not duplicate every project's embedded image gallery.
	w.Description, w.Cover = "", ""
	w.Images, w.Blocks, w.Attachment = nil, nil, nil
	w.Author = c.Members[w.OwnerID].Profile.Name
	return w
}

// Uploaded artwork must be stable bytes, not a remote URL that can change after
// moderation. Decode actual headers; neither MIME labels nor client dimensions
// establish the aspect ratio. Limits keep two revisions under 800 KB per work.
func ValidCreatorHomeImage(value string, avatar bool) bool {
	limit := 400000
	if avatar {
		limit = 100000
	}
	if len(value) > limit {
		return false
	}
	var format string
	for _, kind := range []string{"png", "jpeg", "webp"} {
		if strings.HasPrefix(value, "data:image/"+kind+";base64,") {
			format = kind
			break
		}
	}
	if format == "" {
		return false
	}
	raw, err := base64.StdEncoding.DecodeString(strings.SplitN(value, ",", 2)[1])
	if err != nil {
		return false
	}
	cfg, actual, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || actual != format {
		return false
	}
	if avatar {
		return cfg.Width == cfg.Height && cfg.Width >= 64 && cfg.Width <= 512
	}
	return cfg.Width*4 == cfg.Height*3 && cfg.Width >= 450 && cfg.Height >= 600 && cfg.Width <= 1800 && cfg.Height <= 2400
}

func ensureHomeAuthors(c *CreatorCatalog, config model.CreatorHomeConfig) error {
	for id, member := range c.Members {
		if member.AcceptedAt == 0 {
			continue
		}
		a := model.CreatorHomeAuthor{UserID: id, Visible: config.AutoAddCreators}
		if err := model.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&a).Error; err != nil {
			return err
		}
	}
	return nil
}
func CreatorHomeSnapshot(uid int, admin bool) (CreatorHomeState, error) {
	out := CreatorHomeState{Cards: []model.CreatorHomeCard{}, Orders: []model.CreatorHomeOrder{}, Authors: []HomeCreator{}, Works: []CreatorWork{}}
	err := WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		if !admin && !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		cfg, err := model.GetCreatorHomeConfig(model.DB)
		if err != nil {
			return err
		}
		out.Config = cfg
		out.Examples = homeExamples(c)
		out.Showcase = CreatorHomeShowcaseConfig(c)
		if err = ensureHomeAuthors(c, cfg); err != nil {
			return err
		}
		cards, orders := model.DB, model.DB
		if !admin {
			cards = cards.Where("owner_id = ?", uid)
			orders = orders.Where("user_id = ?", uid)
		}
		if err = cards.Order("position asc, work_id asc").Find(&out.Cards).Error; err != nil {
			return err
		}
		if err = orders.Order("id desc").Limit(100).Find(&out.Orders).Error; err != nil {
			return err
		}
		var authors []model.CreatorHomeAuthor
		if err = model.DB.Order("position asc, user_id asc").Find(&authors).Error; err != nil {
			return err
		}
		for _, a := range authors {
			if m, ok := c.Members[a.UserID]; ok && CreatorActive(c, a.UserID) && (admin || a.UserID == uid) {
				out.Authors = append(out.Authors, HomeCreator{UserID: a.UserID, Name: m.Profile.Name, Avatar: homeCreatorAvatar(m.Profile, a.Avatar), Visible: a.Visible, Position: a.Position})
			}
		}
		for _, w := range c.Works {
			if admin || w.OwnerID == uid {
				out.Works = append(out.Works, homeWorkSummary(w, c))
			}
		}
		if !admin {
			quota, e := model.GetUserQuota(uid, true)
			if e != nil {
				return e
			}
			out.Balance = float64(quota) / common.QuotaPerUnit
		}
		return nil
	})
	return out, err
}

func PublicCreatorHome() (any, error) {
	return publicCreatorHome(false)
}

// The homepage can receive its card fallback in the same request as its configuration.
// The legacy home response retains the separately reviewed placement list.
func PublicCreatorHomepage() (any, error) {
	return publicCreatorHome(true)
}

func publicCreatorHome(includeCatalogue bool) (any, error) {
	works := []FeaturedCreatorWork{}
	source := "applications"
	authors := []HomeCreator{}
	var cfg model.CreatorHomeConfig
	var examples []CreatorHomeExample
	var showcase CreatorHomeShowcase
	err := WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		examples = homeExamples(c)
		showcase = CreatorHomeShowcaseConfig(c)
		var err error
		cfg, err = model.GetCreatorHomeConfig(model.DB)
		if err != nil {
			return err
		}
		if err = ensureHomeAuthors(c, cfg); err != nil {
			return err
		}
		if cfg.GalleryEnabled {
			var cards []model.CreatorHomeCard
			if err = model.DB.Where("hidden = ? AND owner_paused = ? AND (permanent = ? OR expires_at > ?)", false, false, true, time.Now().Unix()).Order("position asc, work_id asc").Find(&cards).Error; err != nil {
				return err
			}
			for _, card := range cards {
				if card.ApprovedImage == "" {
					continue
				}
				for _, w := range c.Works {
					if w.ID == card.WorkID && w.OwnerID == card.OwnerID && CreatorPublic(c, w) && homeWorkEnabled(showcase, w.ID) {
						w.Revision, w.ReviewNote = "", ""
						w.Author = c.Members[w.OwnerID].Profile.Name
						works = append(works, FeaturedCreatorWork{homeWorkSummary(w, c), "/api/creators/home/posters/" + card.WorkID + "?v=" + card.Revision})
						break
					}
				}
			}
		}
		if includeCatalogue && cfg.GalleryEnabled && len(works) == 0 {
			source = "creator-center"
			for _, w := range c.Works {
				if CreatorPublic(c, w) && homeWorkEnabled(showcase, w.ID) {
					works = append(works, FeaturedCreatorWork{CreatorCard(CreatorWorkIdentity(c, w)), ""})
				}
			}
		}
		if cfg.MarqueeEnabled {
			var entries []model.CreatorHomeAuthor
			if err = model.DB.Where("visible = ?", true).Order("position asc, user_id asc").Find(&entries).Error; err != nil {
				return err
			}
			for _, a := range entries {
				if m, ok := c.Members[a.UserID]; ok && CreatorActive(c, a.UserID) {
					authors = append(authors, HomeCreator{UserID: a.UserID, Name: m.Profile.Name, Avatar: homeCreatorAvatar(m.Profile, a.Avatar)})
				}
			}
		}
		return nil
	})
	data := map[string]any{"config": cfg, "works": works, "authors": authors, "examples": examples, "showcase": showcase}
	if includeCatalogue {
		data["source"] = source
	}
	return data, err
}

func SubmitCreatorHomeCard(uid int, id, image, revision string) error {
	if !ValidCreatorHomeImage(image, false) {
		return model.ErrCreatorHomeInvalid
	}
	return WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		if err := checkCreatorHomeStorage(); err != nil {
			return err
		}
		if !slices.ContainsFunc(c.Works, func(w CreatorWork) bool { return w.ID == id && w.OwnerID == uid && CreatorPublic(c, w) }) {
			return model.ErrCreatorHomeInvalid
		}
		return model.DB.Transaction(func(tx *gorm.DB) error {
			var card model.CreatorHomeCard
			if err := tx.Where("work_id = ?", id).Limit(1).Find(&card).Error; err != nil {
				return err
			}
			if card.WorkID != "" && (card.OwnerID != uid || card.Revision != revision) {
				return model.ErrCreatorHomeConflict
			}
			if card.WorkID == "" && revision != "" {
				return model.ErrCreatorHomeConflict
			}
			card.WorkID, card.OwnerID, card.Image, card.Status, card.Note = id, uid, image, "review", ""
			card.Revision, card.UpdatedAt = common.GetUUID(), time.Now().Unix()
			return tx.Save(&card).Error
		})
	})
}

// Owner pause is independent of moderation and purchased entitlement. Never
// change the admin flag, approved artwork, wallet, orders or expiration here.
func SetCreatorHomePaused(uid int, id, revision string, paused bool) error {
	return WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		index := slices.IndexFunc(c.Works, func(w CreatorWork) bool { return w.ID == id && w.OwnerID == uid })
		if index < 0 {
			return model.ErrCreatorHomeInvalid
		}
		return model.DB.Transaction(func(tx *gorm.DB) error {
			var card model.CreatorHomeCard
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&card, "work_id = ? AND owner_id = ?", id, uid).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return model.ErrCreatorHomeInvalid
				}
				return err
			}
			if card.Revision != revision {
				return model.ErrCreatorHomeConflict
			}
			if card.ApprovedImage == "" || (!card.Permanent && card.ExpiresAt == 0) {
				return model.ErrCreatorHomeInvalid
			}
			if !paused && (card.Hidden || (!card.Permanent && card.ExpiresAt <= time.Now().Unix()) || !CreatorPublic(c, c.Works[index])) {
				return model.ErrCreatorHomeInvalid
			}
			card.OwnerPaused = paused
			card.Revision, card.UpdatedAt = common.GetUUID(), time.Now().Unix()
			return tx.Save(&card).Error
		})
	})
}
func BuyCreatorHome(uid int, id, plan, checkout, revision string) (model.CreatorHomeOrder, error) {
	var out model.CreatorHomeOrder
	err := WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		if !slices.ContainsFunc(c.Works, func(w CreatorWork) bool { return w.ID == id && w.OwnerID == uid && CreatorPublic(c, w) }) {
			return model.ErrCreatorHomeInvalid
		}
		var err error
		out, err = model.PurchaseCreatorHome(uid, id, plan, checkout, revision)
		return err
	})
	return out, err
}
func ReviewCreatorHome(id, revision, decision, note string, hidden bool, position int) error {
	if !slices.Contains([]string{"approve", "reject", "display"}, decision) || !creatorText(note, 500) || position < 0 || position > 100000 {
		return model.ErrCreatorHomeInvalid
	}
	return WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		return model.DB.Transaction(func(tx *gorm.DB) error {
			var card model.CreatorHomeCard
			if err := tx.First(&card, "work_id = ?", id).Error; err != nil {
				return os.ErrNotExist
			}
			if card.Revision != revision {
				return model.ErrCreatorHomeConflict
			}
			if decision != "display" {
				if card.Status != "review" {
					return model.ErrCreatorHomeInvalid
				}
				card.Status, card.Note = "rejected", note
				if decision == "approve" {
					if !slices.ContainsFunc(c.Works, func(w CreatorWork) bool { return w.ID == id && w.OwnerID == card.OwnerID && CreatorPublic(c, w) }) {
						return model.ErrCreatorHomeInvalid
					}
					card.Status, card.ApprovedImage = "approved", card.Image
				}
			}
			card.Hidden, card.Position = hidden, position
			card.Revision, card.UpdatedAt = common.GetUUID(), time.Now().Unix()
			return tx.Save(&card).Error
		})
	})
}
func SaveCreatorHomeConfig(cfg model.CreatorHomeConfig) error {
	return WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		old, err := model.GetCreatorHomeConfig(model.DB)
		if err != nil {
			return err
		}
		if old.Revision != cfg.Revision {
			return model.ErrCreatorHomeConflict
		}
		if err = ensureHomeAuthors(c, old); err != nil {
			return err
		}
		cfg.ID, cfg.Revision = 1, common.GetUUID()
		result := model.DB.Model(&model.CreatorHomeConfig{}).Where("id = ? AND revision = ?", 1, old.Revision).Updates(map[string]any{"gallery_enabled": cfg.GalleryEnabled, "marquee_enabled": cfg.MarqueeEnabled, "auto_add_creators": cfg.AutoAddCreators, "revision": cfg.Revision})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return model.ErrCreatorHomeConflict
		}
		return nil
	})
}
func SaveCreatorHomeAuthor(uid int, value model.CreatorHomeAuthor, admin bool) error {
	if value.Avatar != "" && !ValidCreatorHomeImage(value.Avatar, true) {
		return model.ErrCreatorHomeInvalid
	}
	if value.Position < 0 || value.Position > 100000 {
		return model.ErrCreatorHomeInvalid
	}
	return WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		if !CreatorActive(c, uid) {
			return ErrCreatorForbidden
		}
		if value.Avatar != "" {
			if err := checkCreatorHomeStorage(); err != nil {
				return err
			}
		}
		cfg, err := model.GetCreatorHomeConfig(model.DB)
		if err != nil {
			return err
		}
		if err = ensureHomeAuthors(c, cfg); err != nil {
			return err
		}
		updates := map[string]any{"avatar": value.Avatar}
		if admin {
			updates["visible"], updates["position"] = value.Visible, value.Position
		}
		return model.DB.Model(&model.CreatorHomeAuthor{}).Where("user_id = ?", uid).Updates(updates).Error
	})
}

func CreatorHomePoster(id string) (string, error) {
	var value string
	err := WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		cfg, err := model.GetCreatorHomeConfig(model.DB)
		if err != nil {
			return err
		}
		if !cfg.GalleryEnabled {
			return os.ErrNotExist
		}
		var card model.CreatorHomeCard
		if err = model.DB.Where("work_id = ? AND hidden = ? AND owner_paused = ? AND (permanent = ? OR expires_at > ?)", id, false, false, true, time.Now().Unix()).First(&card).Error; err != nil {
			return os.ErrNotExist
		}
		if card.ApprovedImage == "" || !slices.ContainsFunc(c.Works, func(w CreatorWork) bool { return w.ID == id && w.OwnerID == card.OwnerID && CreatorPublic(c, w) }) {
			return os.ErrNotExist
		}
		value = card.ApprovedImage
		return nil
	})
	return value, err
}

// Homepage curation may override an avatar; otherwise use the creator's saved
// profile picture so new creators are displayed consistently across pages.
func homeCreatorAvatar(profile CreatorProfile, override string) string {
	if override != "" {
		return override
	}
	if profile.Avatar != nil {
		return *profile.Avatar
	}
	return ""
}
