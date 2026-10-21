package service

import (
	"crypto/sha256"
	"fmt"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type CreatorHomeWorkSelection struct {
	WorkID   string `json:"workId"`
	Enabled  bool   `json:"enabled"`
	Position int    `json:"position"`
}

type CreatorHomeShowcase struct {
	Revision     string                     `json:"revision"`
	AutoAddWorks bool                       `json:"autoAddWorks"`
	Works        []CreatorHomeWorkSelection `json:"works"`
}

// Only public, listed works from active creators are exposed. Saved choices
// for temporarily private works remain stored, so republishing does not reset them.
func CreatorHomeShowcaseConfig(c *CreatorCatalog) CreatorHomeShowcase {
	result := CreatorHomeShowcase{Revision: "initial", AutoAddWorks: true, Works: []CreatorHomeWorkSelection{}}
	saved := map[string]CreatorHomeWorkSelection{}
	nextPosition := 0
	if c.HomeShowcase != nil {
		result.Revision, result.AutoAddWorks = c.HomeShowcase.Revision, c.HomeShowcase.AutoAddWorks
		for _, item := range c.HomeShowcase.Works {
			saved[item.WorkID] = item
			if item.Position >= nextPosition {
				nextPosition = item.Position + 1
			}
		}
	}
	ids := []string{}
	for _, w := range CreatorShowcaseWorks(c) {
		item, ok := saved[w.ID]
		if !ok {
			item = CreatorHomeWorkSelection{WorkID: w.ID, Enabled: result.AutoAddWorks, Position: nextPosition}
			nextPosition++
		}
		result.Works = append(result.Works, item)
		ids = append(ids, w.ID)
	}
	slices.Sort(ids)
	// Eligibility changes invalidate stale editors as well as simultaneous saves.
	result.Revision = fmt.Sprintf("%x", sha256.Sum256([]byte(result.Revision+"\n"+strings.Join(ids, "\n"))))
	slices.SortStableFunc(result.Works, func(a, b CreatorHomeWorkSelection) int { return a.Position - b.Position })
	return result
}

func SaveCreatorHomeShowcase(next CreatorHomeShowcase) error {
	if len(next.Works) > 2000 {
		return model.ErrCreatorHomeInvalid
	}
	return WithCreatorCatalog(true, func(c *CreatorCatalog) error {
		current := CreatorHomeShowcaseConfig(c)
		if current.Revision != next.Revision {
			return model.ErrCreatorHomeConflict
		}
		eligible := map[string]bool{}
		for _, item := range current.Works {
			eligible[item.WorkID] = true
		}
		seen := map[string]bool{}
		for _, item := range next.Works {
			if !eligible[item.WorkID] || seen[item.WorkID] || item.Position < 0 || item.Position > 100000 {
				return model.ErrCreatorHomeInvalid
			}
			seen[item.WorkID] = true
		}
		if len(seen) != len(eligible) {
			return model.ErrCreatorHomeConflict
		}
		items := append([]CreatorHomeWorkSelection{}, next.Works...)
		if c.HomeShowcase != nil {
			for _, item := range c.HomeShowcase.Works {
				if !eligible[item.WorkID] {
					items = append(items, item)
				}
			}
		}
		next.Revision, next.Works = common.GetUUID(), items
		c.HomeShowcase = &next
		return nil
	})
}

func homeWorkEnabled(selection CreatorHomeShowcase, id string) bool {
	return slices.ContainsFunc(selection.Works, func(item CreatorHomeWorkSelection) bool { return item.WorkID == id && item.Enabled })
}
