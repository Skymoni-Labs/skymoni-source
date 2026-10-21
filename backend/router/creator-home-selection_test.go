package router

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/require"
)

func TestCreatorHomeWorkSelectionPersistsAndProtectsEntitlements(t *testing.T) {
	e, db := setupCreatorHome(t, t.TempDir())
	// An existing paid card remains an entitlement even when its display is disabled.
	card := model.CreatorHomeCard{WorkID: "home-demo-website", OwnerID: 92001, ApprovedImage: homeImage(450, 600), Status: "approved", Permanent: true, Revision: "paid-initial"}
	require.NoError(t, db.Create(&card).Error)
	state, err := service.CreatorHomeSnapshot(0, true)
	require.NoError(t, err)
	require.Len(t, state.Showcase.Works, 2)
	next := state.Showcase
	next.AutoAddWorks = false
	for i := range next.Works {
		next.Works[i].Enabled = next.Works[i].WorkID == "home-demo-tool"
		next.Works[i].Position = 9 - i
	}
	require.Equal(t, 401, homeRequest(t, e, "PUT", "/admin/home/showcase", "", next).Code)
	require.Equal(t, 403, homeRequest(t, e, "PUT", "/admin/home/showcase", homeTestCreator, next).Code)
	require.Equal(t, 200, homeRequest(t, e, "PUT", "/admin/home/showcase", homeTestAdmin, next).Code)
	require.Equal(t, 409, homeRequest(t, e, "PUT", "/admin/home/showcase", homeTestAdmin, next).Code)
	state, err = service.CreatorHomeSnapshot(0, true)
	require.NoError(t, err)
	require.False(t, state.Showcase.AutoAddWorks)
	require.NotEqual(t, next.Revision, state.Showcase.Revision)
	require.NoError(t, service.WithCreatorCatalog(false, func(c *service.CreatorCatalog) error {
		require.NotNil(t, c.HomeShowcase)
		require.False(t, c.HomeShowcase.AutoAddWorks)
		return nil
	}))
	var after model.CreatorHomeCard
	require.NoError(t, db.First(&after, "work_id = ?", card.WorkID).Error)
	require.Equal(t, card, after)
	require.Empty(t, state.Orders)
	public := homeRequest(t, e, "GET", "/home", "", nil)
	require.Equal(t, 200, public.Code)
	var response struct {
		Data struct {
			Works    []service.FeaturedCreatorWork `json:"works"`
			Showcase service.CreatorHomeShowcase   `json:"showcase"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(public.Body.Bytes(), &response))
	require.Empty(t, response.Data.Works)
	// Invalid edits do not overwrite the last saved selections.
	bad := state.Showcase
	bad.Works = append([]service.CreatorHomeWorkSelection{}, bad.Works...)
	bad.Works[0].WorkID = "non-public-work"
	require.Equal(t, 400, homeRequest(t, e, "PUT", "/admin/home/showcase", homeTestAdmin, bad).Code)
	bad = state.Showcase
	bad.Works = bad.Works[:1]
	require.Equal(t, 409, homeRequest(t, e, "PUT", "/admin/home/showcase", homeTestAdmin, bad).Code)
	// A new published work is disabled when automatic addition is off, and changes the editor revision.
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		c.Works = append(c.Works, service.CreatorWork{ID: "new-public-work", OwnerID: 92001, Title: "New", Status: "published"}, service.CreatorWork{ID: "private-work", OwnerID: 92001, Title: "Secret", Status: "draft"})
		return nil
	}))
	require.Equal(t, 409, homeRequest(t, e, "PUT", "/admin/home/showcase", homeTestAdmin, state.Showcase).Code)
	fresh, err := service.CreatorHomeSnapshot(0, true)
	require.NoError(t, err)
	require.Len(t, fresh.Showcase.Works, 3)
	for _, item := range fresh.Showcase.Works {
		if item.WorkID == "new-public-work" {
			require.False(t, item.Enabled)
		}
	}
	require.NotContains(t, homeRequest(t, e, "GET", "/home", "", nil).Body.String(), "private-work")
	// All-off is a real saved state. Republish a hidden work without resetting its choice.
	for i := range fresh.Showcase.Works {
		fresh.Showcase.Works[i].Enabled = false
	}
	require.Equal(t, 200, homeRequest(t, e, "PUT", "/admin/home/showcase", homeTestAdmin, fresh.Showcase).Code)
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error { c.Works[0].Status = "draft"; return nil }))
	hidden, err := service.CreatorHomeSnapshot(0, true)
	require.NoError(t, err)
	require.Len(t, hidden.Showcase.Works, 2)
	require.Equal(t, 200, homeRequest(t, e, "PUT", "/admin/home/showcase", homeTestAdmin, hidden.Showcase).Code)
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error { c.Works[0].Status = "published"; return nil }))
	restored, err := service.CreatorHomeSnapshot(0, true)
	require.NoError(t, err)
	for _, item := range restored.Showcase.Works {
		require.False(t, item.Enabled)
	}
}
