package service

import (
	"bytes"
	"crypto/sha256"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// Showcase placement is independent of paid homepage entitlements and reviews.
type CreatorShowcase struct {
	Enabled      bool      `json:"enabled"`
	DailyRandom  bool      `json:"dailyRandom"`
	RotationDate string    `json:"rotationDate,omitempty"`
	SpotlightIDs [3]string `json:"spotlightIds"`
	OrderedIDs   []string  `json:"orderedIds"`
	Revision     string    `json:"revision,omitempty"`
}

func CreatorShowcaseConfig(c *CreatorCatalog) CreatorShowcase {
	if c.Showcase == nil {
		return CreatorShowcase{Enabled: true, OrderedIDs: []string{}, Revision: "initial"}
	}
	config := *c.Showcase
	config.OrderedIDs = append([]string{}, config.OrderedIDs...)
	return config
}

func CreatorShowcaseWorks(c *CreatorCatalog) []CreatorWork {
	available := map[string]CreatorWork{}
	for _, w := range c.Works {
		if CreatorPublic(c, w) {
			w = CreatorWorkIdentity(c, w)
			w.Revision, w.ReviewNote = "", ""
			available[w.ID] = w
		}
	}
	works := []CreatorWork{}
	for _, id := range CreatorShowcaseConfig(c).OrderedIDs {
		if w, ok := available[id]; ok {
			works = append(works, w)
			delete(available, id)
		}
	}
	for _, w := range c.Works {
		if public, ok := available[w.ID]; ok {
			works = append(works, public)
			delete(available, w.ID)
		}
	}
	return works
}

// Reserve explicit selections before auto-filling empty slots, avoiding repeats.
// Unpublished, unlisted and suspended works disappear without leaking their IDs.
func CreatorPublicShowcase(c *CreatorCatalog) CreatorShowcase {
	config := CreatorShowcaseConfig(c)
	return creatorPublicShowcaseAt(c, config, time.Now())
}

// The preview and public gallery use the same server date and eligible works.
func CreatorDailyShowcase(c *CreatorCatalog) CreatorShowcase {
	config := CreatorShowcaseConfig(c)
	config.DailyRandom = true
	return creatorPublicShowcaseAt(c, config, time.Now())
}

func creatorPublicShowcaseAt(c *CreatorCatalog, config CreatorShowcase, now time.Time) CreatorShowcase {
	works := CreatorShowcaseWorks(c)
	result := CreatorShowcase{Enabled: config.Enabled, DailyRandom: config.DailyRandom, OrderedIDs: []string{}}
	for _, w := range works {
		result.OrderedIDs = append(result.OrderedIDs, w.ID)
	}
	if config.DailyRandom {
		// A daily hash ranking gives all visitors the same selection, regardless
		// of local clock, catalog order or server restarts. No catalog writes or
		// background worker are needed at midnight; removed works stop appearing
		// immediately. Only the already-public works above enter this pool.
		result.RotationDate = now.In(time.FixedZone("Asia/Shanghai", 8*60*60)).Format("2006-01-02")
		scores := make(map[string][32]byte, len(works))
		for _, w := range works {
			scores[w.ID] = sha256.Sum256([]byte(result.RotationDate + "\x00" + w.ID))
		}
		slices.SortFunc(works, func(a, b CreatorWork) int {
			left, right := scores[a.ID], scores[b.ID]
			return bytes.Compare(left[:], right[:])
		})
		for i, w := range works[:min(3, len(works))] {
			result.SpotlightIDs[i] = w.ID
		}
		return result
	}
	available := map[string]bool{}
	for _, w := range works {
		available[w.ID] = true
	}
	reserved := map[string]bool{}
	for i, id := range config.SpotlightIDs {
		if available[id] && !reserved[id] {
			result.SpotlightIDs[i] = id
			reserved[id] = true
		}
	}
	for i, id := range result.SpotlightIDs {
		if id != "" {
			continue
		}
		for _, w := range works {
			if !reserved[w.ID] {
				result.SpotlightIDs[i] = w.ID
				reserved[w.ID] = true
				break
			}
		}
	}
	if result.SpotlightIDs[0] == "" {
		for i := 1; i < len(result.SpotlightIDs); i++ {
			if result.SpotlightIDs[i] != "" {
				result.SpotlightIDs[0], result.SpotlightIDs[i] = result.SpotlightIDs[i], ""
				break
			}
		}
	}
	return result
}

func SaveCreatorShowcase(next CreatorShowcase) error {
	if len(next.OrderedIDs) > 2000 || next.Revision == "" {
		return ErrCreatorInvalid
	}
	return WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		if next.Revision != CreatorShowcaseConfig(c).Revision {
			return ErrCreatorConflict
		}
		available := map[string]bool{}
		for _, w := range c.Works {
			if CreatorPublic(c, w) {
				available[w.ID] = true
			}
		}
		for group, ids := range [][]string{next.SpotlightIDs[:], next.OrderedIDs} {
			seen := map[string]bool{}
			for _, id := range ids {
				if id == "" && group == 0 {
					continue
				}
				if !available[id] || seen[id] {
					return ErrCreatorInvalid
				}
				seen[id] = true
			}
		}
		next.OrderedIDs = append([]string{}, next.OrderedIDs...)
		next.RotationDate = ""
		next.Revision = common.GetUUID()
		c.Showcase = &next
		return nil
	})
}
