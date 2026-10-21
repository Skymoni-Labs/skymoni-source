package controller

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const dripTestRedirect = "http://127.0.0.1:49153/callback"
const dripTestVerifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"

func authorizeDripForTest(t *testing.T, identity service.AuthIdentity, redirect string) string {
	t.Helper()
	digest := sha256.Sum256([]byte(dripTestVerifier))
	challenge := base64.RawURLEncoding.EncodeToString(digest[:])
	body, err := json.Marshal(map[string]string{
		"client_id": dripClientID, "redirect_uri": redirect,
		"code_challenge": challenge, "code_challenge_method": "S256",
	})
	require.NoError(t, err)
	response := securityEnrollmentRequest(http.MethodPost, "/api/drip/authorize", string(body), "", identity, StartDripAuthorization)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var result struct {
		Data struct {
			Code string `json:"code"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &result))
	require.NotEmpty(t, result.Data.Code)
	return result.Data.Code
}

func exchangeDripForTest(t *testing.T, code, verifier, redirect string) (int, map[string]any) {
	t.Helper()
	body, err := json.Marshal(map[string]string{
		"client_id": dripClientID, "code": code,
		"code_verifier": verifier, "redirect_uri": redirect,
	})
	require.NoError(t, err)
	response := securityEnrollmentRequest(http.MethodPost, "/api/drip/token", string(body), "", service.AuthIdentity{}, ExchangeDripAuthorization)
	var result map[string]any
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &result))
	return response.Code, result
}

func setupDripIdentityTest(t *testing.T) (*model.User, service.AuthIdentity) {
	t.Helper()
	user, identity := setupSecurityEnrollmentTest(t)
	logDB := model.LOG_DB
	t.Cleanup(func() {
		connection, err := logDB.DB()
		if err == nil {
			_ = connection.Close()
		}
	})
	return user, identity
}

func TestDripAuthorizationPKCESingleUseAndSessionBinding(t *testing.T) {
	user, identity := setupDripIdentityTest(t)
	code := authorizeDripForTest(t, identity, dripTestRedirect)
	status, _ := exchangeDripForTest(t, code, dripTestVerifier, "http://127.0.0.1:49154/callback")
	assert.Equal(t, http.StatusBadRequest, status)
	status, _ = exchangeDripForTest(t, code, dripTestVerifier+"wrong", dripTestRedirect)
	assert.Equal(t, http.StatusBadRequest, status)
	status, result := exchangeDripForTest(t, code, dripTestVerifier, dripTestRedirect)
	require.Equal(t, http.StatusOK, status)
	data, ok := result["data"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, strconv.Itoa(user.Id), data["sub"])
	status, _ = exchangeDripForTest(t, code, dripTestVerifier, dripTestRedirect)
	assert.Equal(t, http.StatusBadRequest, status)
}

func TestDripAuthorizationRejectsRevokedSessionAndInvalidLoopback(t *testing.T) {
	_, identity := setupDripIdentityTest(t)
	for _, redirect := range []string{
		"https://127.0.0.1:49153/callback", "http://localhost:49153/callback",
		"http://127.0.0.1:49153/other", "http://127.0.0.1:49153/callback?next=https://evil.example",
	} {
		assert.False(t, validDripRedirect(redirect))
	}
	code := authorizeDripForTest(t, identity, dripTestRedirect)
	require.NoError(t, model.DB.Model(&model.UserSession{}).Where("sid = ?", identity.SessionID).Update("status", model.UserSessionStatusRevoked).Error)
	status, _ := exchangeDripForTest(t, code, dripTestVerifier, dripTestRedirect)
	assert.Equal(t, http.StatusBadRequest, status)
}

func TestDripAuthorizationRequiresBrowserSession(t *testing.T) {
	_, _ = setupDripIdentityTest(t)
	digest := sha256.Sum256([]byte(dripTestVerifier))
	body, err := json.Marshal(map[string]string{
		"client_id": dripClientID, "redirect_uri": dripTestRedirect,
		"code_challenge":        base64.RawURLEncoding.EncodeToString(digest[:]),
		"code_challenge_method": "S256",
	})
	require.NoError(t, err)
	response := securityEnrollmentRequest(http.MethodPost, "/api/drip/authorize", string(body), "", service.AuthIdentity{UserID: 1}, StartDripAuthorization)
	assert.Equal(t, http.StatusForbidden, response.Code)
}

func TestDripAuthorizationTransfersOnlyAvatarProfile(t *testing.T) {
	user, identity := setupDripIdentityTest(t)
	setting := user.GetSetting()
	setting.Avatar = "data:image/jpeg;base64,/9j/2Q=="
	require.NoError(t, model.UpdateUserSetting(user.Id, setting))
	code := authorizeDripForTest(t, identity, dripTestRedirect)
	status, result := exchangeDripForTest(t, code, dripTestVerifier, dripTestRedirect)
	require.Equal(t, http.StatusOK, status)
	data, ok := result["data"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, setting.Avatar, data["avatar"])
	assert.NotContains(t, data, "setting")
	assert.NotContains(t, data, "email")
}
