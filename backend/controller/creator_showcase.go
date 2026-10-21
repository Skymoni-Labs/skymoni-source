package controller

import (
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func AdminCreatorShowcase(c *gin.Context) {
	err := service.WithCreatorCatalog(false, func(data *service.CreatorCatalog) error {
		works := []service.CreatorWork{}
		for _, work := range data.Works {
			if service.CreatorPublic(data, work) {
				work = service.CreatorWorkIdentity(data, work)
				work.Revision, work.ReviewNote = "", ""
				works = append(works, work)
			}
		}
		c.JSON(200, gin.H{"success": true, "data": gin.H{
			"config":       service.CreatorShowcaseConfig(data),
			"dailyPreview": service.CreatorDailyShowcase(data),
			"works":        works,
		}})
		return nil
	})
	if err != nil {
		creatorError(c, err)
	}
}

func AdminCreatorSaveShowcase(c *gin.Context) {
	var body struct {
		Enabled      *bool     `json:"enabled"`
		DailyRandom  *bool     `json:"dailyRandom"`
		SpotlightIDs []string  `json:"spotlightIds"`
		OrderedIDs   *[]string `json:"orderedIds"`
		Revision     string    `json:"revision"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if body.Enabled == nil || body.OrderedIDs == nil || len(body.SpotlightIDs) != 3 {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	next := service.CreatorShowcase{Enabled: *body.Enabled, OrderedIDs: *body.OrderedIDs, Revision: body.Revision}
	if body.DailyRandom != nil {
		next.DailyRandom = *body.DailyRandom
	} else if err := service.WithCreatorCatalog(false, func(data *service.CreatorCatalog) error {
		next.DailyRandom = service.CreatorShowcaseConfig(data).DailyRandom
		return nil
	}); err != nil {
		creatorError(c, err)
		return
	}
	copy(next.SpotlightIDs[:], body.SpotlightIDs)
	if err := service.SaveCreatorShowcase(next); err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.showcase", map[string]any{"enabled": next.Enabled, "dailyRandom": next.DailyRandom, "spotlightIds": next.SpotlightIDs, "orderedCount": len(next.OrderedIDs)})
	AdminCreatorShowcase(c)
}
