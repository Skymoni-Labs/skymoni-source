package service

import (
	"slices"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreatorDailyRecommendationsShareServerDayAndFilterVisibility(t *testing.T) {
	c := &CreatorCatalog{Members: map[int]CreatorMember{
		1: {UserID: 1, AcceptedAt: 1},
		2: {UserID: 2, AcceptedAt: 1, Suspended: true},
	}}
	for _, id := range []string{"alpha", "beta", "gamma", "delta", "epsilon", "zeta"} {
		c.Works = append(c.Works, CreatorWork{ID: id, OwnerID: 1, Status: "published"})
	}
	c.Works = append(c.Works,
		CreatorWork{ID: "draft", OwnerID: 1, Status: "draft"},
		CreatorWork{ID: "review", OwnerID: 1, Status: "review"},
		CreatorWork{ID: "unlisted", OwnerID: 1, Status: "published", Settings: &CreatorSettings{Listed: false}},
		CreatorWork{ID: "suspended", OwnerID: 2, Status: "published"})
	config := CreatorShowcase{Enabled: true, DailyRandom: true, SpotlightIDs: [3]string{"alpha", "beta", "gamma"}}
	before := time.Date(2026, 10, 12, 15, 59, 59, 0, time.UTC)
	first := creatorPublicShowcaseAt(c, config, before)
	assert.Equal(t, "2026-10-12", first.RotationDate)
	assert.Equal(t, first, creatorPublicShowcaseAt(c, config, before.Add(-12*time.Hour)))
	slices.Reverse(c.Works)
	assert.Equal(t, first.SpotlightIDs, creatorPublicShowcaseAt(c, config, before).SpotlightIDs)
	after := creatorPublicShowcaseAt(c, config, before.Add(time.Second))
	assert.Equal(t, "2026-10-13", after.RotationDate)
	assert.NotEqual(t, first.SpotlightIDs, after.SpotlightIDs)
	seen := map[string]bool{}
	for _, id := range first.SpotlightIDs {
		require.NotEmpty(t, id)
		assert.Contains(t, []string{"alpha", "beta", "gamma", "delta", "epsilon", "zeta"}, id)
		assert.False(t, seen[id], "a recommendation must not repeat")
		seen[id] = true
	}
	assert.Equal(t, [3]string{"alpha", "beta", "gamma"}, config.SpotlightIDs, "manual placements survive daily rotation")
	for _, count := range []int{0, 1, 2} {
		c.Works = []CreatorWork{{ID: "only", OwnerID: 1, Status: "published"}, {ID: "second", OwnerID: 1, Status: "published"}}[:count]
		result := creatorPublicShowcaseAt(c, config, before)
		assert.Len(t, result.OrderedIDs, count)
		for i := count; i < 3; i++ {
			assert.Empty(t, result.SpotlightIDs[i], "never insert sample or duplicate fillers")
		}
	}
}
