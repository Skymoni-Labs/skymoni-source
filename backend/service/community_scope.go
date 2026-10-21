package service

import (
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"strings"
)

const CommunityScopeHeader = "X-Skymoni-Auth-Scope"

func IsCommunityRequest(c *gin.Context) bool {
	return c.GetBool("community_scope") || c.GetHeader(CommunityScopeHeader) == "community"
}
func ScopedRefreshCookieName(c *gin.Context) string {
	if IsCommunityRequest(c) {
		return "skymoni_community_refresh"
	}
	return RefreshCookieName
}
func ScopedSessionHintCookieName(c *gin.Context) string {
	if IsCommunityRequest(c) {
		return "skymoni_community_has_session"
	}
	return SessionHintCookieName
}
func CommunitySession(method string) bool { return strings.HasPrefix(method, "community:") }
func CommunityEndpoint(method, path string) bool {
	if strings.HasPrefix(path, "/api/creators/") || path == "/api/creators" {
		return true
	}
	if path == "/api/user/self" {
		return method == "GET" || method == "PUT"
	}
	if path == "/api/user/self/avatar" {
		return method == "PUT"
	}
	return false
}
func SessionMatchesScope(c *gin.Context, session *model.UserSession) bool {
	if session == nil || CommunitySession(session.LoginMethod) != IsCommunityRequest(c) {
		return false
	}
	return !IsCommunityRequest(c) || CommunityEndpoint(c.Request.Method, c.Request.URL.Path)
}
func ValidateRefreshScope(c *gin.Context, raw string) error {
	sid, _, ok := splitRefreshToken(raw)
	if !ok {
		return ErrRefreshTokenInvalid
	}
	session, err := model.GetUserSessionCached(sid)
	if err != nil {
		return ErrRefreshTokenInvalid
	}
	if CommunitySession(session.LoginMethod) != IsCommunityRequest(c) {
		return ErrAuthTokenInvalid
	}
	return nil
}
