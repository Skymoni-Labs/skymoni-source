package router

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreatorWorkAutoReviewPolicy(t *testing.T) {
	e, db := setupCreatorHome(t, t.TempDir())
	require.NoError(t, db.AutoMigrate(&model.Redemption{}, &model.RedemptionClaim{}))
	policy := func() service.CreatorReviewPolicy {
		var response struct {
			Data service.CreatorCatalog `json:"data"`
		}
		r := homeRequest(t, e, "GET", "/admin", homeTestAdmin, nil)
		require.Equal(t, 200, r.Code, r.Body.String())
		require.NoError(t, json.Unmarshal(r.Body.Bytes(), &response))
		return response.Data.ReviewPolicy
	}
	work := func(id, status string) service.CreatorWork {
		return service.CreatorWork{ID: id, Title: "A new project", Summary: "A valid project introduction", Category: "website", Style: "horizon", Status: status, Author: "forged author", OwnerID: 92002}
	}
	save := func(w service.CreatorWork) service.CreatorWork {
		r := homeRequest(t, e, "PUT", "/me/works/"+w.ID, homeTestCreator, w)
		require.Equal(t, 200, r.Code, r.Body.String())
		var response struct {
			Data service.CreatorWork `json:"data"`
		}
		require.NoError(t, json.Unmarshal(r.Body.Bytes(), &response))
		return response.Data
	}
	setPolicy := func(on bool, revision string) int {
		return homeRequest(t, e, "PUT", "/admin/review-policy", homeTestAdmin, map[string]any{"autoApproveWorks": on, "revision": revision}).Code
	}
	initial := policy()
	assert.False(t, initial.AutoApproveWorks)
	assert.Equal(t, "initial", initial.Revision)
	pending := save(work("pending-before-switch", "review"))
	assert.Equal(t, "review", pending.Status)
	assert.Equal(t, 92001, pending.OwnerID)
	assert.Equal(t, "Mio", pending.Author)
	assert.Equal(t, 401, homeRequest(t, e, "PUT", "/admin/review-policy", "", nil).Code)
	assert.Equal(t, 403, homeRequest(t, e, "PUT", "/admin/review-policy", homeTestCreator, nil).Code)
	for _, input := range []map[string]any{
		{"revision": initial.Revision},
		{"autoApproveWorks": true},
		{"autoApproveWorks": "true", "revision": initial.Revision},
	} {
		assert.Equal(t, 400, homeRequest(t, e, "PUT", "/admin/review-policy", homeTestAdmin, input).Code)
	}
	request := httptest.NewRequest("PUT", "http://localhost/api/creators/admin/review-policy", strings.NewReader(`{"autoApproveWorks":true,"revision":"initial"}`))
	request.Header.Set("Origin", "https://elsewhere.invalid")
	request.Header.Set("Authorization", "Bearer "+homeTestAdmin)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, request)
	assert.Equal(t, 403, rec.Code)
	require.Equal(t, 200, setPolicy(true, initial.Revision))
	enabled := policy()
	assert.True(t, enabled.AutoApproveWorks)
	assert.NotEqual(t, initial.Revision, enabled.Revision)
	assert.Equal(t, 409, setPolicy(false, initial.Revision))
	assert.True(t, policy().AutoApproveWorks)
	assert.Contains(t, homeRequest(t, e, "GET", "/me", homeTestCreator, nil).Body.String(), `"autoApproveWorks":true`)
	// Enabling the policy does not silently approve the old queue.
	assert.Equal(t, 404, homeRequest(t, e, "GET", "/public/"+pending.ID, "", nil).Code)
	published := save(work("auto-published", "review"))
	assert.Equal(t, "published", published.Status)
	assert.Equal(t, 200, homeRequest(t, e, "GET", "/public/"+published.ID, "", nil).Code)
	draft := save(work("private-draft", "draft"))
	assert.Equal(t, "draft", draft.Status)
	assert.Equal(t, 404, homeRequest(t, e, "GET", "/public/"+draft.ID, "", nil).Code)
	invalid := work("invalid-content", "review")
	invalid.Summary = ""
	assert.Equal(t, 400, homeRequest(t, e, "PUT", "/me/works/"+invalid.ID, homeTestCreator, invalid).Code)
	forged := work("forged-publish", "published")
	assert.Equal(t, 400, homeRequest(t, e, "PUT", "/me/works/"+forged.ID, homeTestCreator, forged).Code)
	foreign := published
	foreign.Status = "review"
	assert.Equal(t, 403, homeRequest(t, e, "PUT", "/me/works/"+published.ID, "local-other-home-test-token", foreign).Code)
	stale := published
	stale.Status, stale.Revision = "review", "old-revision"
	assert.Equal(t, 409, homeRequest(t, e, "PUT", "/me/works/"+stale.ID, homeTestCreator, stale).Code)
	// Re-submission uses the same policy, but a saved draft always remains private.
	pending.Status = "review"
	assert.Equal(t, "published", save(pending).Status)
	published.Status = "draft"
	published = save(published)
	assert.Equal(t, "draft", published.Status)
	assert.Equal(t, 404, homeRequest(t, e, "GET", "/public/"+published.ID, "", nil).Code)
	release, err := service.SaveCreatorRelease(92001, service.CreatorRelease{ID: "manual-release", ProjectID: "home-demo-tool", Version: "1.0.0", Platform: "Windows", DownloadURL: "https://example.com/app.zip", Notes: "A valid release description", Provenance: "original", Status: "review"})
	require.NoError(t, err)
	assert.Equal(t, "review", release.Status)
	require.Equal(t, 200, setPolicy(false, enabled.Revision))
	assert.False(t, policy().AutoApproveWorks)
	assert.Equal(t, "review", save(work("manual-again", "review")).Status)
	// This setting has no wallet or homepage entitlement effects.
	var user model.User
	require.NoError(t, db.First(&user, 92001).Error)
	assert.Equal(t, 20000000, user.Quota)
	var audits int64
	require.NoError(t, db.Model(&model.AuditLog{}).Where("action = ?", "creator.review-policy").Count(&audits).Error)
	assert.EqualValues(t, 2, audits)
}

