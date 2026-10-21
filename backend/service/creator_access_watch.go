package service

import (
	"context"
	"sync"
	"time"
)

type CreatorAccessState struct {
	Status    string `json:"status"`
	Suspended bool   `json:"suspended"`
}

var creatorAccessWatchers = struct {
	sync.Mutex
	users map[int]map[chan struct{}]struct{}
}{users: make(map[int]map[chan struct{}]struct{})}

func notifyCreatorAccess(uid int) {
	creatorAccessWatchers.Lock()
	defer creatorAccessWatchers.Unlock()
	for ch := range creatorAccessWatchers.users[uid] {
		close(ch)
	}
	delete(creatorAccessWatchers.users, uid)
}
func subscribeCreatorAccess(uid int) (<-chan struct{}, func()) {
	ch := make(chan struct{})
	creatorAccessWatchers.Lock()
	if creatorAccessWatchers.users[uid] == nil {
		creatorAccessWatchers.users[uid] = make(map[chan struct{}]struct{})
	}
	creatorAccessWatchers.users[uid][ch] = struct{}{}
	creatorAccessWatchers.Unlock()
	return ch, func() {
		creatorAccessWatchers.Lock()
		defer creatorAccessWatchers.Unlock()
		delete(creatorAccessWatchers.users[uid], ch)
		if len(creatorAccessWatchers.users[uid]) == 0 {
			delete(creatorAccessWatchers.users, uid)
		}
	}
}
func CreatorAccessSnapshot(uid int) (CreatorAccessState, error) {
	state := CreatorAccessState{}
	if uid <= 0 {
		return state, ErrCreatorForbidden
	}
	err := WithCreatorCatalog(false, func(c *CreatorCatalog) error {
		state.Status = CreatorMemberStatus(c, uid)
		state.Suspended = state.Status == "suspended"
		return nil
	})
	return state, err
}

// Subscribe before reading to avoid a lost wakeup. The bounded fallback sees
// catalog commits made by another process during a rolling deployment.
func WaitCreatorAccess(ctx context.Context, uid int, previous string, timeout time.Duration) (CreatorAccessState, error) {
	changed, unsubscribe := subscribeCreatorAccess(uid)
	defer unsubscribe()
	state, err := CreatorAccessSnapshot(uid)
	if err != nil || previous != state.Status {
		return state, err
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return state, ctx.Err()
		case <-changed:
			return CreatorAccessSnapshot(uid)
		case <-timer.C:
			return CreatorAccessSnapshot(uid)
		case <-ticker.C:
			next, err := CreatorAccessSnapshot(uid)
			if err != nil || next.Status != previous {
				return next, err
			}
		}
	}
}
