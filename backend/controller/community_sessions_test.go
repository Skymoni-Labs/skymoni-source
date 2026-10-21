package controller

import (
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func communityTestSchema(t *testing.T) {
	logDB := model.LOG_DB
	t.Cleanup(func() {
		connection, err := logDB.DB()
		if err == nil {
			_ = connection.Close()
		}
	})
	require.NoError(t, model.DB.AutoMigrate(&model.CommunityAccessConfig{}, &model.CommunityAdmission{}, &model.CommunityInvite{}, &model.Redemption{}, &model.RedemptionClaim{}, &model.TopUp{}))
}
func TestCommunityAuthorizationIssuesIndependentScopedSession(t *testing.T) {
	user, identity := setupSecurityEnrollmentTest(t)
	communityTestSchema(t)
	relayToken, _, err := service.IssueAccessToken(identity)
	require.NoError(t, err)
	router := gin.New()
	router.POST("/api/user/community/authorize", middleware.UserAuth(), AuthorizeCommunityLogin)
	request := httptest.NewRequest("POST", "/api/user/community/authorize", strings.NewReader(fmt.Sprintf(`{"approved":true,"userId":%d,"returnTo":"/creators?category=general"}`, user.Id)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+relayToken)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, 200, response.Code, response.Body.String())
	var result struct {
		Data struct {
			Bundle struct {
				AccessToken string                   `json:"access_token"`
				Session     service.LoginSessionView `json:"session"`
			} `json:"bundle"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	require.NotEqual(t, identity.SessionID, result.Data.Bundle.Session.SID)
	require.Equal(t, "community:relay-authorization", result.Data.Bundle.Session.LoginMethod)
	for _, cookie := range response.Result().Cookies() {
		require.Contains(t, []string{"skymoni_community_refresh", "skymoni_community_has_session"}, cookie.Name)
	}
	_, _, err = service.ValidateLoginSession(identity)
	require.NoError(t, err)
	check := gin.New()
	check.GET("/api/user/self", middleware.UserAuth(), func(c *gin.Context) { c.Status(204) })
	check.GET("/api/user/self/topup", middleware.UserAuth(), func(c *gin.Context) { c.Status(204) })
	check.GET("/mixed", middleware.TokenOrUserAuth(), func(c *gin.Context) { c.Status(204) })
	for _, tc := range []struct {
		path, scope, token string
		status             int
	}{
		{"/api/user/self", "community", result.Data.Bundle.AccessToken, 204},
		{"/api/user/self", "", result.Data.Bundle.AccessToken, 401},
		{"/api/user/self", "community", relayToken, 401},
		{"/api/user/self", "", relayToken, 204},
		{"/api/user/self/topup", "community", result.Data.Bundle.AccessToken, 401},
		{"/mixed", "", result.Data.Bundle.AccessToken, 401},
	} {
		req := httptest.NewRequest("GET", tc.path, nil)
		req.Header.Set("Authorization", "Bearer "+tc.token)
		req.Header.Set(service.CommunityScopeHeader, tc.scope)
		res := httptest.NewRecorder()
		check.ServeHTTP(res, req)
		require.Equal(t, tc.status, res.Code, tc.path+"/"+tc.scope)
	}
}
func TestCommunityLogoutAndRefreshDoNotChangeRelaySession(t *testing.T) {
	user, relayIdentity := setupSecurityEnrollmentTest(t)
	communityTestSchema(t)
	relay, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "relay")
	require.NoError(t, err)
	community, err := service.CreateLoginSession(user.Id, "community:password", "127.0.0.1", "community")
	require.NoError(t, err)
	call := func(scope, path, token, relayCookie, communityCookie string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
		res := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(res)
		c.Request = httptest.NewRequest("POST", path, nil)
		c.Request.Header.Set(service.CommunityScopeHeader, scope)
		if token != "" {
			c.Request.Header.Set("Authorization", "Bearer "+token)
		}
		if relayCookie != "" {
			c.Request.AddCookie(&http.Cookie{Name: service.RefreshCookieName, Value: relayCookie})
		}
		if communityCookie != "" {
			c.Request.AddCookie(&http.Cookie{Name: "skymoni_community_refresh", Value: communityCookie})
		}
		handler(c)
		return res
	}
	// Copying the other scope's refresh secret must not rotate or revoke it.
	res := call("community", "/api/user/auth/refresh", "", relay.RefreshToken, relay.RefreshToken, RefreshAuth)
	require.Equal(t, 401, res.Code)
	identity, err := service.ParseAccessToken(relay.AccessToken)
	require.NoError(t, err)
	_, _, err = service.ValidateLoginSession(identity)
	require.NoError(t, err)
	res = call("community", "/api/user/auth/logout", community.AccessToken, relay.RefreshToken, community.RefreshToken, AuthLogout)
	require.Equal(t, 200, res.Code, res.Body.String())
	for _, cookie := range res.Result().Cookies() {
		require.Contains(t, []string{"skymoni_community_refresh", "skymoni_community_has_session"}, cookie.Name)
	}
	_, _, err = service.ValidateLoginSession(identity)
	require.NoError(t, err)
	_, _, err = service.ValidateLoginSession(relayIdentity)
	require.NoError(t, err)
	community, err = service.CreateLoginSession(user.Id, "community:password", "127.0.0.1", "community2")
	require.NoError(t, err)
	res = call("", "/api/user/auth/logout", relay.AccessToken, relay.RefreshToken, community.RefreshToken, AuthLogout)
	require.Equal(t, 200, res.Code)
	communityIdentity, err := service.ParseAccessToken(community.AccessToken)
	require.NoError(t, err)
	_, _, err = service.ValidateLoginSession(communityIdentity)
	require.NoError(t, err)
	// Security revocation remains global even though ordinary logout is isolated.
	_, err = model.BumpUserAuthVersion(user.Id)
	require.NoError(t, err)
	_, _, err = service.ValidateLoginSession(communityIdentity)
	require.Error(t, err)
}
func TestCommunityAdmissionSwitchesAndInvites(t *testing.T) {
	user, _ := setupSecurityEnrollmentTest(t)
	communityTestSchema(t)
	p, err := model.CommunityPolicy(model.DB)
	require.NoError(t, err)
	require.False(t, p.RedemptionRequired)
	require.False(t, p.InviteRequired)
	p, err = model.SetCommunityPolicy(true, true, p.Revision)
	require.NoError(t, err)
	_, err = model.SetCommunityPolicy(false, false, p.Revision-1)
	require.ErrorIs(t, err, model.ErrCommunityAccessConflict)
	require.ErrorIs(t, model.AdmitCommunity(user.Id, ""), model.ErrCommunityRedemption)
	p, err = model.SetCommunityPolicy(false, true, p.Revision)
	require.NoError(t, err)
	invite, code, err := model.NewCommunityInvite(user.Id, "test", 1, time.Now().Add(time.Hour).Unix())
	require.NoError(t, err)
	require.NotContains(t, invite.Hash, code)
	require.ErrorIs(t, model.AdmitCommunity(user.Id, "invalid"), model.ErrCommunityInvite)
	require.NoError(t, model.AdmitCommunity(user.Id, code))
	require.NoError(t, model.AdmitCommunity(user.Id, ""))
	var stored model.CommunityInvite
	require.NoError(t, model.DB.First(&stored, "id = ?", invite.ID).Error)
	require.Equal(t, 1, stored.Uses)
	other := model.User{Username: "new-community-user", AffCode: "other-community", Password: "unused", Status: 1, Role: 1, AuthVersion: 1}
	require.NoError(t, model.DB.Create(&other).Error)
	require.ErrorIs(t, model.AdmitCommunity(other.Id, code), model.ErrCommunityInvite)
	p, err = model.SetCommunityPolicy(true, true, p.Revision)
	require.NoError(t, err)
	require.NoError(t, model.AdmitCommunity(user.Id, ""))
	// Closing both controls restores free NEW admission without altering old grants.
	_, err = model.SetCommunityPolicy(false, false, p.Revision)
	require.NoError(t, err)
	require.NoError(t, model.AdmitCommunity(other.Id, ""))
}
func TestCommunityReturnValidation(t *testing.T) {
	for _, raw := range []string{"https://evil.invalid/creators", "//evil.invalid/creators", "/creators/../../dashboard", "/creators/%5c..%5cdashboard", "/creators/%00bad"} {
		require.False(t, communityReturn(raw), raw)
	}
	require.True(t, communityReturn("/creators?category=development"))
}

func TestCommunityCreatorOpeningAndBanAreSeparateFromAccountAccess(t *testing.T) {
	user, identity := setupSecurityEnrollmentTest(t)
	communityTestSchema(t)
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	profile := service.CreatorProfile{Name: "Creator", Handle: "creator-control", Bio: "A useful introduction"}
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		c.Members[user.Id] = service.CreatorMember{UserID: user.Id, AcceptedAt: 1, Profile: profile}
		c.Works = []service.CreatorWork{{ID: "original-work", OwnerID: user.Id, Status: "published"}}
		return nil
	}))
	status, err := service.SetCreatorSuspended(user.Id, 999, true, "active")
	require.NoError(t, err)
	require.Equal(t, "suspended", status)
	require.NoError(t, service.WithCreatorCatalog(false, func(c *service.CreatorCatalog) error {
		require.False(t, service.CreatorActive(c, user.Id))
		require.False(t, service.CreatorPublic(c, c.Works[0]))
		require.Len(t, c.Works, 1)
		return nil
	}))
	require.ErrorIs(t, service.ActivateCreator(user.Id, profile, "software", service.CreatorTermsVersion, true), service.ErrCreatorForbidden)
	_, _, err = service.GrantCreator(user.Id, 999)
	require.ErrorIs(t, err, service.ErrCreatorForbidden)
	_, err = service.SetCreatorSuspended(user.Id, 999, false, "active")
	require.ErrorIs(t, err, service.ErrCreatorConflict)
	_, _, err = service.ValidateLoginSession(identity)
	require.NoError(t, err)
	status, err = service.SetCreatorSuspended(user.Id, 999, false, "suspended")
	require.NoError(t, err)
	require.Equal(t, "active", status)
	require.NoError(t, service.WithCreatorCatalog(false, func(c *service.CreatorCatalog) error {
		require.True(t, service.CreatorPublic(c, c.Works[0]))
		return nil
	}))
	p, err := model.CommunityPolicy(model.DB)
	require.NoError(t, err)
	require.True(t, p.CreatorApplicationsOpen)
	p, err = model.SetCommunityPolicy(false, false, p.Revision, false)
	require.NoError(t, err)
	require.False(t, p.CreatorApplicationsOpen)
	require.ErrorIs(t, service.ActivateCreator(9999, profile, "software", service.CreatorTermsVersion, true), service.ErrCreatorApplicationsClosed)
	require.NoError(t, service.ActivateCreator(user.Id, profile, "software", service.CreatorTermsVersion, true))
}
