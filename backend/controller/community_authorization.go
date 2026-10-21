package controller

import (
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/url"
	"path"
	"strings"
	"unicode"
)

func communityReturn(raw string) bool {
	if raw == "" || len(raw) > 1000 || strings.Contains(raw, "\\") || strings.IndexFunc(raw, unicode.IsSpace) >= 0 || strings.IndexFunc(raw, unicode.IsControl) >= 0 {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || u.IsAbs() || u.Host != "" {
		return false
	}
	p := u.Path
	return !strings.Contains(p, "\\") && strings.IndexFunc(p, unicode.IsControl) < 0 && (p == "/creators" || strings.HasPrefix(p, "/creators/")) && (path.Clean(p) == "/creators" || strings.HasPrefix(path.Clean(p), "/creators/"))
}
func AuthorizeCommunityLogin(c *gin.Context) {
	identity, ok := requireBrowserSession(c)
	if !ok {
		return
	}
	var body struct {
		Approved bool   `json:"approved"`
		UserID   int    `json:"userId"`
		ReturnTo string `json:"returnTo"`
	}
	if c.ShouldBindJSON(&body) != nil || !body.Approved || !communityReturn(body.ReturnTo) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请确认授权并检查社区返回地址"})
		return
	}
	if body.UserID != identity.UserID {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "账号已变化，请重新确认"})
		return
	}
	user, err := model.GetSelfUserById(identity.UserID)
	if err != nil {
		writeAuthSessionError(c, err)
		return
	}
	if err := model.AdmitCommunity(identity.UserID, c.GetHeader("X-Skymoni-Community-Invite")); err != nil {
		communityAccessError(c, err)
		return
	}
	bundle, err := service.CreateLoginSessionAtAuthVersion(identity.UserID, identity.UserAuthVersion, "community:relay-authorization", c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		writeAuthSessionError(c, err)
		return
	}
	c.Set("community_scope", true)
	service.WriteRefreshCookie(c, bundle.RefreshToken)
	setAuthNoStore(c)
	recordUserSecurityAudit(c, identity.UserID, "user.community_authorize", map[string]any{"scope": "community", "success": true})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"returnTo": body.ReturnTo, "bundle": gin.H{"access_token": bundle.AccessToken, "token_type": bundle.TokenType, "access_expires_at": bundle.AccessExpiresAt, "session": bundle.Session, "user": buildSelfUserData(user)}}})
}
