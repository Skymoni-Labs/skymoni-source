package types

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ParseRetryAfter accepts delay-seconds and HTTP-date values. It caps the
// result at one day, matching the gateway's maximum channel cooldown.
func ParseRetryAfter(value string, now time.Time) time.Duration {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if seconds, err := strconv.ParseInt(value, 10, 64); err == nil {
		if seconds < 0 {
			return 0
		}
		return time.Duration(min(seconds, int64(24*time.Hour/time.Second))) * time.Second
	}
	if date, err := http.ParseTime(value); err == nil {
		return max(0, min(date.Sub(now), 24*time.Hour))
	}
	return 0
}
