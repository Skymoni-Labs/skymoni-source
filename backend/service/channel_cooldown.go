package service

import (
	"strconv"
	"time"
)

// CooldownRetryAfterSeconds rounds a positive wait upward for HTTP clients.
func CooldownRetryAfterSeconds(delay time.Duration) string {
	return strconv.FormatInt(int64(max(1, (delay+time.Second-1)/time.Second)), 10)
}
