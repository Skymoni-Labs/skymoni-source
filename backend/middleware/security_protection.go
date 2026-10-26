package middleware

import (
	"github.com/QuantumNous/new-api/common"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func SecurityProtectionIPMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		d, err := model.SecurityProtectionAccess(0, c.ClientIP(), "ip")
		if err != nil {
			c.Set("security_protection_degraded", true)
			c.Next()
			return
		}
		if !d.Allowed {
			_ = model.RecordSecurityProtectionDenial(0, c.ClientIP(), c.FullPath(), "ip", d, c.GetString(common.RequestIdKey))
			writeSecurityProtectionRestriction(c, d)
			return
		}
		c.Next()
	}
}

// Attach AFTER authentication has set id. Authenticated model generation and
// websocket response.create must additionally call the central Access function
// for each request: a websocket upgrade is not a continuing authorization.
func SecurityProtectionAccountMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := c.GetInt("id")
		if uid <= 0 {
			c.Next()
			return
		}
		d, err := model.SecurityProtectionAccess(uid, c.ClientIP(), "account")
		if err != nil {
			c.Set("security_protection_degraded", true)
			c.Next()
			return
		}
		if !d.Allowed {
			_ = model.RecordSecurityProtectionDenial(uid, c.ClientIP(), c.FullPath(), "account", d, c.GetString(common.RequestIdKey))
			writeSecurityProtectionRestriction(c, d)
			return
		}
		_ = model.TouchSecurityProtectionActivity(uid, c.ClientIP())
		c.Next()
	}
}

func writeSecurityProtectionRestriction(c *gin.Context, d *model.SecurityProtectionDecision) {
	if d.RetryAfter > 0 {
		c.Header("Retry-After", strconv.FormatInt(d.RetryAfter, 10))
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "code": d.Code, "message": d.Message, "rule": d.Rule, "retry_after": d.RetryAfter, "error": gin.H{"type": "security_protection_error", "code": d.Code, "message": d.Message}})
}
