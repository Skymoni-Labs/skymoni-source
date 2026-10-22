package middleware

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func AppAccountAuthorizationRateLimit() gin.HandlerFunc {
	return rateLimitFactory(10, 60, "APP_ACCOUNT_AUTHORIZE")
}
func AppAccountPollRateLimit() gin.HandlerFunc { return rateLimitFactory(30, 60, "APP_ACCOUNT_POLL") }
func AppAccountRequestRateLimit() gin.HandlerFunc {
	return rateLimitFactory(120, 60, "APP_ACCOUNT_REQUEST")
}
func AppUpdateDownloadRateLimit() gin.HandlerFunc {
	return rateLimitFactory(6, 60, "APP_UPDATE_DOWNLOAD")
}

func AppAccountAuth(relay bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, ok := strings.CutPrefix(c.GetHeader("Authorization"), "AppAccount ")
		if !ok {
			c.AbortWithStatusJSON(401, gin.H{"success": false, "code": "APP_SESSION_INVALID", "message": "请在 App 中登录中转站账号"})
			return
		}
		native, user, err := service.ValidateAppAccount(token)
		if err != nil {
			c.AbortWithStatusJSON(401, gin.H{"success": false, "code": "APP_SESSION_INVALID", "message": "App 会话已失效，请重新登录"})
			return
		}
		c.Set("app_account_session", *native)
		c.Set("app_account_user", user)
		c.Set("id", user.Id)
		c.Set("app_account_user_group", user.Group)
		if !relay {
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10))
		if err != nil {
			c.AbortWithStatusJSON(413, gin.H{"success": false, "code": "REQUEST_TOO_LARGE", "message": "聊天内容不能超过 256 KiB"})
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(body))
		cache, err := model.GetUserCache(user.Id)
		if err != nil {
			c.AbortWithStatus(http.StatusServiceUnavailable)
			return
		}
		cache.WriteContext(c)
		common.SetContextKey(c, constant.ContextKeyUserId, user.Id)
		common.SetContextKey(c, constant.ContextKeyUsingGroup, user.Group)
		if err := SetupContextForToken(c, &model.Token{UserId: user.Id, Name: "Skivu App", Group: user.Group, UnlimitedQuota: true}); err != nil {
			c.AbortWithStatus(503)
			return
		}
		c.Set("app_account_authenticated", true)
	}
}

func AppAccountBrowserSession(c *gin.Context) {
	identity, ok := GetSessionAuthIdentity(c)
	if !ok || service.IsCommunityRequest(c) {
		c.AbortWithStatusJSON(403, gin.H{"success": false, "code": "BROWSER_SESSION_REQUIRED", "message": "请使用中转站网页登录会话确认"})
		return
	}
	session, err := model.GetUserSessionBySID(identity.SessionID)
	if err != nil || service.CommunitySession(session.LoginMethod) || session.LoginMethod == "skivu_app" || session.Status != model.UserSessionStatusActive || session.RevokedAt != 0 || session.ExpiresAt <= time.Now().Unix() || session.UserAuthVersion != identity.UserAuthVersion || session.Version != identity.SessionVersion {
		c.AbortWithStatusJSON(403, gin.H{"success": false, "code": "BROWSER_SESSION_REQUIRED", "message": "请在网站完成登录"})
	}
}
