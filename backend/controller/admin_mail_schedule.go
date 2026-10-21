package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func AdminScheduleMail(c *gin.Context) {
	if !service.AdminMailSMTPReady() {
		c.JSON(400, gin.H{"success": false, "message": "请先配置 SMTP"})
		return
	}
	var in struct {
		SendAt int64 `json:"send_at"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "定时发送参数无效"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	campaign, err := model.GetAdminMailCampaign(id)
	if err != nil {
		adminMailError(c, err)
		return
	}
	now := time.Now()
	if err = service.ValidateAdminMailSchedule(campaign, in.SendAt, now); err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err = model.ScheduleAdminMailCampaign(id, in.SendAt, now, campaign.ScheduleSaleFingerprint); err != nil {
		adminMailError(c, err)
		return
	}
	recordManageAudit(c, "mail.schedule", map[string]any{"id": id, "send_at": in.SendAt})
	c.JSON(200, gin.H{"success": true})
}
