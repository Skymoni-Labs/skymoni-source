package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func adminMailError(c *gin.Context, err error) {
	status, message := http.StatusInternalServerError, "email operation failed"
	if errors.Is(err, gorm.ErrRecordNotFound) {
		status, message = http.StatusNotFound, "email draft not found"
	}
	if errors.Is(err, model.ErrAdminMailConflict) {
		status, message = http.StatusConflict, err.Error()
	}
	c.JSON(status, gin.H{"success": false, "message": message})
}

func AdminListMail(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	page = min(max(page, 1), 100000)
	var items []model.AdminMailCampaign
	var total int64
	if err := model.DB.Model(&model.AdminMailCampaign{}).Count(&total).Error; err != nil {
		adminMailError(c, err)
		return
	}
	if err := model.DB.Omit("content", "html", "user_ids", "emails").Order("id DESC").Limit(20).Offset((page - 1) * 20).Find(&items).Error; err != nil {
		adminMailError(c, err)
		return
	}
	for i := range items {
		if err := model.LoadAdminMailCounts(&items[i]); err != nil {
			adminMailError(c, err)
			return
		}
	}
	sender := common.SMTPFrom
	if sender == "" {
		sender = common.SMTPAccount
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total, "smtp_ready": service.AdminMailSMTPReady(), "sender": sender}})
}

func AdminGetMail(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	campaign, err := model.GetAdminMailCampaign(id)
	if err != nil {
		adminMailError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": campaign})
}

func AdminGetMailDraftInput(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	input, err := model.GetAdminMailDraftInput(id)
	if err != nil {
		adminMailError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": input})
}

func AdminPreviewMail(c *gin.Context) {
	input, ok := parseAdminMailInput(c)
	if !ok {
		return
	}
	html, err := service.RenderAdminMail(input.Subject, input.Content, input.Format)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordManageAudit(c, "mail.preview", map[string]any{"format": input.Format})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"html": html}})
}

func parseAdminMailInput(c *gin.Context) (model.AdminMailInput, bool) {
	var input model.AdminMailInput
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, model.AdminMailMaxContentBytes*6+model.AdminMailMaxRecipients*260+65536)
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid email request"})
		return input, false
	}
	if err := model.ValidateAdminMailInput(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return input, false
	}
	return input, true
}

func AdminCreateMailDraft(c *gin.Context) {
	input, ok := parseAdminMailInput(c)
	if !ok {
		return
	}
	html, err := service.RenderAdminMail(input.Subject, input.Content, input.Format)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	campaign, err := model.CreateAdminMailDraft(input, html, c.GetInt("id"))
	if err != nil {
		if errors.Is(err, model.ErrAdminMailConflict) {
			adminMailError(c, err)
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "cannot save draft; check recipient selection and email addresses"})
		}
		return
	}
	recordManageAudit(c, "mail.draft", map[string]any{"id": campaign.Id, "audience": campaign.Audience, "recipients": campaign.RecipientCount})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": campaign})
}

func AdminUpdateMailDraft(c *gin.Context) {
	input, ok := parseAdminMailInput(c)
	if !ok {
		return
	}
	html, err := service.RenderAdminMail(input.Subject, input.Content, input.Format)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	campaign, err := model.UpdateAdminMailDraft(id, input, html)
	if err != nil {
		if errors.Is(err, model.ErrAdminMailConflict) || errors.Is(err, gorm.ErrRecordNotFound) {
			adminMailError(c, err)
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "cannot update draft; check recipient selection and email addresses"})
		}
		return
	}
	recordManageAudit(c, "mail.draft.update", map[string]any{"id": campaign.Id, "audience": campaign.Audience, "recipients": campaign.RecipientCount})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": campaign})
}

func AdminQueueMail(c *gin.Context) {
	if !service.AdminMailSMTPReady() {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "configure SMTP before sending email"})
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	campaign, err := model.GetAdminMailCampaign(id)
	if err != nil {
		adminMailError(c, err)
		return
	}
	rendered, err := service.PrepareModelSaleMailForSend(campaign)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err := model.QueueAdminMailCampaignWithHTML(id, rendered); err != nil {
		adminMailError(c, err)
		return
	}
	recordManageAudit(c, "mail.queue", map[string]any{"id": id})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminCancelMail(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := model.CancelAdminMailCampaign(id); err != nil {
		adminMailError(c, err)
		return
	}
	recordManageAudit(c, "mail.cancel", map[string]any{"id": id})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminMailRecipients(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if _, err := model.GetAdminMailCampaign(id); err != nil {
		adminMailError(c, err)
		return
	}
	page, _ := strconv.Atoi(c.Query("page"))
	page = min(max(page, 1), 100000)
	var items []model.AdminMailDelivery
	if err := model.DB.Where("campaign_id = ?", id).Order("id").Limit(50).Offset((page - 1) * 50).Find(&items).Error; err != nil {
		adminMailError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items})
}
