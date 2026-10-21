package controller

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const devinChannelOAuthTTL = 5 * time.Minute

// Devin's CLI authorization flow accepts its loopback callback URI.
const devinChannelOAuthRedirectURI = "http://127.0.0.1:59653/callback"

type devinChannelOAuthStartRequest struct {
	ChannelID int      `json:"channel_id"`
	Name      string   `json:"name"`
	BaseURL   string   `json:"base_url"`
	Groups    []string `json:"groups"`
}

type devinChannelOAuthFlow struct {
	Identity  service.AuthIdentity `json:"identity"`
	Verifier  string               `json:"verifier"`
	ChannelID int                  `json:"channel_id"`
	Name      string               `json:"name"`
	BaseURL   string               `json:"base_url"`
	Group     string               `json:"group"`
	ReturnURL string               `json:"return_url"`
}

func devinChannelOAuthReturnURL(origin, serverAddress string) string {
	server, err := url.Parse(serverAddress)
	if err != nil || server.Hostname() == "" {
		return ""
	}
	result := strings.TrimRight(serverAddress, "/") + "/channels"
	frontend, err := url.Parse(origin)
	if err != nil || frontend.Hostname() != server.Hostname() || frontend.User != nil || frontend.Path != "" || frontend.RawQuery != "" || frontend.Fragment != "" || frontend.Scheme != server.Scheme {
		return result
	}
	if frontend.Host != server.Host && server.Hostname() != "localhost" && server.Hostname() != "127.0.0.1" {
		return result
	}
	return frontend.String() + "/channels"
}

func StartDevinChannelOAuth(c *gin.Context) {
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "请使用已登录的管理页面连接 Devin"})
		return
	}
	var request devinChannelOAuthStartRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请求参数无效"})
		return
	}
	flow := devinChannelOAuthFlow{Identity: identity, ChannelID: request.ChannelID}
	if request.ChannelID > 0 {
		channel, err := model.GetChannelById(request.ChannelID, false)
		if err != nil || channel.Type != constant.ChannelTypeDevinGateway {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Devin 渠道不存在"})
			return
		}
		if channel.ChannelInfo.IsMultiKey {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请为每个 Devin 账号创建单独渠道"})
			return
		}
		flow.Name, flow.BaseURL, flow.Group = channel.Name, channel.GetBaseURL(), channel.Group
	} else {
		flow.Name = strings.TrimSpace(request.Name)
		flow.BaseURL = strings.TrimRight(strings.TrimSpace(request.BaseURL), "/")
		flow.Group = strings.Join(request.Groups, ",")
		if flow.Name == "" || len(flow.Name) > 128 || len(flow.Group) > 64 || flow.Group == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请先填写渠道名称和分组"})
			return
		}
		for _, group := range request.Groups {
			if strings.TrimSpace(group) != group || group == "" || strings.Contains(group, ",") {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "渠道分组无效"})
				return
			}
		}
	}
	baseURL, err := url.Parse(flow.BaseURL)
	if err != nil || (baseURL.Scheme != "http" && baseURL.Scheme != "https") || baseURL.Host == "" || baseURL.User != nil || baseURL.RawQuery != "" || baseURL.Fragment != "" || (baseURL.Path != "" && baseURL.Path != "/") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "网关地址必须是 HTTP(S) 地址，且不能包含 /v1"})
		return
	}
	serverAddress := strings.TrimRight(system_setting.ServerAddress, "/")
	flow.ReturnURL = devinChannelOAuthReturnURL(c.GetHeader("Origin"), serverAddress)
	if flow.ReturnURL == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "请先配置正确的系统服务地址"})
		return
	}
	verifierBytes := make([]byte, 32)
	if _, err := rand.Read(verifierBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "无法启动 Devin 登录"})
		return
	}
	flow.Verifier = base64.RawURLEncoding.EncodeToString(verifierBytes)
	payload, err := common.Marshal(flow)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "无法启动 Devin 登录"})
		return
	}
	state, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose: model.AuthFlowPurposeDevinChannel, Provider: "devin", UserId: identity.UserID,
		SessionId: identity.SessionID, Payload: string(payload), ExpiresAt: time.Now().Add(devinChannelOAuthTTL),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "无法启动 Devin 登录"})
		return
	}
	challenge := sha256.Sum256([]byte(flow.Verifier))
	query := url.Values{
		"redirect_uri": {devinChannelOAuthRedirectURI}, "state": {state}, "prompt": {"select_account"},
		"code_challenge": {base64.RawURLEncoding.EncodeToString(challenge[:])}, "code_challenge_method": {"S256"},
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"authorization_url": "https://app.devin.ai/auth/cli/continue?" + query.Encode()}})
}

