package model

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// ShopDripSubscription holds the current secret subscription identifier for a
// Skymoni customer. It is encrypted separately from the delivered voucher.
type ShopDripSubscription struct {
	UserID    int    `gorm:"primaryKey"`
	Encrypted string `gorm:"type:text;not null"`
	UpdatedAt int64  `gorm:"not null"`
}

// ShopOrderSubscription keeps each purchase independent. Historical customer
// subscriptions remain in ShopDripSubscription and keep their original URLs.
type ShopOrderSubscription struct {
	OrderID   int    `gorm:"primaryKey"`
	UserID    int    `gorm:"not null;index"`
	Encrypted string `gorm:"type:text;not null"`
	UpdatedAt int64  `gorm:"not null"`
}

func PendingDripShopOrders(limit int) ([]ShopOrder, error) {
	if limit < 1 || limit > 100 {
		limit = 25
	}
	var orders []ShopOrder
	err := DB.Where("status = ? AND provision_state = ?", "delivered", "pending").Order("id").Limit(limit).Find(&orders).Error
	return orders, err
}

func MarkShopOrderProvisionReview(id int) error {
	return DB.Model(&ShopOrder{}).
		Where("id = ? AND status = ? AND provision_state = ?", id, "delivered", "pending").
		Updates(map[string]any{"provision_state": "needs_review", "updated_at": time.Now().Unix()}).Error
}

func ShopOrderForProvision(id int) (ShopOrder, string, string, error) {
	var order ShopOrder
	if err := DB.First(&order, id).Error; err != nil {
		return order, "", "", err
	}
	if order.Status != "delivered" || order.ProvisionState != "pending" {
		return order, "", "", ErrShopConflict
	}
	code, err := shopDeliveredVoucher(DB, order)
	if err != nil {
		return order, "", "", err
	}
	var user User
	if err := DB.Select("id", "username").First(&user, order.UserID).Error; err != nil {
		return order, "", "", err
	}
	return order, code, user.Username, nil
}

func MarkShopOrderProvisioned(id int, subscriptionID string) error {
	if len(subscriptionID) < 8 || len(subscriptionID) > 128 {
		return ErrShopInvalid
	}
	for _, character := range subscriptionID {
		if !(character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' || character == '-' || character == '_') {
			return ErrShopInvalid
		}
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var order ShopOrder
		if err := lockForUpdate(tx).First(&order, id).Error; err != nil {
			return err
		}
		if order.Status != "delivered" || order.ProvisionState == "none" {
			return ErrShopConflict
		}
		purpose := fmt.Sprintf("shop-order-subscription:%d", order.ID)
		encrypted, err := encryptBenefit(subscriptionID, purpose)
		if err != nil {
			return err
		}
		now := time.Now().Unix()
		var row ShopOrderSubscription
		err = lockForUpdate(tx).First(&row, "order_id = ?", order.ID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			row = ShopOrderSubscription{OrderID: order.ID, UserID: order.UserID, Encrypted: encrypted, UpdatedAt: now}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else {
			var storedID string
			if err := decryptBenefit(row.Encrypted, purpose, &storedID); err != nil {
				return err
			}
			if row.UserID != order.UserID || storedID != subscriptionID {
				return ErrShopConflict
			}
		}
		return tx.Model(&order).Updates(map[string]any{"provision_state": "ready", "updated_at": now}).Error
	})
}

func ShopSubscriptionLinksForOrder(userID, orderID int) (string, string, error) {
	var order ShopOrder
	if err := DB.Where("id = ? AND user_id = ? AND status = ? AND provision_state = ?", orderID, userID, "delivered", "ready").First(&order).Error; err != nil {
		return "", "", err
	}
	var row ShopOrderSubscription
	err := DB.Where("order_id = ? AND user_id = ?", orderID, userID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ShopSubscriptionLinks(userID)
	}
	if err != nil {
		return "", "", err
	}
	var subscriptionID string
	if err := decryptBenefit(row.Encrypted, fmt.Sprintf("shop-order-subscription:%d", orderID), &subscriptionID); err != nil {
		return "", "", err
	}
	return fmt.Sprintf("https://skymoni.com/api/drip/sub/clash/%s", subscriptionID),
		fmt.Sprintf("https://skymoni.com/api/drip/sub/sub/%s", subscriptionID), nil
}

func ShopSubscriptionLinks(userID int) (string, string, error) {
	var count int64
	if err := DB.Model(&ShopOrder{}).Where("user_id = ? AND status = ? AND provision_state = ?", userID, "delivered", "ready").Count(&count).Error; err != nil || count == 0 {
		return "", "", err
	}
	var row ShopDripSubscription
	if err := DB.First(&row, "user_id = ?", userID).Error; err != nil {
		return "", "", err
	}
	var subscriptionID string
	if err := decryptBenefit(row.Encrypted, "shop-subscription", &subscriptionID); err != nil {
		return "", "", err
	}
	return fmt.Sprintf("https://skymoni.com/api/drip/sub/clash/%s", subscriptionID),
		fmt.Sprintf("https://skymoni.com/api/drip/sub/sub/%s", subscriptionID), nil
}