func TestCreatorWorkIdentityFollowsProfile(t *testing.T) {
	e, db := setupCreatorHome(t, t.TempDir())
	require.NoError(t, db.AutoMigrate(&model.Redemption{}, &model.RedemptionClaim{}))
	// Legacy work snapshots should also resolve current profile names without re-submission.
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		m := c.Members[92001]
		m.Profile.Name = "Current creator"
		c.Members[92001] = m
		return nil
	}))
	for _, path := range []string{"/public", "/public/home-demo-website", "/me"} {
		r := homeRequest(t, e, "GET", path, homeTestCreator, nil)
		require.Equal(t, 200, r.Code, r.Body.String())
		assert.Contains(t, r.Body.String(), `"author":"Current creator"`)
		assert.NotContains(t, r.Body.String(), `"author":"Mio"`)
	}
	avatar := homeImage(128, 128)
	profile := service.CreatorProfile{Name: "Updated name", Handle: "updated-handle", Avatar: &avatar}
	r := homeRequest(t, e, "PUT", "/me/profile", homeTestCreator, map[string]any{"profile": profile, "pinned": []string{}, "saved": []string{}})
	require.Equal(t, 200, r.Code, r.Body.String())
	assert.Contains(t, r.Body.String(), `"author":"Updated name"`)
	assert.Contains(t, r.Body.String(), `"revision":"work-initial"`)
	public := homeRequest(t, e, "GET", "/public/home-demo-website", "", nil)
	assert.Contains(t, public.Body.String(), `"author":"Updated name"`)
	people := homeRequest(t, e, "GET", "/people/92001", "", nil)
	var response struct {
		Data service.PublicCreatorProfile `json:"data"`
	}
	require.NoError(t, json.Unmarshal(people.Body.Bytes(), &response))
	assert.Equal(t, "Updated name", response.Data.Profile.Name)
	assert.NotEmpty(t, response.Data.Avatar)
	assert.Equal(t, *response.Data.Profile.Avatar, response.Data.Avatar)
}
