package model

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var userActivity = struct {
	sync.Mutex
	pending map[int]int64
}{pending: make(map[int]int64)}

// RecordUserActivity accepts only a server-authenticated user ID. It does no
// database or network IO on the request path, including streaming API calls.
func RecordUserActivity(userID int) {
	queueUserActivity(userID, time.Now().Unix())
}

func queueUserActivity(userID int, at int64) {
	if userID <= 0 || at <= 0 {
		return
	}
	userActivity.Lock()
	userActivity.pending[userID] = max(userActivity.pending[userID], at)
	userActivity.Unlock()
}

// FlushUserActivity coalesces requests into one monotonic update per active
// user. Independent instances cannot overwrite a more recent observation.
func FlushUserActivity(ctx context.Context) error {
	userActivity.Lock()
	pending := userActivity.pending
	userActivity.pending = make(map[int]int64)
	userActivity.Unlock()
	var failures []error
	for id, at := range pending {
		err := DB.WithContext(ctx).Model(&User{}).
			Where("id = ? AND last_active_at < ?", id, at).
			UpdateColumn("last_active_at", at).Error
		if err != nil {
			queueUserActivity(id, at)
			failures = append(failures, err)
		}
	}
	return errors.Join(failures...)
}

func StartUserActivityRecorder() func() {
	stop, done := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			stopping := false
			select {
			case <-ticker.C:
			case <-stop:
				stopping = true
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err := FlushUserActivity(ctx)
			cancel()
			if err != nil {
				common.SysError("failed to persist user activity: " + err.Error())
			}
			if stopping {
				return
			}
		}
	}()
	var once sync.Once
	return func() {
		once.Do(func() { close(stop); <-done })
	}
}

// InitializeUserActivity seeds only unknown timestamps from actual existing
// login/session/key-use records. Creating a key is not evidence of API use.
func InitializeUserActivity() error {
	var users []User
	return DB.Model(&User{}).Where("last_active_at = 0").Select("id", "last_login_at").
		FindInBatches(&users, 200, func(tx *gorm.DB, _ int) error {
			ids := make([]int, len(users))
			latest := make(map[int]int64, len(users))
			for i, user := range users {
				ids[i], latest[user.Id] = user.Id, user.LastLoginAt
			}
			var sessions, tokens []struct {
				UserID   int
				ActiveAt int64
			}
			if err := DB.Model(&UserSession{}).Where("user_id IN ? AND revoked_reason <> ?", ids, "token_issue_failed").
				Select("user_id, MAX(last_active_at) AS active_at").Group("user_id").Scan(&sessions).Error; err != nil {
				return err
			}
			if err := DB.Unscoped().Model(&Token{}).Where("user_id IN ? AND accessed_time > created_time", ids).
				Select("user_id, MAX(accessed_time) AS active_at").Group("user_id").Scan(&tokens).Error; err != nil {
				return err
			}
			for _, history := range append(sessions, tokens...) {
				latest[history.UserID] = max(latest[history.UserID], history.ActiveAt)
			}
			for id, at := range latest {
				if at > 0 {
					if err := DB.Model(&User{}).Where("id = ? AND last_active_at = 0", id).
						UpdateColumn("last_active_at", at).Error; err != nil {
						return err
					}
				}
			}
			return nil
		}).Error
}
