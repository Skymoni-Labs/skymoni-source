package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrCreatorHomeConflict = errors.New("首页展示内容已更新，请刷新后重试")
var ErrCreatorHomeBalance = errors.New("钱包余额不足，请先充值")
var ErrCreatorHomeInvalid = errors.New("请检查首页卡片、展示套餐及审核状态")

// Payment and entitlement live in the wallet database, never the JSON catalog:
// a rollback cannot leave a charged user without their purchased entitlement.
type CreatorHomeCard struct {
	WorkID        string `gorm:"primaryKey;size:64" json:"workId"`
	OwnerID       int    `gorm:"index" json:"ownerId"`
	Image         string `gorm:"type:text" json:"image"`
	ApprovedImage string `gorm:"type:text" json:"approvedImage"`
	Status        string `gorm:"size:20" json:"status"`
	Note          string `gorm:"size:500" json:"note"`
	Revision      string `gorm:"size:40" json:"revision"`
	ExpiresAt     int64  `json:"expiresAt"`
	Permanent     bool   `json:"permanent"`
	Hidden        bool   `json:"hidden"`
	OwnerPaused   bool   `gorm:"not null;default:false" json:"ownerPaused"`
	Position      int    `json:"position"`
	UpdatedAt     int64  `json:"updatedAt"`
}
type CreatorHomeOrder struct {
	ID           int    `gorm:"primaryKey" json:"id"`
	UserID       int    `gorm:"uniqueIndex:idx_creator_home_checkout;index" json:"-"`
	CheckoutID   string `gorm:"uniqueIndex:idx_creator_home_checkout;size:80" json:"checkoutId"`
	WorkID       string `gorm:"size:64;index" json:"workId"`
	Plan         string `gorm:"size:20" json:"plan"`
	Credits      int    `json:"credits"`
	Quota        int    `json:"-"`
	BalanceAfter int    `json:"-"`
	ExpiresAt    int64  `json:"expiresAt"`
	Permanent    bool   `json:"permanent"`
	CreatedAt    int64  `json:"createdAt"`
}
type CreatorHomeConfig struct {
	ID              int    `gorm:"primaryKey" json:"-"`
	GalleryEnabled  bool   `json:"galleryEnabled"`
	MarqueeEnabled  bool   `json:"marqueeEnabled"`
	AutoAddCreators bool   `json:"autoAddCreators"`
	Revision        string `gorm:"size:40" json:"revision"`
}
type CreatorHomeAuthor struct {
	UserID   int    `gorm:"primaryKey" json:"userId"`
	Visible  bool   `json:"visible"`
	Position int    `json:"position"`
	Avatar   string `gorm:"type:text" json:"avatar"`
}

func GetCreatorHomeConfig(tx *gorm.DB) (CreatorHomeConfig, error) {
	c := CreatorHomeConfig{ID: 1, GalleryEnabled: true, MarqueeEnabled: true, AutoAddCreators: true, Revision: "initial"}
	err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&c).Error
	if err == nil {
		err = tx.First(&c, 1).Error
	}
	return c, err
}

func PurchaseCreatorHome(userID int, workID, plan, checkoutID, revision string) (CreatorHomeOrder, error) {
	var order CreatorHomeOrder
	credits := 0
	if plan == "year" {
		credits = 5
	} else if plan == "permanent" {
		credits = 10
	}
	if credits == 0 || len(checkoutID) < 16 || len(checkoutID) > 80 {
		return order, ErrCreatorHomeInvalid
	}
	// Same rule as the existing shop: delayed wallet persistence cannot fund an
	// atomic database purchase using a possibly stale database balance.
	if common.BatchUpdateEnabled {
		return order, errors.New("首页展示支付暂不可用，请联系管理员关闭延迟额度写入")
	}
	charged := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).First(&user, userID).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return ErrCreatorHomeInvalid
		}
		if err := tx.Where("user_id = ? AND checkout_id = ?", userID, checkoutID).Limit(1).Find(&order).Error; err != nil {
			return err
		}
		if order.ID != 0 {
			if order.WorkID != workID || order.Plan != plan {
				return ErrCreatorHomeConflict
			}
			return nil
		}
		var card CreatorHomeCard
		if err := lockForUpdate(tx).First(&card, "work_id = ? AND owner_id = ?", workID, userID).Error; err != nil {
			return ErrCreatorHomeInvalid
		}
		if card.Revision != revision {
			return ErrCreatorHomeConflict
		}
		if card.Status != "approved" || card.ApprovedImage == "" || card.Hidden || card.Permanent {
			return ErrCreatorHomeInvalid
		}
		config, err := GetCreatorHomeConfig(tx)
		if err != nil {
			return err
		}
		if !config.GalleryEnabled {
			return ErrCreatorHomeInvalid
		}
		quota, err := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(int64(credits)).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
		if err != nil || quota <= 0 {
			return ErrCreatorHomeInvalid
		}
		result := tx.Model(&User{}).Where("id = ? AND quota >= ?", userID, quota).Update("quota", gorm.Expr("quota - ?", quota))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrCreatorHomeBalance
		}
		now := time.Now().Unix()
		if plan == "permanent" {
			card.Permanent = true
			card.ExpiresAt = 0
		} else {
			start := now
			if card.ExpiresAt > start {
				start = card.ExpiresAt
			}
			card.ExpiresAt = time.Unix(start, 0).UTC().AddDate(1, 0, 0).Unix()
		}
		card.Revision, card.UpdatedAt = common.GetUUID(), now
		if err := tx.Save(&card).Error; err != nil {
			return err
		}
		order = CreatorHomeOrder{UserID: userID, WorkID: workID, CheckoutID: checkoutID, Plan: plan, Credits: credits, Quota: quota, BalanceAfter: user.Quota - quota, ExpiresAt: card.ExpiresAt, Permanent: card.Permanent, CreatedAt: now}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		charged = true
		return nil
	})
	if err == nil && charged {
		if cacheErr := cacheDecrUserQuota(userID, int64(order.Quota)); cacheErr != nil {
			common.SysError("creator home quota cache decrement failed")
			_ = invalidateUserCache(userID)
		}
	}
	return order, err
}
