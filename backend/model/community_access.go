package model

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"strings"
	"time"
)

var ErrCommunityRedemption = errors.New("社区目前需先在中转站兑换额度或完成充值后开通")
var ErrCommunityInvite = errors.New("社区目前需要有效邀请码，请输入后重试")
var ErrCommunityAccessConflict = errors.New("社区准入设置已变化，请刷新后重试")

type CommunityAccessConfig struct {
	ID                      int   `gorm:"primaryKey" json:"-"`
	CreatorApplicationsOpen bool  `gorm:"not null;default:true" json:"creatorApplicationsOpen"`
	RedemptionRequired      bool  `json:"redemptionRequired"`
	InviteRequired          bool  `json:"inviteRequired"`
	Revision                int64 `json:"revision"`
}
type CommunityAdmission struct {
	UserID    int    `gorm:"primaryKey" json:"userId"`
	CreatedAt int64  `json:"createdAt"`
	Method    string `json:"method"`
}
type CommunityInvite struct {
	ID        string `gorm:"primaryKey;size:32" json:"id"`
	Hash      string `gorm:"uniqueIndex;size:64" json:"-"`
	Suffix    string `gorm:"size:6" json:"suffix"`
	Label     string `gorm:"size:80" json:"label"`
	MaxUses   int    `json:"maxUses"`
	Uses      int    `json:"uses"`
	ExpiresAt int64  `json:"expiresAt"`
	Disabled  bool   `json:"disabled"`
	CreatedBy int    `json:"createdBy"`
	CreatedAt int64  `json:"createdAt"`
}

func CommunityPolicy(db *gorm.DB) (CommunityAccessConfig, error) {
	p := CommunityAccessConfig{ID: 1, Revision: 1, CreatorApplicationsOpen: true}
	err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&p).Error
	if err != nil {
		return p, err
	}
	err = db.First(&p, 1).Error
	return p, err
}
func SetCommunityPolicy(redemption, invite bool, revision int64, creatorOpen ...bool) (CommunityAccessConfig, error) {
	p, err := CommunityPolicy(DB)
	if err != nil {
		return p, err
	}
	updates := map[string]any{"redemption_required": redemption, "invite_required": invite, "revision": revision + 1}
	if len(creatorOpen) > 0 {
		updates["creator_applications_open"] = creatorOpen[0]
	}
	result := DB.Model(&CommunityAccessConfig{}).Where("id = ? AND revision = ?", 1, revision).Updates(updates)
	if result.Error != nil {
		return p, result.Error
	}
	if result.RowsAffected != 1 {
		return p, ErrCommunityAccessConflict
	}
	return CommunityPolicy(DB)
}
func inviteHash(code string) string {
	sum := sha256.Sum256([]byte(strings.ToUpper(strings.TrimSpace(code))))
	return hex.EncodeToString(sum[:])
}
func ValidCommunityInvite(db *gorm.DB, code string) (CommunityInvite, error) {
	var v CommunityInvite
	if len(strings.TrimSpace(code)) < 20 || len(code) > 100 {
		return v, ErrCommunityInvite
	}
	err := db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("hash = ? AND disabled = ? AND uses < max_uses AND (expires_at = 0 OR expires_at > ?)", inviteHash(code), false, time.Now().Unix()).First(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return v, ErrCommunityInvite
	}
	return v, err
}
func NewCommunityInvite(actor int, label string, maxUses int, expiresAt int64) (CommunityInvite, string, error) {
	var v CommunityInvite
	if actor <= 0 || len(label) > 80 || maxUses < 1 || maxUses > 100 || expiresAt <= time.Now().Unix() || expiresAt > time.Now().Add(365*24*time.Hour).Unix() {
		return v, "", errors.New("请检查邀请码名称、次数和有效期")
	}
	raw := make([]byte, 18)
	if _, err := rand.Read(raw); err != nil {
		return v, "", err
	}
	code := "SKY-" + strings.ToUpper(hex.EncodeToString(raw))
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		return v, "", err
	}
	v = CommunityInvite{ID: hex.EncodeToString(id), Hash: inviteHash(code), Suffix: code[len(code)-6:], Label: strings.TrimSpace(label), MaxUses: maxUses, ExpiresAt: expiresAt, CreatedBy: actor, CreatedAt: time.Now().Unix()}
	return v, code, DB.Create(&v).Error
}

// Admission is permanent until an explicit future membership action. Switching
// policy governs NEW admissions, never silently revokes existing members.
func AdmitCommunity(userID int, code string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id", "role", "status").First(&user, userID).Error; err != nil {
			return err
		}
		if user.Status != 1 {
			return errors.New("账号不可用")
		}
		var previous CommunityAdmission
		err := tx.First(&previous, "user_id = ?", userID).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		p, err := CommunityPolicy(tx)
		if err != nil {
			return err
		}
		method := "free"
		if user.Role == 100 {
			method = "administrator"
		} else {
			if p.RedemptionRequired {
				eligible, err := HasCreatorRechargeWithDB(tx, userID)
				if err != nil {
					return err
				}
				if !eligible {
					return ErrCommunityRedemption
				}
				method = "redemption"
			}
			if p.InviteRequired {
				invite, err := ValidCommunityInvite(tx, code)
				if err != nil {
					return err
				}
				result := tx.Model(&CommunityInvite{}).Where("id = ? AND disabled = ? AND uses < max_uses AND (expires_at = 0 OR expires_at > ?)", invite.ID, false, time.Now().Unix()).UpdateColumn("uses", gorm.Expr("uses + 1"))
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return ErrCommunityInvite
				}
				method += "+invite"
			}
		}
		return tx.Create(&CommunityAdmission{UserID: userID, CreatedAt: time.Now().Unix(), Method: method}).Error
	})
}
