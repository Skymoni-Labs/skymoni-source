package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func normalizeUserAvatar(value string) (string, error) {
	return service.NormalizeProfileAvatar(value)
}

func UpdateUserAvatar(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 200000)
	var req struct {
		Avatar *string `json:"avatar"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Avatar == nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid avatar"})
		return
	}
	value, err := normalizeUserAvatar(*req.Avatar)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	user, err := model.GetUserById(c.GetInt("id"), true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	settings := user.GetSetting()
	settings.Avatar = value
	if err = model.UpdateUserSetting(user.Id, settings); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"avatar": value}})
}
