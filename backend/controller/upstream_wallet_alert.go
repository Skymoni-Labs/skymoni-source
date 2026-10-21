package controller

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func walletAlertHeaders(c *gin.Context) bool {
	c.Header("Cache-Control", "no-store, private")
	if c.GetInt("role") != common.RoleRootUser || c.GetInt("id") <= 0 {
		c.AbortWithStatusJSON(403, gin.H{"success": false, "message": "仅超级管理员可以配置上游邮件预警"})
		return false
	}
	return true
}

func GetUpstreamWalletAlerts(c *gin.Context) {
	if !walletAlertHeaders(c) {
		return
	}
	settings, err := model.GetUpstreamWalletAlertConfig()
	if err != nil {
		c.JSON(503, gin.H{"success": false, "message": "预警配置暂时不可用"})
		return
	}
	deliveries := []model.UpstreamWalletAlertDelivery{}
	if err = model.DB.Order("wallet_id, email").Find(&deliveries).Error; err != nil {
		c.JSON(503, gin.H{"success": false, "message": "预警记录暂时不可用"})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"settings": settings, "deliveries": deliveries, "smtp_ready": service.AdminMailSMTPReady(), "check_interval_seconds": 60, "reminder_hours": 24}})
}

func UpdateUpstreamWalletAlerts(c *gin.Context) {
	if !walletAlertHeaders(c) {
		return
	}
	var input model.UpstreamWalletAlertConfig
	if c.ShouldBindJSON(&input) != nil {
		c.JSON(400, gin.H{"success": false, "message": "预警配置格式无效"})
		return
	}
	if err := model.ValidateUpstreamWalletAlertConfig(&input); err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err := model.SaveUpstreamWalletAlertConfig(&input); err != nil {
		if errors.Is(err, model.ErrUpstreamWalletAlertConflict) {
			c.JSON(409, gin.H{"success": false, "message": err.Error()})
			return
		}
		c.JSON(503, gin.H{"success": false, "message": "预警配置保存失败"})
		return
	}
	recordManageAudit(c, "upstream_wallet.alert_config", map[string]any{"enabled": input.Enabled, "recipient_count": len(input.Recipients), "shiba_threshold": input.ShibaThreshold, "yylx_threshold": input.YYLXThreshold, "oranexa_threshold": input.OranexaThreshold})
	c.JSON(200, gin.H{"success": true, "data": input})
}

// Connectivity tests never include real account passwords or mutate balances.
func TestUpstreamWalletAlertEmail(c *gin.Context) {
	if !walletAlertHeaders(c) {
		return
	}
	settings, err := model.GetUpstreamWalletAlertConfig()
	if err != nil || !service.AdminMailSMTPReady() {
		c.JSON(503, gin.H{"success": false, "message": "请先配置站点邮件服务"})
		return
	}
	for _, email := range settings.Recipients {
		if err = common.SendEmail("Skymoni 上游余额预警 · 测试邮件", email, fmt.Sprintf("<h2>上游余额预警已连接</h2><p>柴犬低于 %.6g、YYLX 低于 %.6g、Oranexa 低于 %.6g 时，将发送对应账户余额与登录凭据。此为连接测试，不含真实账号密码，不会修改余额。</p>", settings.ShibaThreshold, settings.YYLXThreshold, settings.OranexaThreshold)); err != nil {
			c.JSON(502, gin.H{"success": false, "message": "测试邮件未确认送达，请检查邮件服务与收件箱"})
			return
		}
	}
	recordManageAudit(c, "upstream_wallet.alert_test", map[string]any{"recipient_count": len(settings.Recipients)})
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "测试邮件已被邮件服务器接收"})
}
