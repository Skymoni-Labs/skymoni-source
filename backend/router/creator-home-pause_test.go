package router

import (
	"bytes"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreatorHomeOwnerPauseAndResume(t *testing.T) {
	e, db := setupCreatorHome(t, t.TempDir())
	id := "home-demo-website"
	poster := homeImage(450, 600)
	require.Equal(t, 200, homeRequest(t, e, "PUT", "/me/home/cards/"+id, homeTestCreator, map[string]any{"image": poster}).Code)
	card := func() model.CreatorHomeCard {
		var value model.CreatorHomeCard
		require.NoError(t, db.First(&value, "work_id = ?", id).Error)
		return value
	}
	set := func(paused bool, revision, token string) int {
		return homeRequest(t, e, "PUT", "/me/home/cards/"+id+"/display", token, map[string]any{"paused": paused, "revision": revision}).Code
	}
	assert.Equal(t, 400, set(true, card().Revision, homeTestCreator), "unpaid cards cannot acquire an entitlement")
	require.NoError(t, service.ReviewCreatorHome(id, card().Revision, "approve", "", false, 0))
	_, err := service.BuyCreatorHome(92001, id, "year", "pause-test-purchase-0001", card().Revision)
	require.NoError(t, err)
	before := card()
	assert.False(t, before.OwnerPaused)
	assert.Equal(t, 401, set(true, before.Revision, ""))
	assert.Equal(t, 400, set(true, before.Revision, "local-other-home-test-token"))
	assert.Equal(t, 409, set(true, "stale-revision", homeTestCreator))
	assert.Equal(t, 400, homeRequest(t, e, "PUT", "/me/home/cards/"+id+"/display", homeTestCreator, map[string]any{"revision": before.Revision}).Code)
	assert.Equal(t, 400, homeRequest(t, e, "PUT", "/me/home/cards/"+id+"/display", homeTestCreator, map[string]any{"paused": "true", "revision": before.Revision}).Code)
	req := httptest.NewRequest("PUT", "http://localhost/api/creators/me/home/cards/"+id+"/display", bytes.NewBufferString(`{"paused":true}`))
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("Authorization", "Bearer "+homeTestCreator)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	assert.Equal(t, 403, rec.Code)

	require.Equal(t, 200, set(true, before.Revision, homeTestCreator))
	paused := card()
	assert.True(t, paused.OwnerPaused)
	assert.NotEqual(t, before.Revision, paused.Revision)
	assert.Equal(t, before.ExpiresAt, paused.ExpiresAt)
	assert.Equal(t, before.ApprovedImage, paused.ApprovedImage)
	assert.Equal(t, before.Status, paused.Status)
	assert.False(t, paused.Hidden)
	assert.Equal(t, 404, homeRequest(t, e, "GET", "/home/posters/"+id, "", nil).Code)
	assert.NotContains(t, homeDisplayedWorks(t,e), id)
	assert.Equal(t, 200, homeRequest(t, e, "GET", "/public/"+id, "", nil).Code, "project details remain public")
	assert.Equal(t, 409, set(false, before.Revision, homeTestCreator))
	require.Equal(t, 200, set(false, paused.Revision, homeTestCreator))
	assert.False(t, card().OwnerPaused)
	assert.Equal(t, before.ExpiresAt, card().ExpiresAt)
	assert.Contains(t, homeRequest(t, e, "GET", "/home", "", nil).Body.String(), id)
	assert.Equal(t, 200, homeRequest(t, e, "GET", "/home/posters/"+id, "", nil).Code)
	// Re-review, admin changes and renewals must preserve the owner's pause.
	require.Equal(t, 200, set(true, card().Revision, homeTestCreator))
	require.NoError(t, service.SubmitCreatorHomeCard(92001, id, homeImage(600, 800), card().Revision))
	require.NoError(t, service.ReviewCreatorHome(id, card().Revision, "approve", "", true, 2))
	assert.True(t, card().OwnerPaused)
	assert.Equal(t, 400, set(false, card().Revision, homeTestCreator), "cannot bypass administrative hiding")
	assert.True(t, card().Hidden)
	require.NoError(t, service.ReviewCreatorHome(id, card().Revision, "display", "", false, 3))
	assert.True(t, card().OwnerPaused)
	assert.NotContains(t, homeDisplayedWorks(t,e), id)
	// A failed/resumed toggle never charges a wallet or creates a payment order.
	var user model.User
	require.NoError(t, db.First(&user, 92001).Error)
	assert.Equal(t, 17500000, user.Quota)
	var count int64
	require.NoError(t, db.Model(&model.CreatorHomeOrder{}).Count(&count).Error)
	assert.EqualValues(t, 1, count)
	_, err = service.BuyCreatorHome(92001, id, "permanent", "pause-test-permanent-0001", card().Revision)
	require.NoError(t, err)
	assert.True(t, card().OwnerPaused)
	assert.True(t, card().Permanent)
	require.Equal(t, 200, set(false, card().Revision, homeTestCreator))
	assert.True(t, card().Permanent)
	assert.Zero(t, card().ExpiresAt)
	assert.Equal(t, 200, homeRequest(t, e, "GET", "/home/posters/"+id, "", nil).Code)

	require.Equal(t, 200, set(true, card().Revision, homeTestCreator))
	require.NoError(t, db.Model(&model.CreatorHomeCard{}).Where("work_id = ?", id).Updates(map[string]any{"permanent": false, "expires_at": time.Now().Unix() - 1}).Error)
	assert.Equal(t, 400, set(false, card().Revision, homeTestCreator), "expired placements cannot resume")
	assert.True(t, card().OwnerPaused)
	require.NoError(t, db.Model(&model.CreatorHomeCard{}).Where("work_id = ?", id).Update("permanent", true).Error)
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		for i := range c.Works {
			if c.Works[i].ID == id {
				c.Works[i].Status = "draft"
			}
		}
		return nil
	}))
	assert.Equal(t, 400, set(false, card().Revision, homeTestCreator), "unpublished works cannot resume")
}
