package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const maxPlaygroundConversationBytes = 512 << 10

type playgroundConversationRequest struct {
	Title    string          `json:"title"`
	Model    string          `json:"model"`
	Group    string          `json:"group"`
	Messages json.RawMessage `json:"messages"`
	Revision int64           `json:"revision"`
}

type playgroundStoredMessage struct {
	Key      string `json:"key"`
	From     string `json:"from"`
	Versions []struct {
		ID      string `json:"id"`
		Content string `json:"content"`
	} `json:"versions"`
	Reasoning *struct {
		Content string `json:"content"`
	} `json:"reasoning"`
}

type playgroundConversationResponse struct {
	ID        int             `json:"id"`
	Title     string          `json:"title"`
	Model     string          `json:"model"`
	Group     string          `json:"group"`
	Messages  json.RawMessage `json:"messages"`
	Revision  int64           `json:"revision"`
	CreatedAt int64           `json:"created_at"`
	UpdatedAt int64           `json:"updated_at"`
}

func playgroundConversationID(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "对话 ID 无效"})
		return 0, false
	}
	return id, true
}

func validPlaygroundTitle(title string) bool {
	return title != "" && utf8.RuneCountInString(title) <= 80 && strings.IndexFunc(title, unicode.IsControl) < 0
}

func bindPlaygroundConversation(c *gin.Context, includeTitle bool) (playgroundConversationRequest, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxPlaygroundConversationBytes)
	var request playgroundConversationRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "对话数据无效或过大"})
		return request, false
	}
	request.Title = strings.TrimSpace(request.Title)
	if includeTitle && !validPlaygroundTitle(request.Title) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "标题需为 1 到 80 个字符"})
		return request, false
	}
	if len(request.Model) > 200 || len(request.Group) > 100 || !bytes.HasPrefix(bytes.TrimSpace(request.Messages), []byte("[")) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "模型、分组或消息格式无效"})
		return request, false
	}
	var messages []playgroundStoredMessage
	if err := common.Unmarshal(request.Messages, &messages); err != nil || len(messages) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "对话最多保存 100 条有效消息"})
		return request, false
	}
	totalContent := 0
	for _, message := range messages {
		if message.Key == "" || len(message.Key) > 200 ||
			(message.From != "user" && message.From != "assistant" && message.From != "system") ||
			len(message.Versions) == 0 || len(message.Versions) > 20 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "消息内容无效"})
			return request, false
		}
		for _, version := range message.Versions {
			if version.ID == "" || len(version.ID) > 200 || len(version.Content) > 160_000 {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "消息内容过长"})
				return request, false
			}
			totalContent += len(version.Content)
		}
		if message.Reasoning != nil {
			totalContent += len(message.Reasoning.Content)
		}
		if totalContent > 400_000 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "对话内容过大"})
			return request, false
		}
	}
	return request, true
}

func playgroundConversationJSON(conversation *model.PlaygroundConversation) playgroundConversationResponse {
	return playgroundConversationResponse{
		ID: conversation.Id, Title: conversation.Title, Model: conversation.Model,
		Group: conversation.Group, Messages: json.RawMessage(conversation.Messages),
		Revision: conversation.Revision, CreatedAt: conversation.CreatedAt, UpdatedAt: conversation.UpdatedAt,
	}
}

func playgroundConversationError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrPlaygroundConversationNotFound):
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "对话不存在"})
	case errors.Is(err, model.ErrPlaygroundConversationConflict):
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "对话已在其他页面更新，请重新加载"})
	case errors.Is(err, model.ErrPlaygroundConversationLimit):
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "最多保存 50 个对话，请先删除旧对话"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "对话操作失败"})
	}
}

func ListPlaygroundConversations(c *gin.Context) {
	items, err := model.ListPlaygroundConversations(c.GetInt("id"))
	if err != nil {
		playgroundConversationError(c, err)
		return
	}
	if items == nil {
		items = []model.PlaygroundConversation{}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items})
}

func GetPlaygroundConversation(c *gin.Context) {
	id, ok := playgroundConversationID(c)
	if !ok {
		return
	}
	item, err := model.GetPlaygroundConversation(c.GetInt("id"), id)
	if err != nil {
		playgroundConversationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": playgroundConversationJSON(item)})
}

func CreatePlaygroundConversation(c *gin.Context) {
	request, ok := bindPlaygroundConversation(c, true)
	if !ok {
		return
	}
	item, err := model.CreatePlaygroundConversation(c.GetInt("id"), request.Title, request.Model, request.Group, string(request.Messages))
	if err != nil {
		playgroundConversationError(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": playgroundConversationJSON(item)})
}

func UpdatePlaygroundConversation(c *gin.Context) {
	id, ok := playgroundConversationID(c)
	if !ok {
		return
	}
	request, ok := bindPlaygroundConversation(c, false)
	if !ok {
		return
	}
	if request.Revision < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "对话版本无效"})
		return
	}
	item, err := model.UpdatePlaygroundConversation(c.GetInt("id"), id, request.Revision, request.Model, request.Group, string(request.Messages))
	if err != nil {
		playgroundConversationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": playgroundConversationJSON(item)})
}

func RenamePlaygroundConversation(c *gin.Context) {
	id, ok := playgroundConversationID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	var request struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "标题格式无效"})
		return
	}
	request.Title = strings.TrimSpace(request.Title)
	if !validPlaygroundTitle(request.Title) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "标题需为 1 到 80 个字符"})
		return
	}
	item, err := model.RenamePlaygroundConversation(c.GetInt("id"), id, request.Title)
	if err != nil {
		playgroundConversationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": playgroundConversationJSON(item)})
}

func DeletePlaygroundConversation(c *gin.Context) {
	id, ok := playgroundConversationID(c)
	if !ok {
		return
	}
	if err := model.DeletePlaygroundConversation(c.GetInt("id"), id); err != nil {
		playgroundConversationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
