package controller

import (
	"errors"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"net/http"
	"strings"
	"time"
)

func communityAccessError(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	message := "社区准入服务暂不可用，请稍后重试"
	if errors.Is(err, model.ErrCommunityRedemption) || errors.Is(err, model.ErrCommunityInvite) {
		status = http.StatusForbidden
		message = err.Error()
	}
	if errors.Is(err, model.ErrCommunityAccessConflict) {
		status = http.StatusConflict
		message = err.Error()
	}
	c.JSON(status, gin.H{"success": false, "message": message})
}
func GetCommunityAccessPolicy(c *gin.Context) {
	p, err := model.CommunityPolicy(model.DB)
	if err != nil {
		communityAccessError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(200, gin.H{"success": true, "data": p})
}
func ManageCommunityAccess(c *gin.Context) {
	if c.GetInt("role") != 100 {
		c.JSON(403, gin.H{"success": false, "message": "仅站点管理员可以管理社区准入"})
		return
	}
	if c.Request.Method == "GET" {
		p, err := model.CommunityPolicy(model.DB)
		if err != nil {
			communityAccessError(c, err)
			return
		}
		invites := []model.CommunityInvite{}
		if err = model.DB.Order("created_at desc").Limit(200).Find(&invites).Error; err != nil {
			communityAccessError(c, err)
			return
		}
		c.JSON(200, gin.H{"success": true, "data": gin.H{"policy": p, "invites": invites}})
		return
	}
	var body struct {
		Action                  string `json:"action"`
		CreatorApplicationsOpen *bool  `json:"creatorApplicationsOpen"`
		RedemptionRequired      *bool  `json:"redemptionRequired"`
		InviteRequired          *bool  `json:"inviteRequired"`
		Revision                int64  `json:"revision"`
		Label                   string `json:"label"`
		MaxUses                 int    `json:"maxUses"`
		Days                    int    `json:"days"`
		ID                      string `json:"id"`
		Disabled                *bool  `json:"disabled"`
	}
	if c.ShouldBindJSON(&body) != nil {
		c.JSON(400, gin.H{"success": false, "message": "参数无效"})
		return
	}
	switch body.Action {
	case "policy":
		if body.RedemptionRequired == nil || body.InviteRequired == nil {
			c.JSON(400, gin.H{"success": false, "message": "请提供两个开关的状态"})
			return
		}
		old, err := model.CommunityPolicy(model.DB)
		if err != nil {
			communityAccessError(c, err)
			return
		}
		open := old.CreatorApplicationsOpen
		if body.CreatorApplicationsOpen != nil {
			open = *body.CreatorApplicationsOpen
		}
		p, err := model.SetCommunityPolicy(*body.RedemptionRequired, *body.InviteRequired, body.Revision, open)
		if err != nil {
			communityAccessError(c, err)
			return
		}
		recordUserSecurityAudit(c, c.GetInt("id"), "community.policy", map[string]any{"redemption_required": p.RedemptionRequired, "invite_required": p.InviteRequired, "creator_applications_open": p.CreatorApplicationsOpen})
		c.JSON(200, gin.H{"success": true, "data": p})
	case "invite":
		if body.Days < 1 || body.Days > 365 || body.MaxUses < 1 || body.MaxUses > 100 || len(body.Label) > 80 {
			c.JSON(400, gin.H{"success": false, "message": "次数需为1–100，有效期需为1–365天"})
			return
		}
		invite, code, err := model.NewCommunityInvite(c.GetInt("id"), body.Label, body.MaxUses, time.Now().Add(time.Duration(body.Days)*24*time.Hour).Unix())
		if err != nil {
			communityAccessError(c, err)
			return
		}
		recordUserSecurityAudit(c, c.GetInt("id"), "community.invite_create", map[string]any{"invite_id": invite.ID})
		c.JSON(200, gin.H{"success": true, "data": gin.H{"invite": invite, "code": code}})
	case "disable":
		if len(body.ID) != 32 || body.Disabled == nil || strings.TrimSpace(body.ID) != body.ID {
			c.JSON(400, gin.H{"success": false, "message": "参数无效"})
			return
		}
		result := model.DB.Model(&model.CommunityInvite{}).Where("id = ?", body.ID).Update("disabled", *body.Disabled)
		if result.Error != nil {
			communityAccessError(c, result.Error)
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(404, gin.H{"success": false, "message": "邀请码不存在"})
			return
		}
		recordUserSecurityAudit(c, c.GetInt("id"), "community.invite_state", map[string]any{"invite_id": body.ID, "disabled": *body.Disabled})
		c.JSON(200, gin.H{"success": true, "data": gin.H{"updated": true}})
	default:
		c.JSON(400, gin.H{"success": false, "message": "操作无效"})
	}
}
