package router

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreatorShowcasePermissionsAndPlacement(t *testing.T) {
	e, db := setupCreatorHome(t, t.TempDir())
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		for _, id := range []string{"third", "private", "unlisted", "suspended"} {
			work := c.Works[0]
			work.ID, work.Title = id, id
			if id == "private" {
				work.Status = "draft"
			}
			if id == "unlisted" {
				work.Settings = &service.CreatorSettings{Listed: false}
			}
			if id == "suspended" {
				work.OwnerID = 92002
				member := c.Members[92002]
				member.Suspended = true
				c.Members[92002] = member
			}
			c.Works = append(c.Works, work)
		}
		return nil
	}))
	read := func() service.CreatorShowcase {
		var response struct {
			Data struct {
				Config service.CreatorShowcase `json:"config"`
				Works  []service.CreatorWork   `json:"works"`
			} `json:"data"`
		}
		r := homeRequest(t, e, "GET", "/admin/showcase", homeTestAdmin, nil)
		require.Equal(t, 200, r.Code, r.Body.String())
		require.NoError(t, json.Unmarshal(r.Body.Bytes(), &response))
		require.Len(t, response.Data.Works, 3)
		return response.Data.Config
	}
	public := func() service.CreatorShowcase {
		var response struct {
			Showcase service.CreatorShowcase `json:"showcase"`
		}
		r := homeRequest(t, e, "GET", "/public", "", nil)
		require.Equal(t, 200, r.Code)
		for _, hidden := range []string{"private", "unlisted", "suspended", "revision", "reviewNote"} {
			if hidden == "revision" || hidden == "reviewNote" {
				continue
			} // Existing work schema uses empty values.
			assert.NotContains(t, r.Body.String(), `"`+hidden+`"`)
		}
		require.NoError(t, json.Unmarshal(r.Body.Bytes(), &response))
		assert.Empty(t, response.Showcase.Revision)
		return response.Showcase
	}
	initial := read()
	assert.True(t, initial.Enabled)
	assert.Equal(t, "initial", initial.Revision)
	assert.Equal(t, [3]string{"home-demo-website", "home-demo-tool", "third"}, public().SpotlightIDs)
	assert.Equal(t, 401, homeRequest(t, e, "GET", "/admin/showcase", "", nil).Code)
	assert.Equal(t, 403, homeRequest(t, e, "PUT", "/admin/showcase", homeTestCreator, initial).Code)
	for _, body := range []map[string]any{
		{"spotlightIds": []string{"", "", ""}, "orderedIds": []string{}, "revision": "initial"},
		{"enabled": true, "spotlightIds": []string{""}, "orderedIds": []string{}, "revision": "initial"},
		{"enabled": true, "spotlightIds": []string{"", "", "", ""}, "orderedIds": []string{}, "revision": "initial"},
		{"enabled": true, "spotlightIds": []string{"", "", ""}, "revision": "initial"},
	} {
		assert.Equal(t, 400, homeRequest(t, e, "PUT", "/admin/showcase", homeTestAdmin, body).Code)
	}
	for _, id := range []string{"private", "unlisted", "suspended", "missing"} {
		input := initial
		input.SpotlightIDs[0] = id
		assert.Equal(t, 400, homeRequest(t, e, "PUT", "/admin/showcase", homeTestAdmin, input).Code)
		input = initial
		input.OrderedIDs = []string{id}
		assert.Equal(t, 400, homeRequest(t, e, "PUT", "/admin/showcase", homeTestAdmin, input).Code)
	}
	duplicate := initial
	duplicate.SpotlightIDs = [3]string{"third", "third", ""}
	assert.Equal(t, 400, homeRequest(t, e, "PUT", "/admin/showcase", homeTestAdmin, duplicate).Code)
	duplicate = initial
	duplicate.OrderedIDs = []string{"third", "third"}
	assert.Equal(t, 400, homeRequest(t, e, "PUT", "/admin/showcase", homeTestAdmin, duplicate).Code)
	request := httptest.NewRequest("PUT", "http://localhost/api/creators/admin/showcase", strings.NewReader(`{"enabled":true,"spotlightIds":["","",""],"orderedIds":[],"revision":"initial"}`))
	request.Header.Set("Origin", "https://elsewhere.invalid")
	request.Header.Set("Authorization", "Bearer "+homeTestAdmin)
	recorder := httptest.NewRecorder()
	e.ServeHTTP(recorder, request)
	assert.Equal(t, 403, recorder.Code)
	input := initial
	input.SpotlightIDs, input.OrderedIDs = [3]string{"", "third", "home-demo-tool"}, []string{"third", "home-demo-tool", "home-demo-website"}
	require.Equal(t, 200, homeRequest(t, e, "PUT", "/admin/showcase", homeTestAdmin, input).Code)
	updated := read()
	assert.NotEqual(t, initial.Revision, updated.Revision)
	assert.Equal(t, input.SpotlightIDs, updated.SpotlightIDs)
	assert.Equal(t, [3]string{"home-demo-website", "third", "home-demo-tool"}, public().SpotlightIDs)
	assert.Equal(t, input.OrderedIDs, public().OrderedIDs)
	assert.Equal(t, 409, homeRequest(t, e, "PUT", "/admin/showcase", homeTestAdmin, input).Code)
	updated.Enabled = false
	require.Equal(t, 200, homeRequest(t, e, "PUT", "/admin/showcase", homeTestAdmin, updated).Code)
	assert.False(t, public().Enabled)
	// Publication changes immediately invalidate placements, without editing this config.
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		for i := range c.Works {
			if c.Works[i].ID == "third" {
				c.Works[i].Status = "draft"
			}
		}
		return nil
	}))
	assert.Equal(t, [3]string{"home-demo-website", "", "home-demo-tool"}, public().SpotlightIDs)
	assert.Equal(t, []string{"home-demo-tool", "home-demo-website"}, public().OrderedIDs)
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		for i := range c.Works {
			if c.Works[i].ID == "home-demo-website" {
				c.Works[i].Status = "draft"
			}
		}
		return nil
	}))
	assert.Equal(t, [3]string{"home-demo-tool", "", ""}, public().SpotlightIDs)
	var user model.User
	require.NoError(t, db.First(&user, 92001).Error)
	assert.Equal(t, 20000000, user.Quota)
	var audits int64
	require.NoError(t, db.Model(&model.AuditLog{}).Where("action = ?", "creator.showcase").Count(&audits).Error)
	assert.EqualValues(t, 2, audits)
}

