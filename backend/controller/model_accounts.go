package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetModelAccounts(c *gin.Context) {
	if c.GetInt("role") != common.RoleRootUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "需要超级管理员权限"})
		return
	}
	data, err := model.GetModelAccounts()
	if err != nil {
		common.SysError("model account listing failed: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "读取模型账户失败，请重试"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

func UpdateModelAccountPriority(c *gin.Context) {
	if c.GetInt("role") != common.RoleRootUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "需要超级管理员权限"})
		return
	}
	var request model.ModelAccountPriorityRequest
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请输入有效的整数优先级"})
		return
	}
	changes, err := model.UpdateModelAccountPriority(request)
	if err != nil {
		switch {
		case errors.Is(err, model.ErrModelAccountChanged):
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": err.Error()})
		case errors.Is(err, model.ErrModelAccountPriority):
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		default:
			common.SysError("model account priority update failed: " + err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "保存失败，请刷新渠道配置后重试"})
		}
		return
	}
	model.InitChannelCache()
	recordManageAudit(c, "channel.account_priority", map[string]any{
		"model": request.Model, "wallet_id": request.AccountID, "priority": *request.Priority,
		"count": len(changes), "changes": changes,
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"updated": len(changes)}})
}
