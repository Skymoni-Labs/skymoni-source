package controller

import (
	"crypto/sha256"
	"encoding/base64"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type creatorGitHubCallbackTransport func(*http.Request) (*http.Response, error)

func (f creatorGitHubCallbackTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func TestCreatorGitHubSuccessfulCallbackUsesPKCEAndDoesNotChangeSiteLogin(t *testing.T) {
	identity := setupCreatorGitHubController(t)
	state := startCreatorGitHubFlow(t, identity)
	flow, err := model.GetAuthFlow(state, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeOAuth, Provider: creatorGitHubProvider, Intent: model.AuthFlowIntentBind, UserId: identity.UserID, SessionId: identity.SessionID})
	require.NoError(t, err)
	var payload creatorGitHubFlow
	require.NoError(t, common.UnmarshalJsonStr(flow.Payload, &payload))
	hash := sha256.Sum256([]byte(payload.Verifier))
	assert.Len(t, base64.RawURLEncoding.EncodeToString(hash[:]), 43)
	before := http.DefaultTransport
	calls := 0
	http.DefaultTransport = creatorGitHubCallbackTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		var response string
		switch r.URL.String() {
		case "https://github.com/login/oauth/access_token":
			require.NoError(t, r.ParseForm())
			assert.Equal(t, "fixture-code", r.Form.Get("code"))
			assert.Equal(t, payload.Verifier, r.Form.Get("code_verifier"))
			assert.Equal(t, "https://skymoni.com/creators/github/callback", r.Form.Get("redirect_uri"))
			response = `{"access_token":"fixture-private-access","refresh_token":"fixture-private-refresh","token_type":"bearer","expires_in":28800,"refresh_token_expires_in":15897600}`
		case "https://api.github.com/user":
			assert.Equal(t, "Bearer fixture-private-access", r.Header.Get("Authorization"))
			response = `{"id":123,"login":"author"}`
		default:
			t.Fatalf("unexpected external destination: %s", r.URL.Host)
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(response))}, nil
	})
	t.Cleanup(func() { http.DefaultTransport = before })
	body := `{"state":"` + state + `","code":"fixture-code"}`
	response := securityEnrollmentRequest("POST", "/api/creators/me/github/callback", body, "", identity, CreatorGitHubCallback)
	require.Equal(t, 200, response.Code, response.Body.String())
	assert.Equal(t, 2, calls)
	assert.NotContains(t, response.Body.String(), "fixture-private")
	response = securityEnrollmentRequest("GET", "/api/creators/me/github", "", "", identity, CreatorGitHubStatus)
	assert.Contains(t, response.Body.String(), `"login":"author"`)
	assert.NotContains(t, response.Body.String(), "fixture-private")
	var siteUser model.User
	require.NoError(t, model.DB.First(&siteUser, identity.UserID).Error)
	assert.Empty(t, siteUser.GitHubId)
	response = securityEnrollmentRequest("POST", "/api/creators/me/github/callback", body, "", identity, CreatorGitHubCallback)
	assert.Equal(t, 403, response.Code)
	assert.Equal(t, 2, calls, "a replay must not exchange the code again")
}