func TestCreatorShowcaseDailyModePersistsWithoutChangingManualPositions(t *testing.T) {
	e, _ := setupCreatorHome(t, t.TempDir())
	// The mode is persisted immediately; previews and visitors share today's
	// selection, while the previous manual placements remain available.
	daily := service.CreatorShowcase{Enabled: true, DailyRandom: true, Revision: "initial", SpotlightIDs: [3]string{"home-demo-tool", "home-demo-website", ""}, OrderedIDs: []string{}}
	r := homeRequest(t, e, "PUT", "/admin/showcase", homeTestAdmin, daily)
	require.Equal(t, 200, r.Code, r.Body.String())
	var response struct {
		Data struct {
			Config  service.CreatorShowcase `json:"config"`
			Preview service.CreatorShowcase `json:"dailyPreview"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(r.Body.Bytes(), &response))
	assert.True(t, response.Data.Config.DailyRandom)
	assert.Equal(t, daily.SpotlightIDs, response.Data.Config.SpotlightIDs)
	var public struct {
		Showcase service.CreatorShowcase `json:"showcase"`
	}
	require.NoError(t, common.Unmarshal(homeRequest(t, e, "GET", "/public", "", nil).Body.Bytes(), &public))
	assert.Equal(t, response.Data.Preview.SpotlightIDs, public.Showcase.SpotlightIDs)
	assert.NotEmpty(t, public.Showcase.RotationDate)
	response.Data.Config.DailyRandom = false
	require.Equal(t, 200, homeRequest(t, e, "PUT", "/admin/showcase", homeTestAdmin, response.Data.Config).Code)
	require.NoError(t, common.Unmarshal(homeRequest(t, e, "GET", "/public", "", nil).Body.Bytes(), &public))
	assert.False(t, public.Showcase.DailyRandom)
	assert.Equal(t, daily.SpotlightIDs, public.Showcase.SpotlightIDs)
}

func TestCreatorShowcaseConcurrentSave(t *testing.T) {
	setupCreatorHome(t, t.TempDir())
	input := service.CreatorShowcase{Enabled: true, Revision: "initial", OrderedIDs: []string{"home-demo-tool"}}
	results := make(chan error, 2)
	var tasks sync.WaitGroup
	for i := 0; i < 2; i++ {
		tasks.Add(1)
		go func() { defer tasks.Done(); results <- service.SaveCreatorShowcase(input) }()
	}
	tasks.Wait()
	close(results)
	passed, conflicted := 0, 0
	for err := range results {
		if err == nil {
			passed++
		} else {
			require.ErrorIs(t, err, service.ErrCreatorConflict)
			conflicted++
		}
	}
	assert.Equal(t, 1, passed)
	assert.Equal(t, 1, conflicted)
}
