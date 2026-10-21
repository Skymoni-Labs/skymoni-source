package model

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Passwords are isolated from wallet rows, cost snapshots and ordinary APIs.
// The encryption key stays outside SQL; authenticated purposes bind each row.
type UpstreamWalletCredential struct {
	WalletID  int    `json:"wallet_id" gorm:"primaryKey;autoIncrement:false"`
	Encrypted string `json:"-" gorm:"type:text;not null"`
	UpdatedAt int64  `json:"updated_at"`
}

type UpstreamWalletVault struct {
	Slot       string `json:"-" gorm:"primaryKey;size:30"`
	UnlockHash string `json:"-" gorm:"type:text;not null"`
}

type UpstreamWalletUnlockAttempt struct {
	UserID   int `gorm:"primaryKey;autoIncrement:false"`
	WindowAt int64
	Failures int
}

type UpstreamWalletLogin struct {
	Username string `json:"username"`
	Password string `json:"password"`
	LoginURL string `json:"login_url"`
	Note     string `json:"note"`
}

var (
	ErrWalletVaultUnavailable  = errors.New("账号密码库尚未配置或暂时不可用")
	ErrWalletUnlock            = errors.New("查看密钥不正确")
	ErrWalletUnlockLocked      = errors.New("查看密钥连续输错，请15分钟后重试")
	ErrWalletCredentialMissing = errors.New("此账户尚未录入登录凭据")
)

// Failures persist across application restarts. The user row is locked while
// checking so parallel requests cannot bypass the five-attempt window.
func VerifyUpstreamWalletUnlock(userID int, key string) error {
	if userID <= 0 || len(key) == 0 || len(key) > 128 {
		return ErrWalletUnlock
	}
	var vault UpstreamWalletVault
	if DB.First(&vault, "slot = ?", "active").Error != nil || vault.UnlockHash == "" {
		return ErrWalletVaultUnavailable
	}
	var denied error
	err := DB.Transaction(func(tx *gorm.DB) error {
		now := time.Now().Unix()
		attempt := UpstreamWalletUnlockAttempt{UserID: userID, WindowAt: now}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&attempt).Error; err != nil {
			return err
		}
		if err := lockForUpdate(tx).First(&attempt, userID).Error; err != nil {
			return err
		}
		if now-attempt.WindowAt >= 15*60 {
			attempt.WindowAt = now
			attempt.Failures = 0
		}
		if attempt.Failures >= 5 {
			denied = ErrWalletUnlockLocked
			return nil
		}
		if !common.ValidatePasswordAndHash(key, vault.UnlockHash) {
			attempt.Failures++
			denied = ErrWalletUnlock
			if attempt.Failures >= 5 {
				denied = ErrWalletUnlockLocked
			}
		} else {
			attempt.Failures = 0
			attempt.WindowAt = now
		}
		return tx.Save(&attempt).Error
	})
	if err != nil {
		return ErrWalletVaultUnavailable
	}
	return denied
}

func SaveUpstreamWalletCredential(walletID int, login UpstreamWalletLogin) error {
	u, err := url.Parse(login.LoginURL)
	if walletID <= 0 || strings.TrimSpace(login.Username) == "" || len(login.Username) > 200 || login.Password == "" || len(login.Password) > 512 || len(login.LoginURL) > 500 || len(login.Note) > 500 || err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
		return errors.New("登录账号、密码或网址无效")
	}
	var count int64
	if DB.Model(&UpstreamWallet{}).Where("id = ?", walletID).Count(&count).Error != nil || count != 1 {
		return ErrWalletCredentialMissing
	}
	encrypted, err := encryptBenefit(login, fmt.Sprintf("upstream-wallet-login:%d", walletID))
	if err != nil {
		return ErrWalletVaultUnavailable
	}
	row := UpstreamWalletCredential{WalletID: walletID, Encrypted: encrypted, UpdatedAt: time.Now().Unix()}
	if DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "wallet_id"}}, DoUpdates: clause.AssignmentColumns([]string{"encrypted", "updated_at"})}).Create(&row).Error != nil {
		return ErrWalletVaultUnavailable
	}
	return nil
}

func ReadUpstreamWalletCredential(walletID int) (*UpstreamWalletLogin, error) {
	var row UpstreamWalletCredential
	if walletID <= 0 || DB.First(&row, walletID).Error != nil {
		return nil, ErrWalletCredentialMissing
	}
	var login UpstreamWalletLogin
	if decryptBenefit(row.Encrypted, fmt.Sprintf("upstream-wallet-login:%d", walletID), &login) != nil {
		return nil, ErrWalletVaultUnavailable
	}
	return &login, nil
}
