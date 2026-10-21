package router

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreatorPublicProfile(t *testing.T) {
	e, db := setupCreatorHome(t, t.TempDir())
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		m := c.Members[92001]
		m.Profile.Bio = "Public biography"
		m.Profile.Introduction = "Public introduction"
		m.Pinned = []string{"private-draft", "foreign-work", "home-demo-website", "home-demo-website", "unlisted-work"}
		m.Saved = []string{"private-bookmark"}
		c.Members[92001] = m
		c.Works[0].Revision, c.Works[0].ReviewNote = "private-revision", "private-review-note"
		c.Works = append(c.Works,
			service.CreatorWork{ID: "private-draft", OwnerID: 92001, Status: "draft"},
			service.CreatorWork{ID: "private-review", OwnerID: 92001, Status: "review"},
			service.CreatorWork{ID: "foreign-work", OwnerID: 92002, Status: "published"},
			service.CreatorWork{ID: "unlisted-work", OwnerID: 92001, Status: "published", Settings: &service.CreatorSettings{Listed: false}},
		)
		return nil
	}))
	// Hiding the marquee entry doesn't make a creator's public profile private.
	require.NoError(t, db.Model(&model.CreatorHomeAuthor{}).Where("user_id = ?", 92001).Updates(map[string]any{"avatar": homeImage(64, 64), "visible": false}).Error)
	r := homeRequest(t, e, "GET", "/people/92001", "", nil)
	require.Equal(t, 200, r.Code, r.Body.String())
	var response struct {
		Data service.PublicCreatorProfile `json:"data"`
	}
	require.NoError(t, json.Unmarshal(r.Body.Bytes(), &response))
	assert.Equal(t, "Mio", response.Data.Profile.Name)
	assert.Equal(t, "Public biography", response.Data.Profile.Bio)
	assert.NotEmpty(t, response.Data.Avatar)
	assert.Len(t, response.Data.Works, 2)
	assert.Equal(t, []string{"home-demo-website"}, response.Data.Pinned)
	for _, w := range response.Data.Works {
		assert.Equal(t, 92001, w.OwnerID)
		assert.Empty(t, w.Revision)
		assert.Empty(t, w.ReviewNote)
	}
	for _, hidden := range []string{"private-draft", "private-review", "foreign-work", "unlisted-work", "private-bookmark", "private-revision", "private-review-note", "acceptedAt", "termsVersion", "orders", "balance", "saved"} {
		assert.NotContains(t, r.Body.String(), hidden)
	}
	other := homeRequest(t, e, "GET", "/people/92002", "", nil)
	assert.Equal(t, 200, other.Code)
	assert.Contains(t, other.Body.String(), "foreign-work")
	assert.NotContains(t, other.Body.String(), "home-demo-website")
	empty := homeRequest(t, e, "GET", "/people/92003", "", nil)
	assert.Equal(t, 200, empty.Code)
	assert.Contains(t, empty.Body.String(), `"works":[]`)
	for _, invalid := range []string{"0", "-1", "99999", "not-an-id", "9999999999999999999999999999999999999"} {
		assert.Equal(t, 404, homeRequest(t, e, "GET", "/people/"+invalid, "", nil).Code)
	}
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		m := c.Members[92001]
		m.Suspended = true
		c.Members[92001] = m
		return nil
	}))
	assert.Equal(t, 404, homeRequest(t, e, "GET", "/people/92001", "", nil).Code)
}

func TestCreatorPublicProfileUsesSavedAvatarWithoutHomepageOverride(t *testing.T) {
	e, _ := setupCreatorHome(t, t.TempDir())
	avatar := homeImage(128, 128)
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		m := c.Members[92001]
		m.Profile.Avatar = &avatar
		c.Members[92001] = m
		return nil
	}))
	response := homeRequest(t, e, "GET", "/people/92001", "", nil)
	require.Equal(t, 200, response.Code)
	var profile struct {
		Data service.PublicCreatorProfile `json:"data"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &profile))
	assert.Equal(t, avatar, profile.Data.Avatar)
	var home struct {
		Data struct {
			Authors []service.HomeCreator `json:"authors"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(homeRequest(t, e, "GET", "/home", "", nil).Body.Bytes(), &home))
	for _, author := range home.Data.Authors {
		if author.UserID == 92001 {
			assert.Equal(t, avatar, author.Avatar)
			return
		}
	}
	t.Fatal("Saved creator was not included in homepage authors")
}
