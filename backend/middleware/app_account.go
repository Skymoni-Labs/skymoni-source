package middleware

import (
	"bytes"
	"encoding/json"
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
		if !securityProtectionAuthorize(c, user.Id) {
			return
		}
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

// Native account beta is a separately authorized account-eligibility channel.
// It neither changes nor calls the legacy hardware-attested BetaDevice API.
// Explicit beta requests are never silently charged to the relay wallet.
func AppAccountFunding(c *gin.Context) {
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10))
	if err != nil {
		c.AbortWithStatusJSON(413, gin.H{"success": false, "code": "REQUEST_TOO_LARGE", "message": "聊天内容不能超过 256 KiB"})
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	var fields map[string]json.RawMessage
	funding := "relay"
	if json.Unmarshal(body, &fields) != nil || fields == nil {
		c.AbortWithStatusJSON(400, gin.H{"success": false, "code": "INVALID_REQUEST", "message": "资金来源无效"})
		return
	}
	if raw, present := fields["funding"]; present {
		if json.Unmarshal(raw, &funding) != nil || (funding != "relay" && funding != "beta") || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			c.AbortWithStatusJSON(400, gin.H{"success": false, "code": "INVALID_REQUEST", "message": "资金来源无效"})
			return
		}
	}
	if funding != "beta" {
		return
	}
	if !service.AppAccountBetaEnabled() {
		c.AbortWithStatusJSON(503, gin.H{"success": false, "code": "BETA_CHANNEL_DISABLED", "message": "账号内测通道暂未开放"})
		return
	}
	a, err := model.GetAppBetaAccount(c.GetInt("id"))
	if err != nil {
		c.AbortWithStatusJSON(503, gin.H{"success": false, "code": "APP_SERVICE_UNAVAILABLE", "message": "无法读取内测资格"})
		return
	}
	if a.Status != "approved" {
		c.AbortWithStatusJSON(403, gin.H{"success": false, "code": "BETA_NOT_APPROVED", "message": "账号内测尚未开通或已暂停"})
		return
	}
	if a.Balance <= 0 {
		c.AbortWithStatusJSON(403, gin.H{"success": false, "code": "BETA_QUOTA_EXHAUSTED", "message": "内测额度不足，请等待管理员分配"})
		return
	}
	c.Set("app_account_beta_authenticated", true)
}
