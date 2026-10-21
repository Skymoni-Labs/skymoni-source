package service

import (
	"crypto/hmac"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"time"
)

// Only a proof-bearing, active refresh cookie receives a session allowance.
// This does not rotate a token or replace the refresh handler's full checks.
func RefreshRateLimitIdentity(c *gin.Context, raw string) (string, bool) {
	sid, secret, ok := splitRefreshToken(raw)
	if !ok {
		return "", false
	}
	session, err := model.GetUserSessionBySID(sid)
	now := time.Now().Unix()
	if err != nil || session.Status != model.UserSessionStatusActive || session.RevokedAt != 0 || session.ExpiresAt <= now || CommunitySession(session.LoginMethod) != IsCommunityRequest(c) {
		return "", false
	}
	presented := []byte(hashRefreshSecret(secret))
	current := hmac.Equal(presented, []byte(session.RefreshHash))
	previous := session.PreviousValidUntil >= now && session.PreviousRefreshHash != "" && hmac.Equal(presented, []byte(session.PreviousRefreshHash))
	if !current && !previous {
		return "", false
	}
	return sid, true
}
