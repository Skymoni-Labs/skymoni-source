package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var ErrShopRefundNeedsReview = errors.New("交付内容不能自动收回，请人工核实后处理")

type ShopRefundRecord struct {
	OrderID         int    `gorm:"primaryKey"`
	ActorID         int    `gorm:"not null"`
	Kind            string `gorm:"type:varchar(16);not null"`
	PriceCents      int64  `gorm:"not null"`
	RefundCents     int64  `gorm:"not null;default:0"`
	Quota           int    `gorm:"not null"`
	ReceiptID       int    `gorm:"not null"`
	EncryptedReason string `gorm:"type:text;not null" json:"-"`
	CreatedAt       int64  `gorm:"not null"`
}

func shopDeliveredVoucher(tx *gorm.DB, order ShopOrder) (string, error) {
	if order.ReceiptID <= 0 || (!order.DripGenerated && order.InventoryID <= 0) {
		return "", ErrShopRefundNeedsReview
	}
	var snapshot, delivered BenefitConfig
	if err := decryptBenefit(order.Encrypted, "shop-order", &snapshot); err != nil {
		return "", err
	}
	var receipt BenefitReceipt
	if err := tx.First(&receipt, order.ReceiptID).Error; err != nil {
		return "", ErrShopRefundNeedsReview
	}
	if receipt.UserID != order.UserID || receipt.CodeID != -order.ID || receipt.InventoryID != order.InventoryID {
		return "", ErrShopRefundNeedsReview
	}
	if err := decryptBenefit(receipt.Encrypted, "receipt", &delivered); err != nil {
		return "", err
	}
	if order.DripGenerated {
		if order.ProductID != 3 || order.InventoryID != 0 || len(snapshot.Fields) != 1 || len(delivered.Fields) != 1 {
			return "", ErrShopRefundNeedsReview
		}
		field := snapshot.Fields[0]
		if field.Kind != "secret" || !strings.HasPrefix(field.Value, "DRIP-") ||
			len(field.Value) > 100 || field.Value != delivered.Fields[0].Value {
			return "", ErrShopRefundNeedsReview
		}
		return field.Value, nil
	}
	var inventory BenefitInventory
	if err := tx.First(&inventory, order.InventoryID).Error; err != nil {
		return "", ErrShopRefundNeedsReview
	}
	var inventoryFields []BenefitField
	if err := decryptBenefit(inventory.Encrypted, "stock", &inventoryFields); err != nil {
		return "", err
	}
	if !inventory.Claimed || inventory.Removed || len(snapshot.Fields) != 1 || len(delivered.Fields) != 1 || len(inventoryFields) != 1 {
		return "", ErrShopRefundNeedsReview
	}
	field := snapshot.Fields[0]
	if field.Kind != "secret" || !strings.HasPrefix(field.Value, "DRIP-") || len(field.Value) > 100 || field.Value != delivered.Fields[0].Value || field.Value != inventoryFields[0].Value {
		return "", ErrShopRefundNeedsReview
	}
	return field.Value, nil
}

func shopDeliveredVoucherHash(tx *gorm.DB, order ShopOrder) (string, error) {
	code, err := shopDeliveredVoucher(tx, order)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256([]byte(code))
	return hex.EncodeToString(hash[:]), nil
}

// PrepareShopRefund never returns the voucher itself. The account service must
// revoke this hash before a delivered order can be refunded.
func PrepareShopRefund(id int) (ShopOrder, string, error) {
	var order ShopOrder
	if err := DB.First(&order, id).Error; err != nil {
		return order, "", err
	}
	if order.Status == "pending" || order.Status == "refunded" {
		return order, "", nil
	}
	if order.Status != "delivered" {
		return order, "", ErrShopConflict
	}
	hash, err := shopDeliveredVoucherHash(DB, order)
	return order, hash, err
}

func RefundShopOrder(id, actorID int, reason, revokedHash string) (ShopOrder, bool, error) {
	return RefundShopOrderWithAmount(id, actorID, reason, revokedHash, -1, -1)
}