func setupCreatorGitHubController(t *testing.T) service.AuthIdentity {
	t.Helper()
	_, identity := setupSecurityEnrollmentTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.CommunityAccessConfig{}, &model.CommunityAdmission{}, &model.CommunityInvite{}, &model.CreatorHomeCard{}, &model.CreatorHomeOrder{}, &model.CreatorHomeConfig{}, &model.CreatorHomeAuthor{}))
	logConnection, err := model.LOG_DB.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = logConnection.Close() })
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	t.Setenv("CREATOR_GITHUB_CLIENT_ID", "fixture-client")
	t.Setenv("CREATOR_GITHUB_CLIENT_SECRET", "fixture-secret")
	t.Setenv("CREATOR_GITHUB_CALLBACK_URL", "https://skymoni.com/creators/github/callback")
	previous := common.PasswordLoginEnabled
	common.PasswordLoginEnabled = true
	t.Cleanup(func() { common.PasswordLoginEnabled = previous })
	require.NoError(t, service.ActivateCreator(identity.UserID, service.CreatorProfile{Name: "Creator", Handle: "creator-test"}, "software", service.CreatorTermsVersion, true))
	return identity
}
func startCreatorGitHubFlow(t *testing.T, identity service.AuthIdentity) string {
	t.Helper()
	proof := issueSecurityEnrollmentProof(t, identity, service.VerificationOperation{Scope: service.VerificationScopeCreatorGitHubConnect}, service.VerificationMethodPassword)
	response := securityEnrollmentRequest("POST", "/api/creators/me/github/start", "{}", proof, identity, CreatorGitHubStart)
	require.Equal(t, 200, response.Code, response.Body.String())
	var body struct {
		Data struct {
			URL string `json:"authorizationUrl"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body))
	u, err := url.Parse(body.Data.URL)
	require.NoError(t, err)
	assert.Equal(t, "github.com", u.Host)
	assert.Equal(t, "S256", u.Query().Get("code_challenge_method"))
	assert.Len(t, u.Query().Get("code_challenge"), 43)
	assert.Equal(t, "offline_access", u.Query().Get("scope"))
	return u.Query().Get("state")
}
func TestCreatorGitHubStartRequiresProofAndExplicitCreatorIdentity(t *testing.T) {
	identity := setupCreatorGitHubController(t)
	response := securityEnrollmentRequest("POST", "/api/creators/me/github/start", "{}", "", identity, CreatorGitHubStart)
	assert.Equal(t, http.StatusForbidden, response.Code)
	assert.Contains(t, response.Body.String(), "SECURITY_PROOF_REQUIRED")
	otherScope := issueSecurityEnrollmentProof(t, identity, service.VerificationOperation{Scope: service.VerificationScopeCreatorGitHubDisconnect}, service.VerificationMethodPassword)
	response = securityEnrollmentRequest("POST", "/api/creators/me/github/start", "{}", otherScope, identity, CreatorGitHubStart)
	assert.Equal(t, 403, response.Code)
	identity.UserID++
	response = securityEnrollmentRequest("GET", "/api/creators/me/github", "", "", identity, CreatorGitHubStatus)
	assert.Equal(t, 403, response.Code)
}
func TestCreatorGitHubDeniedCallbackIsSingleUseAndBoundToSession(t *testing.T) {
	identity := setupCreatorGitHubController(t)
	state := startCreatorGitHubFlow(t, identity)
	body := `{"state":"` + state + `","denied":true}`
	wrong := identity
	wrong.SessionID = "other-session"
	response := securityEnrollmentRequest("POST", "/api/creators/me/github/callback", body, "", wrong, CreatorGitHubCallback)
	assert.Equal(t, 403, response.Code)
	response = securityEnrollmentRequest("POST", "/api/creators/me/github/callback", body, "", identity, CreatorGitHubCallback)
	assert.Equal(t, 200, response.Code)
	assert.Contains(t, response.Body.String(), `"cancelled":true`)
	response = securityEnrollmentRequest("POST", "/api/creators/me/github/callback", body, "", identity, CreatorGitHubCallback)
	assert.Equal(t, 403, response.Code)
}
func TestCreatorGitHubCallbackRejectsExpiryAndRevokedSession(t *testing.T) {
	for _, change := range []string{"expiry", "revoked"} {
		t.Run(change, func(t *testing.T) {
			identity := setupCreatorGitHubController(t)
			state := startCreatorGitHubFlow(t, identity)
			if change == "expiry" {
				require.NoError(t, model.DB.Model(&model.AuthFlow{}).Where("provider = ?", creatorGitHubProvider).Update("expires_at", time.Now().Add(-time.Minute)).Error)
			} else {
				require.NoError(t, model.DB.Model(&model.UserSession{}).Where("sid = ?", identity.SessionID).Update("revoked_at", time.Now().Unix()).Error)
			}
			body := `{"state":"` + state + `","code":"fixture-code"}`
			response := securityEnrollmentRequest("POST", "/api/creators/me/github/callback", body, "", identity, CreatorGitHubCallback)
			assert.True(t, response.Code == 403 || strings.Contains(response.Body.String(), `"success":false`), response.Body.String())
		})
	}
}
