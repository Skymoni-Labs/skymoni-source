package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func securityProtectionRegistrationAllowed(c *gin.Context) bool {
	d, err := model.SecurityProtectionRegistrationGuard(c.ClientIP(), c.FullPath(), c.GetString(common.RequestIdKey))
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "code": "security_protection_unavailable", "message": "注册保护暂不可用，请稍后重试"})
		return false
	}
	if d != nil && !d.Allowed {
		writeSecurityProtectionDecision(c, d, http.StatusTooManyRequests)
		return false
	}
	return true
}

func securityProtectionLoginAllowed(c *gin.Context, userID int) bool {
	d, err := model.SecurityProtectionAccess(userID, c.ClientIP(), "account")
	if err != nil {
		return true
	}
	if d != nil && !d.Allowed {
		writeSecurityProtectionDecision(c, d, http.StatusForbidden)
		return false
	}
	return true
}

func writeSecurityProtectionDecision(c *gin.Context, d *model.SecurityProtectionDecision, status int) {
	if d.RetryAfter > 0 {
		c.Header("Retry-After", strconv.FormatInt(d.RetryAfter, 10))
	}
	c.JSON(status, gin.H{"success": false, "code": d.Code, "message": d.Message, "rule": d.Rule, "retry_after": d.RetryAfter})
}

func recordSecurityProtectionMetadata(c *gin.Context, userID int, kind string) {
	_ = model.RecordSecurityProtectionEvent(userID, c.ClientIP(), c.FullPath(), kind, c.GetString(common.RequestIdKey))
}
