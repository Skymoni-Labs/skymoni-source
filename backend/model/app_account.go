package model

import (
	"crypto/subtle"
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var (
	ErrAppGrantInvalid = errors.New("授权请求无效")
	ErrAppGrantPending = errors.New("等待网站确认授权")
	ErrAppGrantDenied  = errors.New("用户拒绝了授权")
	ErrAppGrantExpired = errors.New("授权请求已过期或已使用")
	ErrAppGrantSlow    = errors.New("请至少间隔五秒查询")
)

// Only hashes of device codes and native credentials are stored. Native
// credentials cannot be used as dashboard JWTs, PATs, refresh tokens or API keys.
type AppAccountGrant struct {
	DeviceHash  string `gorm:"type:char(64);primaryKey" json:"-"`
	CodeHash    string `gorm:"type:char(64);not null;uniqueIndex" json:"-"`
	Challenge   string `gorm:"size:43;not null" json:"-"`
	DeviceName  string `gorm:"size:80;not null" json:"device_name"`
	State       string `gorm:"size:16;not null" json:"state"`
	UserID      int    `json:"-"`
	AuthVersion int64  `json:"-"`
	Revision    int64  `gorm:"not null;default:0" json:"-"`
	NextPollAt  int64  `json:"-"`
	CreatedAt   int64  `json:"-"`
	ExpiresAt   int64  `gorm:"index" json:"expires_at"`
}

type AppAccountSession struct {
	TokenHash  string `gorm:"type:char(64);primaryKey" json:"-"`
	SID        string `gorm:"size:64;not null;uniqueIndex" json:"-"`
	UserID     int    `gorm:"not null;index" json:"-"`
	DeviceName string `gorm:"size:80;not null" json:"device_name"`
	ExpiresAt  int64  `gorm:"index" json:"expires_at"`
	CreatedAt  int64  `json:"-"`
}

func lockAppAccountGrant(tx *gorm.DB, field, hash string) (AppAccountGrant, error) {
	var grant AppAccountGrant
	// A real write serializes with polling/decisions even on SQLite.
	r := tx.Model(&AppAccountGrant{}).Where(field+" = ?", hash).UpdateColumn("revision", gorm.Expr("revision + 1"))
	if r.Error != nil {
		return grant, r.Error
	}
	if r.RowsAffected != 1 {
		return grant, ErrAppGrantInvalid
	}
	err := tx.First(&grant, field+" = ?", hash).Error
	if err == nil && (grant.ExpiresAt <= time.Now().Unix() || grant.State == "consumed") {
		err = ErrAppGrantExpired
	}
	return grant, err
}

func DecideAppAccountGrant(codeHash string, userID int, authVersion int64, approve bool) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		grant, err := lockAppAccountGrant(tx, "code_hash", codeHash)
		if err != nil {
			return err
		}
		if grant.State != "pending" {
			return ErrAppGrantExpired
		}
		var user User
		if err := tx.First(&user, userID).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled || user.AuthVersion != authVersion {
			return ErrUserSessionInactive
		}
		grant.State = "denied"
		if approve {
			grant.State = "approved"
			grant.UserID = userID
			grant.AuthVersion = authVersion
		}
		return tx.Save(&grant).Error
	})
}

// Creates a counted relay-scope session, not a parallel bypass of session limits.
// The grant, limits, account version and new session commit together. The app
// receives no dashboard access/refresh token and no administrator privileges.
func ExchangeAppAccountGrant(deviceHash, challenge, tokenHash string, session *UserSession) (*AppAccountSession, error) {
	var native AppAccountSession
	var outcome error
	err := DB.Transaction(func(tx *gorm.DB) error {
		grant, err := lockAppAccountGrant(tx, "device_hash", deviceHash)
		if err != nil {
			return err
		}
		if subtle.ConstantTimeCompare([]byte(grant.Challenge), []byte(challenge)) != 1 {
			return ErrAppGrantInvalid
		}
		now := time.Now().Unix()
		if grant.State == "denied" {
			return ErrAppGrantDenied
		}
		if grant.NextPollAt > now {
			return ErrAppGrantSlow
		}
		grant.NextPollAt = now + 5
		if grant.State == "pending" {
			outcome = ErrAppGrantPending
			return tx.Save(&grant).Error
		}
		if grant.State != "approved" || session == nil {
			return ErrAppGrantInvalid
		}
		// Lock the user before counting, so two authorizations cannot overrun
		// the ordinary active-session or session-issuance limits.
		if err := tx.Model(&User{}).Where("id = ?", grant.UserID).UpdateColumn("auth_version", gorm.Expr("auth_version + 0")).Error; err != nil {
			return err
		}
		var user User
		if err := tx.First(&user, grant.UserID).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled || user.AuthVersion != grant.AuthVersion {
			return ErrUserSessionInactive
		}
		var count int64
		if err := tx.Model(&UserSession{}).Scopes(SessionScope("skivu_app")).Where("user_id = ? AND status = ? AND expires_at > ?", user.Id, UserSessionStatusActive, now).Count(&count).Error; err != nil {
			return err
		}
		if count >= int64(common.UserSessionActiveLimit) {
			return ErrUserSessionLimit
		}
		if err := tx.Model(&UserSession{}).Scopes(SessionScope("skivu_app")).Where("user_id = ? AND created_at > ?", user.Id, now-common.UserSessionIssuanceWindowSeconds).Count(&count).Error; err != nil {
			return err
		}
		if count >= int64(common.UserSessionIssuanceLimit) {
			return ErrUserSessionIssuanceLimit
		}
		session.UserID = user.Id
		session.UserAuthVersion = user.AuthVersion
		session.LoginMethod = "skivu_app"
		if err := createUserSessionWithTx(tx, session); err != nil {
			return err
		}
		native = AppAccountSession{TokenHash: tokenHash, SID: session.SID, UserID: user.Id, DeviceName: grant.DeviceName, ExpiresAt: session.ExpiresAt, CreatedAt: now}
		if err := tx.Create(&native).Error; err != nil {
			return err
		}
		grant.State = "consumed"
		return tx.Save(&grant).Error
	})
	if err != nil {
		return nil, err
	}
	if outcome != nil {
		return nil, outcome
	}
	return &native, nil
}
