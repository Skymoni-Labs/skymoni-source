package controller

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/url"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const creatorGitHubProvider = "creator-github"

type creatorGitHubFlow struct {
	Verifier      string                       `json:"verifier"`
	Authorization *model.AuthFlowAuthorization `json:"authorization"`
}

func creatorGitHubError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrCreatorGitHubConfig):
		c.JSON(503, gin.H{"success": false, "code": "CREATOR_GITHUB_UNCONFIGURED", "message": "GitHub 授权应用尚未配置，请联系管理员"})
	case errors.Is(err, service.ErrCreatorGitHubReconnect):
		c.JSON(409, gin.H{"success": false, "code": "CREATOR_GITHUB_RECONNECT", "message": "GitHub 授权已过期或被撤销，请重新连接"})
	case errors.Is(err, service.ErrCreatorGitHubRate):
		c.JSON(429, gin.H{"success": false, "code": "CREATOR_GITHUB_RATE_LIMIT", "message": "GitHub 请求次数已达上限，请稍后重试"})
	case errors.Is(err, service.ErrCreatorGitHubRemote):
		c.JSON(502, gin.H{"success": false, "message": "暂时无法读取 GitHub，请稍后重试"})
	case errors.Is(err, model.ErrAuthFlowInvalid), errors.Is(err, model.ErrAuthFlowExpired), errors.Is(err, model.ErrAuthFlowConsumed):
		c.JSON(403, gin.H{"success": false, "code": "CREATOR_GITHUB_FLOW_INVALID", "message": "授权请求已过期、已使用或登录账号已变化，请重新连接"})
	default:
		creatorError(c, err)
	}
}
func creatorGitHubIdentity(c *gin.Context) (service.AuthIdentity, bool) {
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		c.JSON(401, gin.H{"success": false, "message": "请使用中转站账户登录后再连接 GitHub"})
		return identity, false
	}
	err := service.WithCreatorCatalog(false, func(data *service.CreatorCatalog) error {
		if !service.CreatorActive(data, identity.UserID) {
			return service.ErrCreatorForbidden
		}
		return nil
	})
	if err != nil {
		creatorError(c, err)
		return identity, false
	}
	return identity, true
}
func CreatorGitHubStatus(c *gin.Context) {
	identity, ok := creatorGitHubIdentity(c)
	if !ok {
		return
	}
	status, err := service.CreatorGitHubGetStatus(identity.UserID)
	if err != nil {
		creatorGitHubError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": status})
}
func CreatorGitHubStart(c *gin.Context) {
	identity, ok := creatorGitHubIdentity(c)
	if !ok {
		return
	}
	config, err := service.CreatorGitHubConfiguration()
	if err != nil {
		creatorGitHubError(c, err)
		return
	}
	authorization := middleware.RequireSecurityProof(c, service.VerificationOperation{Scope: service.VerificationScopeCreatorGitHubConnect})
	if authorization == nil {
		return
	}
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		creatorError(c, err)
		return
	}
	verifier := base64.RawURLEncoding.EncodeToString(raw)
	payload, err := common.Marshal(creatorGitHubFlow{Verifier: verifier, Authorization: authorization})
	if err != nil {
		creatorError(c, err)
		return
	}
	state, _, err := model.CreateAuthFlow(model.AuthFlowCreate{Purpose: model.AuthFlowPurposeOAuth, Provider: creatorGitHubProvider, Intent: model.AuthFlowIntentBind, UserId: identity.UserID, SessionId: identity.SessionID, Payload: string(payload), ExpiresAt: time.Now().Add(10 * time.Minute)})
	if err != nil {
		creatorError(c, err)
		return
	}
	hash := sha256.Sum256([]byte(verifier))
	params := url.Values{"client_id": {config.ClientID}, "redirect_uri": {config.Callback}, "state": {state}, "code_challenge": {base64.RawURLEncoding.EncodeToString(hash[:])}, "code_challenge_method": {"S256"}, "scope": {"offline_access"}, "allow_signup": {"false"}, "prompt": {"select_account"}}
	recordUserSecurityAudit(c, identity.UserID, "creator.github.start", nil)
	c.JSON(200, gin.H{"success": true, "data": gin.H{"authorizationUrl": "https://github.com/login/oauth/authorize?" + params.Encode()}})
}
func CreatorGitHubCallback(c *gin.Context) {
	identity, ok := creatorGitHubIdentity(c)
	if !ok {
		return
	}
	var body struct {
		Code   string `json:"code"`
		State  string `json:"state"`
		Denied bool   `json:"denied"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if len(body.State) != 43 || len(body.Code) > 512 || (!body.Denied && body.Code == "") {
		creatorGitHubError(c, model.ErrAuthFlowInvalid)
		return
	}
	match := model.AuthFlowMatch{Purpose: model.AuthFlowPurposeOAuth, Provider: creatorGitHubProvider, Intent: model.AuthFlowIntentBind, UserId: identity.UserID, SessionId: identity.SessionID}
	pending, err := model.GetAuthFlow(body.State, match)
	if err != nil {
		creatorGitHubError(c, err)
		return
	}
	var payload creatorGitHubFlow
	if common.UnmarshalJsonStr(pending.Payload, &payload) != nil || len(payload.Verifier) != 43 {
		creatorGitHubError(c, model.ErrAuthFlowInvalid)
		return
	}
	if err = service.ValidateFlowAuthorization(identity, service.VerificationOperation{Scope: service.VerificationScopeCreatorGitHubConnect}, payload.Authorization); err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	// Consume before exchanging: failed/denied requests cannot be replayed.
	if _, err = model.ConsumeAuthFlow(body.State, match); err != nil {
		creatorGitHubError(c, err)
		return
	}
	if body.Denied {
		c.JSON(200, gin.H{"success": true, "data": gin.H{"cancelled": true}})
		return
	}
	connection, err := service.CreatorGitHubExchange(c.Request.Context(), body.Code, payload.Verifier)
	if err != nil {
		recordUserSecurityAudit(c, identity.UserID, "creator.github.failure", nil)
		creatorGitHubError(c, err)
		return
	}
	// Recheck the authoritative session after the external call as well.
	if err = service.ValidateFlowAuthorization(identity, service.VerificationOperation{Scope: service.VerificationScopeCreatorGitHubConnect}, payload.Authorization); err != nil {
		writeSecurityOperationError(c, err)
		return
	}
	if err = service.CreatorGitHubStore(identity.UserID, connection); err != nil {
		creatorGitHubError(c, err)
		return
	}
	recordUserSecurityAudit(c, identity.UserID, "creator.github.connected", map[string]any{"github_id": connection.ID})
	c.JSON(200, gin.H{"success": true, "data": gin.H{"cancelled": false}})
}
func CreatorGitHubDisconnect(c *gin.Context) {
	identity, ok := creatorGitHubIdentity(c)
	if !ok {
		return
	}
	if middleware.RequireSecurityProof(c, service.VerificationOperation{Scope: service.VerificationScopeCreatorGitHubDisconnect}) == nil {
		return
	}
	revoked, err := service.CreatorGitHubDisconnect(c.Request.Context(), identity.UserID)
	if err != nil {
		creatorGitHubError(c, err)
		return
	}
	recordUserSecurityAudit(c, identity.UserID, "creator.github.disconnected", map[string]any{"remote_revoked": revoked})
	c.JSON(200, gin.H{"success": true, "data": gin.H{"remoteRevoked": revoked}})
}
func CreatorGitHubRepositories(c *gin.Context) {
	identity, ok := creatorGitHubIdentity(c)
	if !ok {
		return
	}
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	repos, err := service.CreatorGitHubRepositories(c.Request.Context(), identity.UserID, page)
	if err != nil {
		creatorGitHubError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": repos})
}
func CreatorGitHubImport(c *gin.Context) {
	identity, ok := creatorGitHubIdentity(c)
	if !ok {
		return
	}
	var body service.CreatorGitHubImport
	if !creatorDecode(c, &body) {
		return
	}
	result, err := service.CreatorGitHubImportDraft(c.Request.Context(), identity.UserID, body)
	if err != nil {
		creatorGitHubError(c, err)
		return
	}
	recordUserSecurityAudit(c, identity.UserID, "creator.github.import", map[string]any{"project_id": result.Work.ID})
	c.JSON(200, gin.H{"success": true, "data": result})
}
