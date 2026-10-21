package model

import (
	"fmt"
	"sync"
	"time"
)

const (
	defaultChannelCooldown = 5 * time.Second
	maxChannelCooldown     = 24 * time.Hour
	maxCoolingChannels     = 4096
)

var channelCooldowns = struct {
	sync.RWMutex
	until map[int]time.Time
}{until: make(map[int]time.Time)}

// ChannelCoolingDownError means eligible channels exist, but every one of
// them is temporarily cooling down after an upstream 429.
type ChannelCoolingDownError struct {
	RetryAfter time.Duration
}

func (e *ChannelCoolingDownError) Error() string {
	return fmt.Sprintf("all eligible upstream channels are cooling down for %s", e.RetryAfter.Round(time.Second))
}

// RecordChannelCooldown extends a channel's cooling period. Repeated 429s
// cannot shorten an existing period. A bounded map prevents stale channel IDs
// from accumulating indefinitely after channels are deleted.
func RecordChannelCooldown(channelID int, delay time.Duration) {
	if channelID <= 0 {
		return
	}
	if delay <= 0 {
		delay = defaultChannelCooldown
	}
	delay = min(delay, maxChannelCooldown)
	now := time.Now()
	until := now.Add(delay)
	channelCooldowns.Lock()
	defer channelCooldowns.Unlock()
	if previous := channelCooldowns.until[channelID]; previous.After(until) {
		return
	}
	if _, exists := channelCooldowns.until[channelID]; !exists && len(channelCooldowns.until) >= maxCoolingChannels {
		var oldestID int
		var oldestUntil time.Time
		for id, expiry := range channelCooldowns.until {
			if !expiry.After(now) {
				delete(channelCooldowns.until, id)
				continue
			}
			if oldestUntil.IsZero() || expiry.Before(oldestUntil) {
				oldestID, oldestUntil = id, expiry
			}
		}
		if len(channelCooldowns.until) >= maxCoolingChannels && oldestID != 0 {
			delete(channelCooldowns.until, oldestID)
		}
	}
	channelCooldowns.until[channelID] = until
}

// ChannelCooldownRemaining returns zero as soon as the cooldown expires.
func ChannelCooldownRemaining(channelID int) time.Duration {
	channelCooldowns.RLock()
	until := channelCooldowns.until[channelID]
	channelCooldowns.RUnlock()
	return max(0, time.Until(until))
}

// ClearChannelCooldown removes a temporary rate-limit block.
func ClearChannelCooldown(channelID int) {
	channelCooldowns.Lock()
	delete(channelCooldowns.until, channelID)
	channelCooldowns.Unlock()
}

func excludeCoolingChannels(ids []int) ([]int, time.Duration) {
	available := make([]int, 0, len(ids))
	var shortest time.Duration
	for _, id := range ids {
		remaining := ChannelCooldownRemaining(id)
		if remaining <= 0 {
			available = append(available, id)
			continue
		}
		if shortest == 0 || remaining < shortest {
			shortest = remaining
		}
	}
	return available, shortest
}
