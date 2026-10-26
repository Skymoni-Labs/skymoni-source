package middleware

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// The UID must already have been resolved by an existing authenticator.
func securityProtectionAuthorize(c *gin.Context, userID int) bool {
	d, err := model.SecurityProtectionAccess(userID, c.ClientIP(), "account")
	if err != nil {
		c.Set("security_protection_degraded", true)
		return true
	}
	if d != nil && !d.Allowed {
		_ = model.RecordSecurityProtectionDenial(userID, c.ClientIP(), c.FullPath(), "account", d, c.GetString(common.RequestIdKey))
		writeSecurityProtectionRestriction(c, d)
		return false
	}
	_ = model.TouchSecurityProtectionActivity(userID, c.ClientIP())
	return true
}