func RefundShopOrderWithAmount(id, actorID int, reason, revokedHash string, refundQuota int, refundCents int64) (ShopOrder, bool, error) {
	var order ShopOrder
	reason = strings.TrimSpace(reason)
	if id <= 0 || actorID <= 0 || utf8.RuneCountInString(reason) < 2 || utf8.RuneCountInString(reason) > 500 || common.BatchUpdateEnabled {
		return order, false, ErrShopInvalid
	}
	changed := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&order, id).Error; err != nil {
			return err
		}
		if order.Status == "refunded" {
			return nil
		}
		if order.Status != "pending" && order.Status != "delivered" {
			return ErrShopConflict
		}
		if order.Status == "delivered" {
			hash, err := shopDeliveredVoucherHash(tx, order)
			if err != nil {
				return err
			}
			if revokedHash == "" || revokedHash != hash {
				return ErrShopConflict
			}
		} else if revokedHash != "" {
			return ErrShopConflict
		}
		if refundQuota < 0 {
			refundQuota = order.Quota
		}
		if refundCents < 0 {
			refundCents = order.PriceCents
		}
		if refundQuota < 0 || refundQuota > order.Quota || refundCents < 0 || refundCents > order.PriceCents || (order.Status == "pending" && refundQuota != order.Quota) {
			return ErrShopInvalid
		}
		now := time.Now().Unix()
		if order.InventoryID > 0 {
			var inventory BenefitInventory
			if err := lockForUpdate(tx).First(&inventory, order.InventoryID).Error; err != nil {
				return err
			}
			if !inventory.Claimed || inventory.Removed || inventory.BenefitID != order.BenefitID {
				return ErrShopConflict
			}
			updates := map[string]any{"claimed": false, "revision": gorm.Expr("revision + 1"), "updated_at": now}
			if order.Status == "delivered" {
				updates["disabled"] = true
				updates["removed"] = true
			}
			result := tx.Model(&inventory).Where("id = ? AND claimed = ? AND removed = ?", order.InventoryID, true, false).Updates(updates)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrShopConflict
			}
		}
		if order.DripGenerated {
			if err := changeGeneratedShopStock(tx, order, 1); err != nil {
				return err
			}
		} else if order.ProductID == 3 {
			_, active, err := generatedShopStock(tx, order.ProductID)
			if err != nil {
				return err
			}
			if active {
				if err := changeGeneratedShopStock(tx, order, 1); err != nil {
					return err
				}
			}
		}
		if order.Status == "delivered" {
			result := tx.Where("id = ? AND user_id = ? AND code_id = ?", order.ReceiptID, order.UserID, -order.ID).Delete(&BenefitReceipt{})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrShopConflict
			}
		}
		if refundQuota > 0 {
			result := tx.Model(&User{}).Where("id = ? AND quota <= ?", order.UserID, common.MaxWalletQuota-refundQuota).Update("quota", gorm.Expr("quota + ?", refundQuota))
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrShopBalance
			}
		}
		encrypted, err := encryptBenefit(reason, "shop-refund")
		if err != nil {
			return err
		}
		record := ShopRefundRecord{OrderID: order.ID, ActorID: actorID, Kind: order.Status, PriceCents: order.PriceCents, RefundCents: refundCents, Quota: refundQuota, ReceiptID: order.ReceiptID, EncryptedReason: encrypted, CreatedAt: now}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		order.Status, order.UpdatedAt, order.ReceiptID, order.ProvisionState, order.RefundCents = "refunded", now, 0, "none", refundCents
		if err := tx.Model(&order).Updates(map[string]any{"status": order.Status, "receipt_id": 0, "provision_state": "none", "updated_at": now}).Error; err != nil {
			return err
		}
		changed = true
		return nil
	})
	if err == nil && changed && refundQuota > 0 {
		if cacheErr := cacheIncrUserQuota(order.UserID, int64(refundQuota)); cacheErr != nil {
			common.SysError("shop quota cache refund failed")
			_ = invalidateUserCache(order.UserID)
		}
	}
	return order, changed, err
}

func LoadShopRefundDetails(orders []ShopOrder) error {
	if len(orders) == 0 {
		return nil
	}
	ids := make([]int, len(orders))
	users := make([]int, len(orders))
	for i, order := range orders {
		ids[i], users[i] = order.ID, order.UserID
	}
	var records []ShopRefundRecord
	if err := DB.Where("order_id IN ?", ids).Find(&records).Error; err != nil {
		return err
	}
	byOrder := make(map[int]ShopRefundRecord, len(records))
	for _, record := range records {
		byOrder[record.OrderID] = record
	}
	var customers []User
	if err := DB.Select("id", "username").Where("id IN ?", users).Find(&customers).Error; err != nil {
		return err
	}
	byUser := make(map[int]string, len(customers))
	for _, customer := range customers {
		byUser[customer.Id] = customer.Username
	}
	for i := range orders {
		orders[i].UserName = byUser[orders[i].UserID]
		if record, ok := byOrder[orders[i].ID]; ok {
			orders[i].RefundCents = record.RefundCents
			if record.RefundCents == 0 && record.Quota == orders[i].Quota {
				orders[i].RefundCents = record.PriceCents
			}
			var reason string
			if err := decryptBenefit(record.EncryptedReason, "shop-refund", &reason); err != nil {
				return err
			}
			orders[i].RefundReason, orders[i].RefundAt, orders[i].RefundActorID = reason, record.CreatedAt, record.ActorID
		}
	}
	return nil
}
