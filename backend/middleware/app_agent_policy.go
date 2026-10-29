package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// This route is development-only until its account, model-publication,
// funding, relay and streaming integration tests pass. It does not execute
// tools: it only forwards their definitions and conversation records.
func AppAccountAgentChatPolicy(c *gin.Context) {
	if !c.GetBool("app_account_authenticated") {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10))
	var modelField struct {
		Model string `json:"model"`
	}
	if err == nil && json.Unmarshal(data, &modelField) == nil && modelField.Model != "" {
		published, policyErr := model.IsModelPublished(modelField.Model)
		if policyErr != nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"success": false, "code": "model_policy_unavailable", "message": i18n.T(c, i18n.MsgDistributorModelPolicyUnavailable)})
			return
		}
		if !published {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"success": false, "code": "model_not_available", "message": i18n.T(c, i18n.MsgDistributorModelUnavailable, map[string]any{"Model": modelField.Model})})
			return
		}
	}
	payload, parseErr := parseAppAgentPayload(data)
	routes := service.AppAccountModelRoutes(c.GetString("app_account_user_group"))
	route, allowed := routes[payload.Model]
	if err != nil || parseErr != nil || !allowed || route.Protocol != "chat" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"success": false, "code": "INVALID_REQUEST", "message": "请选择支持工具调用的可用聊天模型，检查消息和输出上限。"})
		return
	}
	canonical, err := json.Marshal(payload)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(canonical))
	c.Request.ContentLength = int64(len(canonical))
	c.Request.URL.Path = "/v1/chat/completions"
	c.Request.URL.RawQuery = ""
	common.SetContextKey(c, constant.ContextKeyUsingGroup, route.Group)
	common.SetContextKey(c, constant.ContextKeyTokenGroup, route.Group)
	c.Request.Header.Del("Authorization")
	c.Request.Header.Set("Content-Type", "application/json")
}
