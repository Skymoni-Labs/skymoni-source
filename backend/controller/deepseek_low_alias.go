package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"net/http"
	"time"
)

func RenameDeepSeekLowAlias(c *gin.Context) {
	var input struct {
		ExpectedVersion string `json:"expected_version"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.RenameDeepSeekLowAlias(input.ExpectedVersion, time.Now()); err != nil {
		modelSaleError(c, err)
		return
	}
	recordManageAudit(c, "model.alias.rename", map[string]any{"old": "deepseek-flash-low", "new": "deepseek-v4.1-flash-low", "legacy_compatible": true})
	common.ApiSuccess(c, gin.H{"model": "deepseek-v4.1-flash-low", "legacy_compatible": true, "prices_unchanged": true})
}
