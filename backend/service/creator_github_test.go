package service

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type creatorGitHubTransport func(*http.Request) (*http.Response, error)

func (f creatorGitHubTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func useCreatorGitHubFixture(t *testing.T, respond creatorGitHubTransport) {
	t.Helper()
	before := creatorGitHubHTTP
	creatorGitHubHTTP = &http.Client{Transport: respond, CheckRedirect: before.CheckRedirect}
	t.Cleanup(func() { creatorGitHubHTTP = before })
}
func githubTestResponse(status int, value any) *http.Response {
	raw, _ := common.Marshal(value)
	return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(string(raw)))}
}
func creatorGitHubMember(t *testing.T, uid int) {
	t.Helper()
	require.NoError(t, ActivateCreator(uid, CreatorProfile{Name: "Creator", Handle: "creator-test"}, "other", CreatorTermsVersion, true))
}
func creatorGitHubTestConnection() CreatorGitHubConnection {
	return CreatorGitHubConnection{ID: 123, Login: "author", Access: "fixture-access-not-a-secret", Refresh: "fixture-refresh-not-a-secret", ExpiresAt: time.Now().Unix() + 3600, RefreshExpiresAt: time.Now().Unix() + 3600}
}
func TestCreatorGitHubVaultKeepsTokensOutOfStatusAndCatalog(t *testing.T) {
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	connection := creatorGitHubTestConnection()
	require.NoError(t, CreatorGitHubStore(42, connection))
	status, err := CreatorGitHubGetStatus(42)
	require.NoError(t, err)
	assert.True(t, status.Connected)
	assert.Equal(t, "author", status.Login)
	raw, err := os.ReadFile(filepath.Join(CreatorDirectory(), "github-private", "connections.enc"))
	require.NoError(t, err)
	assert.NotContains(t, string(raw), connection.Access)
	assert.NotContains(t, string(raw), connection.Refresh)
	encoded, err := common.Marshal(status)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), connection.Access)
	_, err = CreatorGitHubToken(context.Background(), 43)
	assert.ErrorIs(t, err, ErrCreatorGitHubReconnect)
	connection.ID = 999
	assert.ErrorIs(t, CreatorGitHubStore(42, connection), ErrCreatorConflict)
}
func TestCreatorGitHubRefreshRotatesTokenAndRetainsOwner(t *testing.T) {
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	t.Setenv("CREATOR_GITHUB_CLIENT_ID", "fixture-client")
	t.Setenv("CREATOR_GITHUB_CLIENT_SECRET", "fixture-secret")
	t.Setenv("CREATOR_GITHUB_CALLBACK_URL", "https://skymoni.com/creators/github/callback")
	connection := creatorGitHubTestConnection()
	connection.ExpiresAt = 1
	require.NoError(t, CreatorGitHubStore(42, connection))
	useCreatorGitHubFixture(t, func(r *http.Request) (*http.Response, error) {
		require.Equal(t, "https://github.com/login/oauth/access_token", r.URL.String())
		require.NoError(t, r.ParseForm())
		assert.Equal(t, connection.Refresh, r.Form.Get("refresh_token"))
		return githubTestResponse(200, map[string]any{"access_token": "fixture-refreshed", "refresh_token": "fixture-rotated", "token_type": "bearer", "expires_in": 28800, "refresh_token_expires_in": 15897600}), nil
	})
	token, err := CreatorGitHubToken(context.Background(), 42)
	require.NoError(t, err)
	assert.Equal(t, "fixture-refreshed", token)
	require.NoError(t, WithCreatorGitHubVault(false, func(data map[int]CreatorGitHubConnection) error {
		assert.Equal(t, "author", data[42].Login)
		assert.Equal(t, "fixture-rotated", data[42].Refresh)
		return nil
	}))
}
func TestCreatorGitHubImporterCreatesPrivateDraftWithoutCoverAndPreservesReadme(t *testing.T) {
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	creatorGitHubMember(t, 42)
	require.NoError(t, CreatorGitHubStore(42, creatorGitHubTestConnection()))
	readme := "# Board\nHardware notes and firmware. <script>alert('untrusted')</script>"
	useCreatorGitHubFixture(t, func(r *http.Request) (*http.Response, error) {
		require.Equal(t, "api.github.com", r.URL.Host)
		require.Equal(t, "Bearer fixture-access-not-a-secret", r.Header.Get("Authorization"))
		switch r.URL.Path {
		case "/repos/author/board":
			return githubTestResponse(200, map[string]any{"id": 1, "name": "board", "full_name": "author/board", "owner": map[string]string{"login": "author"}, "html_url": "https://github.com/author/board", "default_branch": "main", "topics": []string{"hardware", "firmware"}}), nil
		case "/repos/author/board/contents/":
			return githubTestResponse(200, []map[string]string{{"name": "README.md", "path": "README.md", "type": "file"}, {"name": "board.kicad_pcb", "type": "file"}}), nil
		case "/repos/author/board/contents/README.md":
			return githubTestResponse(200, map[string]string{"encoding": "base64", "content": base64.StdEncoding.EncodeToString([]byte(readme)), "sha": "readme-revision"}), nil
		case "/repos/author/board/releases/latest":
			return githubTestResponse(404, map[string]string{}), nil
		default:
			t.Fatalf("unexpected request %s", r.URL.Path)
			return nil, nil
		}
	})
	result, err := CreatorGitHubImportDraft(context.Background(), 42, CreatorGitHubImport{Repository: "author/board"})
	require.NoError(t, err)
	assert.Equal(t, "draft", result.Work.Status)
	assert.Equal(t, "other", result.Work.Category)
	assert.Empty(t, result.Work.Cover)
	require.NotEmpty(t, result.Work.Blocks)
	assert.Equal(t, readme, result.Work.Blocks[0].Text)
	assert.Equal(t, "markdown", result.Work.Blocks[0].Type)
	assert.Contains(t, result.Signals, "hardware")
	assert.Contains(t, result.Signals, "firmware")
	assert.Contains(t, result.Warnings, "LICENSE_REVIEW")
	require.NoError(t, WithCreatorCatalog(false, func(data *CreatorCatalog) error {
		assert.Len(t, data.Works, 1)
		assert.False(t, CreatorPublic(data, data.Works[0]))
		assert.Equal(t, 42, data.Works[0].OwnerID)
		return nil
	}))
}
func TestCreatorGitHubImporterRejectsPrivateForeignAndTraversal(t *testing.T) {
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	creatorGitHubMember(t, 42)
	require.NoError(t, CreatorGitHubStore(42, creatorGitHubTestConnection()))
	useCreatorGitHubFixture(t, func(r *http.Request) (*http.Response, error) {
		return githubTestResponse(200, map[string]any{"id": 1, "private": true, "owner": map[string]string{"login": "author"}}), nil
	})
	for _, input := range []CreatorGitHubImport{{Repository: "author/private"}, {Repository: "other/project"}, {Repository: "author/project", Directory: "../secret"}, {Repository: "author/project", Directory: "nested/../../secret"}} {
		_, err := CreatorGitHubImportDraft(context.Background(), 42, input)
		require.Error(t, err)
	}
	_, err := CreatorGitHubImportDraft(context.Background(), 43, CreatorGitHubImport{Repository: "author/project"})
	assert.ErrorIs(t, err, ErrCreatorForbidden)
}
func TestCreatorGitHubSignalsKeepMixedHardwareAndSkillWithoutExpandingCategories(t *testing.T) {
	category, signals := CreatorGitHubSignals(CreatorGitHubRepository{Topics: []string{"mcp", "firmware", "robotics"}}, []githubContent{{Name: "SKILL.md"}, {Name: "board.kicad_sch"}, {Name: "case.stl"}})
	assert.Equal(t, "workflow", category)
	assert.Contains(t, signals, "skill")
	assert.Contains(t, signals, "hardware")
	assert.Contains(t, signals, "3d")
}
func TestCreatorGitHubScopesRequireEnrolledFactorAndRejectLoginSession(t *testing.T) {
	for _, scope := range []string{VerificationScopeCreatorGitHubConnect, VerificationScopeCreatorGitHubDisconnect} {
		_, err := BindVerificationOperation(VerificationOperation{Scope: scope})
		require.NoError(t, err)
		methods, err := securityVerificationPolicy(scope, model.UserVerificationState{HasPassword: true})
		require.NoError(t, err)
		assert.Equal(t, VerificationMethodPassword, methods[0].Method)
		methods, err = securityVerificationPolicy(scope, model.UserVerificationState{HasPassword: true, HasTwoFA: true})
		require.NoError(t, err)
		assert.Len(t, methods, 1)
		assert.Equal(t, VerificationMethodTwoFA, methods[0].Method)
	}
}
