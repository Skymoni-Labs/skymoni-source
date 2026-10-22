package middleware

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

var appBetaLastCleanup atomic.Int64

func AppBetaEnrollmentRateLimit() gin.HandlerFunc { return rateLimitFactory(10, 60, "APP_BETA_ENROLL") }
func AppBetaRequestRateLimit() gin.HandlerFunc    { return rateLimitFactory(120, 60, "APP_BETA_REQUEST") }

func AppBetaDeviceAuth(requirePaired bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !service.AppBetaEnabled() {
			c.AbortWithStatusJSON(503, gin.H{"success": false, "message": "App 内测接入尚未开放"})
			return
		}
		token, ok := strings.CutPrefix(c.GetHeader("Authorization"), "BetaDevice ")
		if !ok || len(token) != 43 {
			c.AbortWithStatusJSON(401, gin.H{"success": false, "message": "需要 App 设备认证"})
			return
		}
		var device model.AppBetaDevice
		err := model.DB.First(&device, "token_hash = ? AND revoked = ? AND expires_at > ?", service.AppBetaHash(token), false, time.Now().Unix()).Error
		if err != nil || (device.UserID == 0 && (requirePaired || device.PairExpires <= time.Now().Unix())) {
			c.AbortWithStatusJSON(401, gin.H{"success": false, "message": "App 会话无效或已过期"})
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10))
		if err != nil {
			c.AbortWithStatusJSON(413, gin.H{"success": false, "message": "请求内容过大"})
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(body))
		hash := sha256.Sum256(body)
		err = service.VerifyAppBetaProof(device, c.Request.Method, c.Request.URL.RequestURI(), hex.EncodeToString(hash[:]), token, c.GetHeader("X-Beta-Time"), c.GetHeader("X-Beta-Nonce"), c.GetHeader("X-Beta-Proof"))
		if err != nil {
			c.AbortWithStatusJSON(401, gin.H{"success": false, "message": "App 请求签名无效、已过期或已使用"})
			return
		}
		if err = service.CheckAppBetaRevocations(device.Serials); err != nil {
			c.AbortWithStatusJSON(403, gin.H{"success": false, "message": "设备证明不可用"})
			return
		}
		c.Set("app_beta_device", device)
		now := time.Now().Unix()
		last := appBetaLastCleanup.Load()
		if now-last > 60 && appBetaLastCleanup.CompareAndSwap(last, now) {
			model.DB.Where("expires_at < ?", now-120).Delete(&model.AppBetaNonce{})
		}
		if device.UserID > 0 {
			// Live DB checks intentionally bypass cached user status for revocation.
			user, err := model.GetUserById(device.UserID, false)
			a, betaErr := model.GetAppBetaAccount(device.UserID)
			if err != nil || user.Status != common.UserStatusEnabled || betaErr != nil || a.Status != "approved" {
				c.AbortWithStatusJSON(403, gin.H{"success": false, "message": "账号或内测资格已停用"})
				return
			}
			c.Set("id", device.UserID)
			c.Set("app_beta_user_group", user.Group)
			if requirePaired {
				cache, err := model.GetUserCache(device.UserID)
				if err != nil {
					c.AbortWithStatus(503)
					return
				}
				cache.WriteContext(c)
				common.SetContextKey(c, constant.ContextKeyUserId, device.UserID)
				common.SetContextKey(c, constant.ContextKeyUsingGroup, user.Group)
				if err := SetupContextForToken(c, &model.Token{UserId: device.UserID, Name: "app-beta", Group: user.Group, UnlimitedQuota: true}); err != nil {
					c.AbortWithStatus(503)
					return
				}
				c.Set("app_beta_authenticated", true)
			}
		}
	}
}

// Only the narrow text chat contract is exposed during beta. The original
// signed body is verified first; model/group/billing overrides are never trusted.
func AppBetaChatPolicy(c *gin.Context) {
	var body struct {
		Model    string `json:"model"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
		Stream    bool `json:"stream"`
		MaxTokens int  `json:"max_tokens"`
		Input     []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"input"`
		Instructions    string `json:"instructions"`
		MaxOutputTokens int    `json:"max_output_tokens"`
	}
	err := common.DecodeJson(c.Request.Body, &body)
	responses := strings.HasSuffix(c.Request.URL.Path, "/responses")
	protocol := "chat"
	messages := body.Messages
	limit := body.MaxTokens
	if responses {
		protocol = "responses"
		messages = body.Input
		limit = body.MaxOutputTokens
	}
	route, allowed := service.AppBetaModelRoutes(c.GetString("app_beta_user_group"))[body.Model]
	if err == nil && (!allowed || route.Protocol != protocol || len(messages) == 0 || len(messages) > 128 || limit < 1 || limit > 4096) {
		err = errors.New("模型或消息参数不在内测允许范围内")
	}
	for _, m := range messages {
		if !slices.Contains([]string{"system", "user", "assistant"}, m.Role) {
			err = errors.New("不支持的消息角色")
		}
	}
	if err != nil {
		c.AbortWithStatusJSON(400, gin.H{"success": false, "message": "请选择内测模型，输出上限须为 1–4096 tokens"})
		return
	}
	var payload any = map[string]any{"model": body.Model, "messages": body.Messages, "stream": body.Stream, "max_tokens": body.MaxTokens}
	if responses {
		payload = map[string]any{"model": body.Model, "input": body.Input, "instructions": body.Instructions, "stream": body.Stream, "max_output_tokens": body.MaxOutputTokens, "store": false}
	}
	data, err := common.Marshal(payload)
	if err != nil {
		c.AbortWithStatus(500)
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(data))
	c.Request.ContentLength = int64(len(data))
	c.Request.URL.Path = "/v1/chat/completions"
	if responses {
		c.Request.URL.Path = "/v1/responses"
		c.Set("app_beta_responses", true)
	}
	common.SetContextKey(c, constant.ContextKeyUsingGroup, route.Group)
	common.SetContextKey(c, constant.ContextKeyTokenGroup, route.Group)
	c.Request.URL.RawQuery = ""
	// Remove credential headers before relay metadata/upstream forwarding.
	c.Request.Header.Del("Authorization")
	c.Request.Header.Del("X-Beta-Proof")
	c.Request.Header.Del("X-Beta-Nonce")
	c.Request.Header.Del("X-Beta-Time")
	c.Request.Header.Set("Content-Type", "application/json")
}
