package controller

import (
	"errors"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func appAccountJSON(c *gin.Context, data any, err error) {
	if err == nil {
		c.JSON(200, gin.H{"success": true, "data": data})
		return
	}
	status, code := service.AppAccountErrorCode(err)
	message := err.Error()
	if status == 503 {
		message = "App 服务暂不可用，请稍后重试"
	}
	if status == 429 {
		c.Header("Retry-After", "5")
	}
	c.JSON(status, gin.H{"success": false, "code": code, "message": message})
}
func AppAccountAuthorize(c *gin.Context) {
	var body struct {
		Challenge  string `json:"code_challenge"`
		DeviceName string `json:"device_name"`
	}
	if c.ShouldBindJSON(&body) != nil || len([]rune(body.DeviceName)) > 80 {
		appAccountJSON(c, nil, model.ErrAppGrantInvalid)
		return
	}
	name := strings.TrimSpace(body.DeviceName)
	if name == "" {
		name = "Skivu Android"
	}
	device, code, err := service.CreateAppAccountGrant(body.Challenge, name)
	if err != nil {
		appAccountJSON(c, nil, err)
		return
	}
	// Canonical origin is fixed; a forged Host header cannot redirect login.
	uri := "https://skymoni.com/app/authorize"
	appAccountJSON(c, gin.H{"device_code": device, "user_code": code, "verification_uri": uri, "verification_uri_complete": uri + "?code=" + url.QueryEscape(code), "expires_in": 600, "interval": 5}, nil)
}
func AppAccountToken(c *gin.Context) {
	var body struct {
		Device   string `json:"device_code"`
		Verifier string `json:"code_verifier"`
	}
	if c.ShouldBindJSON(&body) != nil {
		appAccountJSON(c, nil, model.ErrAppGrantInvalid)
		return
	}
	token, session, err := service.ExchangeAppAccount(body.Device, body.Verifier, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		appAccountJSON(c, nil, err)
		return
	}
	appAccountJSON(c, gin.H{"access_token": token, "token_type": "AppAccount", "expires_at": session.ExpiresAt, "session_id": session.SID}, nil)
}
func AppAccountAuthorization(c *gin.Context) {
	code := c.Query("code")
	if len(code) != 16 {
		appAccountJSON(c, nil, model.ErrAppGrantInvalid)
		return
	}
	var grant model.AppAccountGrant
	err := model.DB.First(&grant, "code_hash = ?", service.AppBetaHash(code)).Error
	if err != nil {
		appAccountJSON(c, nil, model.ErrAppGrantInvalid)
		return
	}
	if grant.ExpiresAt <= time.Now().Unix() || grant.State == "consumed" {
		appAccountJSON(c, nil, model.ErrAppGrantExpired)
		return
	}
	appAccountJSON(c, gin.H{"user_code": code, "device_name": grant.DeviceName, "expires_at": grant.ExpiresAt, "state": grant.State}, nil)
}
func AppAccountDecide(c *gin.Context) {
	var body struct {
		Code     string `json:"user_code"`
		Decision string `json:"decision"`
	}
	if c.ShouldBindJSON(&body) != nil || len(body.Code) != 16 || (body.Decision != "approve" && body.Decision != "deny") {
		appAccountJSON(c, nil, model.ErrAppGrantInvalid)
		return
	}
	identity, _ := middleware.GetSessionAuthIdentity(c)
	appAccountJSON(c, nil, model.DecideAppAccountGrant(service.AppBetaHash(body.Code), identity.UserID, identity.UserAuthVersion, body.Decision == "approve"))
}
func AppAccountMe(c *gin.Context) {
	user := c.MustGet("app_account_user").(*model.User)
	session := c.MustGet("app_account_session").(model.AppAccountSession)
	balance, err := model.GetUserQuota(user.Id, false)
	if err != nil {
		appAccountJSON(c, nil, err)
		return
	}
	setting, err := model.GetUserSetting(user.Id, false)
	if err != nil {
		appAccountJSON(c, nil, err)
		return
	}
	subscriptions, err := model.GetAllActiveUserSubscriptions(user.Id)
	if err != nil {
		appAccountJSON(c, nil, err)
		return
	}
	items := []gin.H{}
	for _, summary := range subscriptions {
		s := summary.Subscription
		if s == nil {
			continue
		}
		var remaining any
		if s.AmountTotal > 0 {
			remaining = max(int64(0), s.AmountTotal-s.AmountUsed)
		}
		items = append(items, gin.H{"id": s.Id, "plan_id": s.PlanId, "total": s.AmountTotal, "used": s.AmountUsed, "remaining": remaining, "unlimited": s.AmountTotal == 0, "expires_at": s.EndTime, "reset_at": s.NextResetTime, "allow_wallet_overflow": s.AllowWalletOverflow})
	}
	beta, err := appAccountBetaData(user.Id)
	if err != nil {
		appAccountJSON(c, nil, err)
		return
	}
	appAccountJSON(c, gin.H{"user": gin.H{"id": user.Id, "username": user.Username, "display_name": user.DisplayName, "group": user.Group}, "wallet": gin.H{"balance": balance, "used": user.UsedQuota, "request_count": user.RequestCount}, "billing_preference": common.NormalizeBillingPreference(setting.BillingPreference), "subscriptions": items, "quota_per_unit": common.QuotaPerUnit, "currency": "USD", "beta": beta, "session": gin.H{"id": session.SID, "expires_at": session.ExpiresAt, "device_name": session.DeviceName}}, nil)
}

func appAccountBetaData(userID int) (gin.H, error) {
	a, err := model.GetAppBetaAccount(userID)
	if err != nil {
		return nil, err
	}
	enabled := service.AppAccountBetaEnabled()
	approved := a.Status == "approved"
	reason := ""
	if !approved {
		reason = "NOT_APPROVED"
	} else if !enabled {
		reason = "CHANNEL_DISABLED"
	} else if a.Balance <= 0 {
		reason = "QUOTA_EXHAUSTED"
	}
	return gin.H{"account": a, "account_approved": approved, "channel_enabled": enabled, "requires_device_proof": false, "can_chat": approved && enabled && a.Balance > 0, "blocked_reason": reason, "application_url": "https://skymoni.com/creators", "quota_per_unit": common.QuotaPerUnit}, nil
}
func AppAccountBetaStatus(c *gin.Context) {
	data, err := appAccountBetaData(c.GetInt("id"))
	appAccountJSON(c, data, err)
}
func AppAccountModels(c *gin.Context) {
	funding := c.DefaultQuery("funding", "relay")
	if funding != "relay" && funding != "beta" {
		appAccountJSON(c, nil, model.ErrAppGrantInvalid)
		return
	}
	if funding == "beta" {
		if !service.AppAccountBetaEnabled() {
			c.JSON(503, gin.H{"success": false, "code": "BETA_CHANNEL_DISABLED", "message": "账号内测通道暂未开放"})
			return
		}
		a, err := model.GetAppBetaAccount(c.GetInt("id"))
		if err != nil {
			appAccountJSON(c, nil, err)
			return
		}
		if a.Status != "approved" {
			c.JSON(403, gin.H{"success": false, "code": "BETA_NOT_APPROVED", "message": "账号内测尚未开通或已暂停"})
			return
		}
	}
	models := []string{}
	protocols := map[string]string{}
	for name, route := range service.AppAccountModelRoutes(c.GetString("app_account_user_group")) {
		models = append(models, name)
		protocols[name] = route.Protocol
	}
	slices.Sort(models)
	appAccountJSON(c, gin.H{"models": models, "model_protocols": protocols, "quota_per_unit": common.QuotaPerUnit}, nil)
}
func AppAccountLogout(c *gin.Context) {
	s := c.MustGet("app_account_session").(model.AppAccountSession)
	_, err := model.RevokeUserSession(s.UserID, s.SID, "app_logout")
	if errors.Is(err, model.ErrUserSessionInactive) {
		err = nil
	}
	appAccountJSON(c, nil, err)
}
