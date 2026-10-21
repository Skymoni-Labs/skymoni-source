package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"strconv"
)

func AdminCreatorStatus(c *gin.Context) {
	if c.GetInt("role") != common.RoleRootUser {
		c.JSON(403, gin.H{"success": false, "message": "仅站点管理员可以封禁或解封创作者"})
		return
	}
	uid, err := strconv.Atoi(c.Param("id"))
	if err != nil || uid <= 0 {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	user, err := model.GetUserById(uid, false)
	if err != nil || user.Status != common.UserStatusEnabled {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	var body struct {
		Suspended      *bool  `json:"suspended"`
		ExpectedStatus string `json:"expectedStatus"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if body.Suspended == nil {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	status, err := service.SetCreatorSuspended(uid, c.GetInt("id"), *body.Suspended, body.ExpectedStatus)
	if err != nil {
		creatorError(c, err)
		return
	}
	recordUserSecurityAudit(c, uid, "creator.status", map[string]any{"suspended": *body.Suspended, "actor_id": c.GetInt("id")})
	c.JSON(200, gin.H{"success": true, "data": gin.H{"status": status}})
}
