package middleware

import (
	"crypto/sha256"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// Refreshing an existing login is separate from password/factor/admin actions.
// Unknown cookies keep the configured strict IP allowance. Valid cookies get a
// bounded per-session allowance, with an additional coarse IP flood guard.
func RefreshRateLimit() func(*gin.Context) {
	if !common.CriticalRateLimitEnable {
		return defNext
	}
	flood := rateLimitFactory(600, 60, "AUTH_REFRESH_IP")
	invalid := rateLimitFactory(common.CriticalRateLimitNum, common.CriticalRateLimitDuration, "AUTH_REFRESH_INVALID")
	return func(c *gin.Context) {
		flood(c)
		if c.IsAborted() {
			return
		}
		raw, _ := c.Cookie(service.ScopedRefreshCookieName(c))
		sid, valid := service.RefreshRateLimitIdentity(c, raw)
		if !valid {
			invalid(c)
			return
		}
		mark := fmt.Sprintf("AUTH_REFRESH_SESSION:%x", sha256.Sum256([]byte(sid)))
		rateLimitFactory(60, 60, mark)(c)
	}
}