func exchangeDevinChannelOAuthCode(ctx context.Context, code, verifier string) (string, error) {
	requestBody, err := common.Marshal(gin.H{"code": code, "code_verifier": verifier})
	if err != nil {
		return "", err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.devin.ai/auth/cli/token", bytes.NewReader(requestBody))
	if err != nil {
		return "", err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("Devin token exchange failed with status %d", response.StatusCode)
	}
	var result struct {
		Token string `json:"token"`
	}
	if err := common.DecodeJson(io.LimitReader(response.Body, 32<<10), &result); err != nil {
		return "", err
	}
	if strings.TrimSpace(result.Token) == "" {
		return "", errors.New("Devin token exchange returned no token")
	}
	return strings.TrimSpace(result.Token), nil
}

func CompleteDevinChannelOAuth(c *gin.Context) {
	if c.Query("error") != "" || c.Query("code") == "" || len(c.Query("code")) > 4096 || len(c.Query("state")) > 256 {
		c.String(http.StatusBadRequest, "Devin 登录未完成，请返回渠道页面重试")
		return
	}
	state := c.Query("state")
	match := model.AuthFlowMatch{Purpose: model.AuthFlowPurposeDevinChannel, Provider: "devin"}
	pending, err := model.GetAuthFlow(state, match)
	if err != nil {
		c.String(http.StatusForbidden, "Devin 登录状态无效或已过期")
		return
	}
	var flow devinChannelOAuthFlow
	if err := common.Unmarshal([]byte(pending.Payload), &flow); err != nil || flow.Identity.UserID != pending.UserId || flow.Identity.SessionID != pending.SessionId {
		c.String(http.StatusForbidden, "Devin 登录状态无效")
		return
	}
	_, user, err := service.ValidateLoginSession(flow.Identity)
	if err != nil || user == nil || !authz.Can(flow.Identity.UserID, user.Role, authz.ChannelSensitiveWrite) {
		c.String(http.StatusForbidden, "登录会话已失效或无渠道管理权限")
		return
	}
	token, err := exchangeDevinChannelOAuthCode(c.Request.Context(), c.Query("code"), flow.Verifier)
	if err != nil {
		c.String(http.StatusBadGateway, "Devin 登录凭证获取失败，请重试")
		return
	}
	preview := &model.Channel{Type: constant.ChannelTypeDevinGateway, Key: token, BaseURL: &flow.BaseURL}
	models, err := fetchChannelUpstreamModelIDs(preview)
	if err != nil || len(models) == 0 {
		c.String(http.StatusBadGateway, "Devin 登录成功，但网关模型获取失败，请检查网关地址后重试")
		return
	}
	supported := false
	for _, group := range strings.Split(flow.Group, ",") {
		for _, modelName := range models {
			if model.BusinessGroupSupportsModel(group, modelName) {
				supported = true
				break
			}
		}
	}
	if !supported {
		c.String(http.StatusBadRequest, "所选分组不支持此 Devin 账号的模型，请返回渠道页面重试")
		return
	}
	channel := model.Channel{
		Type: constant.ChannelTypeDevinGateway, Key: token, Name: flow.Name,
		BaseURL: &flow.BaseURL, Group: flow.Group, Models: strings.Join(models, ","),
		Status: common.ChannelStatusManuallyDisabled, CreatedTime: common.GetTimestamp(),
	}
	if err := validateChannel(&channel, true); err != nil {
		c.String(http.StatusBadRequest, "Devin 渠道配置无效，请重试")
		return
	}
	_, err = model.ConsumeAuthFlowWithAction(state, model.AuthFlowMatch{
		Purpose: model.AuthFlowPurposeDevinChannel, Provider: "devin", UserId: flow.Identity.UserID, SessionId: flow.Identity.SessionID,
	}, func(tx *gorm.DB, _ *model.AuthFlow) error {
		if err := model.ValidateAuthSessionWithTx(tx, flow.Identity); err != nil {
			return err
		}
		if flow.ChannelID > 0 {
			var existing model.Channel
			if err := tx.Where("id = ? AND type = ?", flow.ChannelID, constant.ChannelTypeDevinGateway).First(&existing).Error; err != nil {
				return err
			}
			channel.Id = existing.Id
			if err := tx.Model(&existing).Updates(map[string]any{"key": token, "models": channel.Models}).Error; err != nil {
				return err
			}
			existing.Models = channel.Models
			return existing.UpdateAbilities(tx)
		}
		if err := tx.Create(&channel).Error; err != nil {
			return err
		}
		return channel.AddAbilities(tx)
	})
	if err != nil {
		c.String(http.StatusConflict, "Devin 渠道保存失败，请重试")
		return
	}
	model.InitChannelCache()
	c.Set("id", flow.Identity.UserID)
	c.Set("role", user.Role)
	c.Set("username", user.Username)
	action := "channel.create"
	if flow.ChannelID > 0 {
		action = "channel.update"
	}
	recordManageAudit(c, action, map[string]any{"id": channel.Id, "name": channel.Name, "type": channel.Type, "auth": "devin_oauth"})
	c.Redirect(http.StatusSeeOther, flow.ReturnURL)
}
