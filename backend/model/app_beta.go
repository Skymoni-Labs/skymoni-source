package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const BetaSource = "app_beta"

var ErrBetaAccess = errors.New("内测尚未开通或已停用")
var ErrBetaQuota = errors.New("内测额度不足")
var ErrBetaConflict = errors.New("内测资料已更新，请刷新后重试")

// The beta wallet never reads/writes users.quota, tokens or subscriptions.
type AppBetaAccount struct {
	UserID      int    `gorm:"primaryKey;autoIncrement:false" json:"user_id"`
	Status      string `gorm:"size:20;not null;index" json:"status"`
	Balance     int64  `gorm:"not null;default:0" json:"balance"`
	Reserved    int64  `gorm:"not null;default:0" json:"reserved"`
	Used        int64  `gorm:"not null;default:0" json:"used"`
	Version     int64  `gorm:"not null;default:0" json:"version"`
	Application string `gorm:"size:1000" json:"application"`
	ReviewNote  string `gorm:"size:500" json:"review_note"`
	AppliedAt   int64  `json:"applied_at"`
	ReviewedAt  int64  `json:"reviewed_at"`
	ReviewerID  int    `json:"reviewer_id"`
}

type AppBetaLedger struct {
	ID           int64  `gorm:"primaryKey" json:"id"`
	OperationKey string `gorm:"size:128;uniqueIndex;not null" json:"-"`
	UserID       int    `gorm:"index;not null" json:"user_id"`
	ActorID      int    `json:"actor_id"`
	Kind         string `gorm:"size:24;not null" json:"kind"`
	Delta        int64  `json:"delta"`
	Balance      int64  `json:"balance"`
	Reserved     int64  `json:"reserved"`
	Used         int64  `json:"used"`
	Note         string `gorm:"size:500" json:"note"`
	CreatedAt    int64  `json:"created_at"`
}

type AppBetaCharge struct {
	RequestID string `gorm:"size:80;primaryKey"`
	UserID    int    `gorm:"index;not null"`
	Reserved  int64
	Actual    int64
	State     string `gorm:"size:16;not null;index"`
	UpdatedAt int64
}

func GetAppBetaAccount(userID int) (AppBetaAccount, error) {
	var a AppBetaAccount
	err := DB.First(&a, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return AppBetaAccount{UserID: userID, Status: "none"}, nil
	}
	return a, err
}

// Lock before reading, including on SQLite. All writers follow the same order.
func lockAppBeta(tx *gorm.DB, userID int) (AppBetaAccount, error) {
	var a AppBetaAccount
	result := tx.Model(&AppBetaAccount{}).Where("user_id = ?", userID).UpdateColumn("version", gorm.Expr("version + 1"))
	if result.Error != nil {
		return a, result.Error
	}
	if result.RowsAffected != 1 {
		return a, ErrBetaAccess
	}
	err := tx.First(&a, "user_id = ?", userID).Error
	return a, err
}

func saveAppBeta(tx *gorm.DB, a *AppBetaAccount, key, kind string, actor int, delta int64, note string) error {
	if a.Balance > common.MaxWalletQuota || a.Balance < -common.MaxWalletQuota || a.Reserved < 0 || a.Reserved > common.MaxWalletQuota || a.Used < 0 || a.Used > common.MaxWalletQuota {
		return errors.New("内测额度超出允许范围")
	}
	if err := tx.Save(a).Error; err != nil {
		return err
	}
	return tx.Create(&AppBetaLedger{OperationKey: key, UserID: a.UserID, ActorID: actor, Kind: kind, Delta: delta, Balance: a.Balance, Reserved: a.Reserved, Used: a.Used, Note: note, CreatedAt: time.Now().Unix()}).Error
}

func ApplyAppBeta(userID int, note string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		a := AppBetaAccount{UserID: userID, Status: "none"}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&a).Error; err != nil {
			return err
		}
		a, err := lockAppBeta(tx, userID)
		if err != nil {
			return err
		}
		if a.Status == "pending" || a.Status == "approved" {
			return tx.Model(&a).UpdateColumn("version", a.Version-1).Error
		}
		if a.Status == "suspended" {
			return ErrBetaAccess
		}
		a.Status = "pending"
		a.Application = note
		a.AppliedAt = time.Now().Unix()
		a.ReviewNote = ""
		return saveAppBeta(tx, &a, fmt.Sprintf("apply:%d:%d", userID, a.Version), "apply", userID, 0, "")
	})
}

type AppBetaReview struct {
	Action      string `json:"action"`
	Amount      int64  `json:"amount"`
	Version     int64  `json:"version"`
	OperationID string `json:"operation_id"`
	Note        string `json:"note"`
}

