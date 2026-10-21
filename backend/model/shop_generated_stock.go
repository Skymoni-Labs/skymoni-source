package model

import (
	"encoding/json"
	"errors"
	"strconv"

	"gorm.io/gorm"
)

// ShopGeneratedStock is the remaining number of sales for a generated Drip
// package. Its presence activates order-time voucher creation for product 3.
// Existing inventory and orders retain the legacy delivery path.
type ShopGeneratedStock struct {
	ProductID int    `gorm:"primaryKey"`
	Remaining string `gorm:"type:text;not null"`
}

func generatedShopStock(tx *gorm.DB, productID int) (map[string]int64, bool, error) {
	if productID != 3 {
		return nil, false, nil
	}
	var row ShopGeneratedStock
	err := tx.First(&row, "product_id = ?", productID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var remaining map[string]int64
	if err := json.Unmarshal([]byte(row.Remaining), &remaining); err != nil {
		return nil, false, err
	}
	return remaining, true, nil
}

func SetShopGeneratedStock(productID int, remaining map[string]int64) error {
	if productID != 3 || len(remaining) == 0 {
		return ErrShopInvalid
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var product ShopProduct
		if err := lockForUpdate(tx).First(&product, productID).Error; err != nil {
			return err
		}
		var config ShopConfig
		if err := decryptBenefit(product.Encrypted, "shop", &config); err != nil {
			return err
		}
		packages := shopPackages(config)
		if len(remaining) != len(packages) {
			return ErrShopInvalid
		}
		for _, pack := range packages {
			count, ok := remaining[pack.ID]
			if !ok || count < 0 || count > 1_000_000 || pack.Delivery != "instant" {
				return ErrShopInvalid
			}
			if _, err := dripPlanQuota(pack); err != nil {
				return err
			}
		}
		payload, err := json.Marshal(remaining)
		if err != nil {
			return err
		}
		var row ShopGeneratedStock
		err = lockForUpdate(tx).First(&row, "product_id = ?", productID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return tx.Create(&ShopGeneratedStock{ProductID: productID, Remaining: string(payload)}).Error
		}
		if err != nil {
			return err
		}
		var previous map[string]int64
		if err := json.Unmarshal([]byte(row.Remaining), &previous); err != nil {
			return err
		}
		for id, count := range remaining {
			previous[id] = count
		}
		payload, err = json.Marshal(previous)
		if err != nil {
			return err
		}
		return tx.Model(&row).Update("remaining", string(payload)).Error
	})
}

func changeGeneratedShopStock(tx *gorm.DB, order ShopOrder, delta int64) error {
	var row ShopGeneratedStock
	if err := lockForUpdate(tx).First(&row, "product_id = ?", order.ProductID).Error; err != nil {
		return err
	}
	var remaining map[string]int64
	if err := json.Unmarshal([]byte(row.Remaining), &remaining); err != nil {
		return err
	}
	count, ok := remaining[order.PackageID]
	if !ok || count+delta < 0 || count+delta > 1_000_000 {
		return ErrBenefitStock
	}
	remaining[order.PackageID] = count + delta
	payload, err := json.Marshal(remaining)
	if err != nil {
		return err
	}
	return tx.Model(&row).Update("remaining", string(payload)).Error
}

func generatedDripQuota(packageID, name string) (int, error) {
	if name == "20 GiB 体验装" {
		return 20, nil
	}
	for _, quota := range []int{20, 50, 100, 200, 500} {
		if name == strconv.Itoa(quota)+" GiB" {
			return quota, nil
		}
	}
	return 0, ErrShopInvalid
}

// Adding a generated tier preserves every existing quantity and initializes
// only the new tier to zero. The administrator can then set its sale quantity.
func extendGeneratedShopStock(tx *gorm.DB, productID int, previous, requested []ShopPackage) error {
	if productID != 3 {
		return nil
	}
	var row ShopGeneratedStock
	err := lockForUpdate(tx).First(&row, "product_id = ?", productID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	var remaining map[string]int64
	if err := json.Unmarshal([]byte(row.Remaining), &remaining); err != nil {
		return err
	}
	changed := false
	for _, pack := range requested {
		if _, err := dripPlanQuota(pack); err != nil || pack.Delivery != "instant" {
			return ErrShopInvalid
		}
		if _, exists := remaining[pack.ID]; !exists {
			remaining[pack.ID], changed = 0, true
		}
	}
	// Removed tiers retain a hidden counter for refunds of their old orders.
	if !changed {
		return nil
	}
	payload, err := json.Marshal(remaining)
	if err != nil {
		return err
	}
	return tx.Model(&row).Update("remaining", string(payload)).Error
}