func ReviewAppBeta(userID, actor int, review AppBetaReview) error {
	if review.Amount < -common.MaxWalletQuota || review.Amount > common.MaxWalletQuota {
		return ErrBetaQuota
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		a, err := lockAppBeta(tx, userID)
		if err != nil {
			return err
		}
		key := fmt.Sprintf("admin:%d:%s", userID, review.OperationID)
		var previous AppBetaLedger
		err = tx.Where("operation_key = ?", key).First(&previous).Error
		if err == nil {
			if previous.ActorID != actor || previous.Kind != review.Action || previous.Delta != review.Amount || previous.Note != review.Note {
				return ErrBetaConflict
			}
			return tx.Model(&a).UpdateColumn("version", a.Version-1).Error
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if a.Version != review.Version+1 {
			return ErrBetaConflict
		}
		switch review.Action {
		case "approve":
			if (a.Status != "pending" && a.Status != "suspended") || review.Amount < 0 {
				return ErrBetaConflict
			}
			a.Status = "approved"
		case "reject":
			if a.Status != "pending" || review.Amount != 0 {
				return ErrBetaConflict
			}
			a.Status = "rejected"
		case "suspend":
			if a.Status != "approved" || review.Amount != 0 {
				return ErrBetaConflict
			}
			a.Status = "suspended"
		case "adjust":
			if a.Status != "approved" || review.Amount == 0 {
				return ErrBetaConflict
			}
		default:
			return errors.New("无效内测操作")
		}
		if review.Amount > 0 && (a.Balance > common.MaxWalletQuota-review.Amount || a.Balance+a.Reserved > common.MaxWalletQuota-review.Amount) {
			return ErrBetaQuota
		}
		if review.Amount < 0 && a.Balance < -review.Amount {
			return ErrBetaQuota
		}
		a.Balance += review.Amount
		a.ReviewNote = review.Note
		a.ReviewedAt = time.Now().Unix()
		a.ReviewerID = actor
		// Suspension invalidates existing devices; reapproval requires pairing again.
		if review.Action == "suspend" {
			if err := tx.Model(&AppBetaDevice{}).Where("user_id = ?", userID).Update("revoked", true).Error; err != nil {
				return err
			}
		}
		return saveAppBeta(tx, &a, key, review.Action, actor, review.Amount, review.Note)
	})
}

// Reserve a cumulative target. A request ID is unique and never reused after finalization.
func ReserveAppBeta(userID int, requestID string, target int64) error {
	if target <= 0 || target > common.MaxQuota || requestID == "" {
		return ErrBetaQuota
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		a, err := lockAppBeta(tx, userID)
		if err != nil {
			return err
		}
		if a.Status != "approved" {
			return ErrBetaAccess
		}
		var charge AppBetaCharge
		err = tx.First(&charge, "request_id = ?", requestID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			charge = AppBetaCharge{RequestID: requestID, UserID: userID, State: "reserved"}
		} else if err != nil {
			return err
		}
		if charge.UserID != userID || charge.State != "reserved" {
			return ErrBetaConflict
		}
		delta := target - charge.Reserved
		if delta <= 0 {
			return nil
		}
		if a.Balance < delta {
			return ErrBetaQuota
		}
		a.Balance -= delta
		a.Reserved += delta
		charge.Reserved = target
		charge.UpdatedAt = time.Now().Unix()
		if err := tx.Save(&charge).Error; err != nil {
			return err
		}
		return saveAppBeta(tx, &a, fmt.Sprintf("reserve:%s:%d", requestID, target), "reserve", 0, -delta, "")
	})
}

// Final settlement/refund and its ledger commit atomically; retries cannot credit twice.
func FinishAppBeta(userID int, requestID string, actual int64, refund bool) error {
	if actual < 0 || actual > common.MaxQuota {
		return ErrBetaQuota
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		a, err := lockAppBeta(tx, userID)
		if err != nil {
			return err
		}
		var charge AppBetaCharge
		if err := tx.First(&charge, "request_id = ?", requestID).Error; err != nil {
			return err
		}
		if charge.UserID != userID {
			return ErrBetaConflict
		}
		state := "settled"
		if refund {
			state = "refunded"
			actual = 0
		}
		if charge.State != "reserved" {
			if charge.State == state && charge.Actual == actual {
				return tx.Model(&a).UpdateColumn("version", a.Version-1).Error
			}
			return ErrBetaConflict
		}
		delta := charge.Reserved - actual
		a.Balance += delta
		a.Reserved -= charge.Reserved
		a.Used += actual
		charge.State = state
		charge.Actual = actual
		charge.UpdatedAt = time.Now().Unix()
		if err := tx.Save(&charge).Error; err != nil {
			return err
		}
		return saveAppBeta(tx, &a, "finish:"+requestID, state, 0, delta, "")
	})
}

type AppBetaChallenge struct {
	ID        string `gorm:"size:64;primaryKey"`
	Challenge string `gorm:"size:64"`
	ExpiresAt int64  `gorm:"index"`
}
type AppBetaDevice struct {
	Serials     string `gorm:"type:text" json:"-"`
	ID          string `gorm:"size:64;primaryKey" json:"id"`
	TokenHash   string `gorm:"size:64;uniqueIndex" json:"-"`
	PublicKey   []byte `json:"-"`
	PairHash    string `gorm:"size:64;uniqueIndex" json:"-"`
	PairExpires int64  `json:"-"`
	UserID      int    `gorm:"index" json:"-"`
	Label       string `gorm:"size:100" json:"label"`
	CreatedAt   int64  `json:"created_at"`
	ExpiresAt   int64  `gorm:"index" json:"expires_at"`
	Revoked     bool   `gorm:"not null;default:false" json:"revoked"`
}
type AppBetaNonce struct {
	ID        string `gorm:"size:128;primaryKey"`
	ExpiresAt int64  `gorm:"index"`
}

func PairAppBeta(userID int, pairHash string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		a, err := lockAppBeta(tx, userID)
		if err != nil {
			return err
		}
		if a.Status != "approved" {
			return ErrBetaAccess
		}
		var count int64
		if err := tx.Model(&AppBetaDevice{}).Where("user_id = ? AND revoked = ? AND expires_at > ?", userID, false, time.Now().Unix()).Count(&count).Error; err != nil {
			return err
		}
		if count >= 3 {
			return errors.New("最多绑定三台设备，请先移除旧设备")
		}
		result := tx.Model(&AppBetaDevice{}).Where("pair_hash = ? AND user_id = 0 AND revoked = ? AND pair_expires > ?", pairHash, false, time.Now().Unix()).Updates(map[string]any{"user_id": userID, "pair_expires": 0})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("配对码无效或已过期")
		}
		return nil
	})
}
