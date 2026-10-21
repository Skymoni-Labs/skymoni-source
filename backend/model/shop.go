package model

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

var ErrShopConflict = errors.New("商品已变更、已下架或订单状态不允许此操作，请刷新后重试")
var ErrShopBalance = errors.New("可用余额不足，未扣除额度")
var ErrShopInvalid = errors.New("商品配置无效，请检查价格、套餐和内容长度")

var shopImageURL = regexp.MustCompile(`^/api/shop/images/[a-f0-9]{64}\.jpg$`)

func IsShopImageURL(value string) bool {
	return shopImageURL.MatchString(value)
}

type ShopPackage struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	PriceCents   int64  `json:"priceCents"`
	ValidityDays int    `json:"validityDays"`
	QuotaGiB     int    `json:"quotaGiB,omitempty"`
	Delivery     string `json:"delivery"`
}
type ShopAttribute struct {
	Label string `json:"label"`
	Value string `json:"value"`
}
type ShopConfig struct {
	ID                 string            `json:"id"`
	Revision           int64             `json:"revision,omitempty"`
	QuotaGiB           int               `json:"quotaGiB,omitempty"`
	Benefit            BenefitConfig     `json:"benefit"`
	PriceCents         int64             `json:"priceCents"`
	Delivery           string            `json:"delivery"`
	Featured           bool              `json:"featured"`
	CategoryLabel      string            `json:"categoryLabel"`
	OnSale             bool              `json:"onSale"`
	DefaultPackageName string            `json:"defaultPackageName"`
	Packages           []ShopPackage     `json:"packages"`
	CoverURL           string            `json:"coverUrl"`
	Tags               string            `json:"tags"`
	Content            string            `json:"content"`
	ContentFormat      string            `json:"contentFormat"`
	ImagesEnabled      bool              `json:"imagesEnabled"`
	ImageLayout        string            `json:"imageLayout,omitempty"`
	Images             []string          `json:"images"`
	Attributes         []ShopAttribute   `json:"attributes"`
	CardSize           string            `json:"cardSize"`
	SortOrder          int               `json:"sortOrder"`
	ResourceIDs        map[string]string `json:"resourceIds,omitempty"`
	StockByPackage     map[string]int64  `json:"stockByPackage"`
	GeneratedSales     bool              `json:"generatedSales,omitempty"`
}
type ShopProduct struct {
	ID        int    `gorm:"primaryKey"`
	Name      string `gorm:"type:varchar(80);not null"`
	OnSale    bool   `gorm:"not null;index"`
	Encrypted string `gorm:"type:text;not null" json:"-"`
	Revision  int64  `gorm:"not null;default:1"`
	CreatedAt int64  `gorm:"not null"`
	UpdatedAt int64  `gorm:"not null"`
}
type ShopOrder struct {
	ID             int    `json:"id" gorm:"primaryKey"`
	UserID         int    `json:"user_id" gorm:"not null;uniqueIndex:idx_shop_checkout,priority:1;index:idx_shop_owner,priority:1"`
	CheckoutID     string `json:"checkout_id" gorm:"type:varchar(80);not null;uniqueIndex:idx_shop_checkout,priority:2"`
	ProductID      int    `json:"product_id" gorm:"not null;index"`
	PackageID      string `json:"package_id" gorm:"type:varchar(80);not null"`
	PackageName    string `json:"package_name" gorm:"type:varchar(60);not null"`
	Name           string `json:"name" gorm:"type:varchar(160);not null"`
	PriceCents     int64  `json:"price_cents" gorm:"not null"`
	Quota          int    `json:"-" gorm:"not null"`
	BenefitID      int    `json:"-" gorm:"not null"`
	InventoryID    int    `json:"-" gorm:"not null"`
	DripGenerated  bool   `json:"-" gorm:"not null;default:false"`
	DripQuotaGiB   int    `json:"-" gorm:"not null;default:0"`
	ReceiptID      int    `json:"receipt_id" gorm:"not null"`
	Encrypted      string `json:"-" gorm:"type:text;not null"`
	Status         string `json:"status" gorm:"type:varchar(16);not null;index"`
	ProvisionState string `json:"provision_state" gorm:"type:varchar(16);not null;default:none;index"`
	CreatedAt      int64  `json:"created_at" gorm:"not null;index:idx_shop_owner,priority:2"`
	UpdatedAt      int64  `json:"updated_at" gorm:"not null"`
	UserName       string `json:"user_name,omitempty" gorm:"-"`
	RefundReason   string `json:"refund_reason,omitempty" gorm:"-"`
	RefundAt       int64  `json:"refund_at,omitempty" gorm:"-"`
	RefundActorID  int    `json:"refund_actor_id,omitempty" gorm:"-"`
	RefundCents    int64  `json:"refund_cents,omitempty" gorm:"-"`
}

func shopPackages(c ShopConfig) []ShopPackage {
	return append([]ShopPackage{{ID: "default", Name: c.DefaultPackageName, PriceCents: c.PriceCents, ValidityDays: c.Benefit.ValidityDays, QuotaGiB: c.QuotaGiB, Delivery: c.Delivery}}, c.Packages...)
}
func validateShop(c *ShopConfig) error {
	if err := ValidateBenefit(&c.Benefit); err != nil {
		return err
	}
	if c.CardSize == "" {
		c.CardSize = "normal"
	}
	if c.ContentFormat == "" {
		c.ContentFormat = "markdown"
	}
	if c.DefaultPackageName == "" {
		c.DefaultPackageName = "标准套餐"
	}
	if strings.TrimSpace(c.CategoryLabel) == "" || utf8.RuneCountInString(c.CategoryLabel) > 40 || len(c.Tags) > 800 || len(c.Content) > 16000 || !utf8.ValidString(c.Content) || len(c.Attributes) > 20 || len(c.Packages) > 20 || c.SortOrder < 0 || c.SortOrder > 1000000 || !slices.Contains([]string{"normal", "large"}, c.CardSize) || !slices.Contains([]string{"markdown", "html", "text"}, c.ContentFormat) {
		return ErrShopInvalid
	}
	if c.CoverURL != "" {
		u, err := url.Parse(c.CoverURL)
		if err != nil || len(c.CoverURL) > 2048 || !(strings.HasPrefix(c.CoverURL, "/") && !strings.HasPrefix(c.CoverURL, "//") || u.Scheme == "https" && u.Host != "" && u.User == nil) {
			return ErrShopInvalid
		}
	}
	if len(c.Images) > 12 {
		return ErrShopInvalid
	}
	if c.ImageLayout == "" {
		c.ImageLayout = "landscape"
	}
	if !slices.Contains([]string{"landscape", "portrait"}, c.ImageLayout) {
		return ErrShopInvalid
	}
	for _, image := range c.Images {
		if !IsShopImageURL(image) {
			return ErrShopInvalid
		}
	}
	seen := map[string]bool{}
	for _, p := range shopPackages(*c) {
		if p.ID == "" || len(p.ID) > 80 || seen[p.ID] || strings.TrimSpace(p.Name) == "" || utf8.RuneCountInString(p.Name) > 60 || p.PriceCents < 1 || p.PriceCents > 100000000 || p.ValidityDays < 0 || p.ValidityDays > 3650 || !slices.Contains([]string{"instant", "manual"}, p.Delivery) {
			return ErrShopInvalid
		}
		seen[p.ID] = true
	}
	for _, a := range c.Attributes {
		if strings.TrimSpace(a.Label) == "" || utf8.RuneCountInString(a.Label) > 60 || utf8.RuneCountInString(a.Value) > 500 {
			return ErrShopInvalid
		}
	}
	return nil
}

func SaveShopProduct(id int, c ShopConfig) (ShopConfig, error) {
	if err := validateShop(&c); err != nil {
		return c, err
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var row ShopProduct
		previous := ShopConfig{ResourceIDs: map[string]string{}}
		if id > 0 {
			if err := lockForUpdate(tx).First(&row, id).Error; err != nil {
				return err
			}
			if err := decryptBenefit(row.Encrypted, "shop", &previous); err != nil {
				return err
			}
			if _, generated, err := generatedShopStock(tx, id); err != nil {
				return err
			} else if generated {
				if c.Revision > 0 && c.Revision != row.Revision {
					return ErrShopConflict
				}
				// Older cached editors omit the new quota field on additional tiers.
				// Preserve an existing explicit value instead of re-inferring its name.
				if c.QuotaGiB == 0 {
					c.QuotaGiB = previous.QuotaGiB
				}
				for i := range c.Packages {
					if c.Packages[i].QuotaGiB != 0 {
						continue
					}
					for _, old := range previous.Packages {
						if old.ID == c.Packages[i].ID {
							c.Packages[i].QuotaGiB = old.QuotaGiB
							break
						}
					}
				}
				if err := normalizeDripPlans(&c); err != nil {
					return err
				}
				syncDripPlanText(&c, previous)
				if err := validateShop(&c); err != nil {
					return err
				}
			}
			if err := extendGeneratedShopStock(tx, id, shopPackages(previous), shopPackages(c)); err != nil {
				return err
			}
		}
		c.ResourceIDs = map[string]string{}
		for _, pack := range shopPackages(c) {
			resourceID, _ := strconv.Atoi(previous.ResourceIDs[pack.ID])
			// Existing resources are linked only by the root administrator on creation.
			if id == 0 && pack.ID == "default" {
				resourceID, _ = strconv.Atoi(c.Benefit.ID)
			}
			config := c.Benefit
			config.Name = c.Benefit.Name
			if pack.ID != "default" {
				config.Name += " · " + pack.Name
			}
			if utf8.RuneCountInString(config.Name) > 80 {
				if c.QuotaGiB > 0 {
					config.Name = string([]rune(config.Name)[:80])
				} else {
					return ErrShopInvalid
				}
			}
			config.ValidityDays = pack.ValidityDays
			if err := ValidateBenefit(&config); err != nil {
				return err
			}
			if resourceID > 0 {
				var pending int64
				if err := tx.Model(&ShopOrder{}).Where("benefit_id = ? AND status = ?", resourceID, "pending").Count(&pending).Error; err != nil {
					return err
				}
				if pending > 0 {
					return errors.New("有待交付订单时请先交付或退款，再修改商品")
				}
			}
			if err := saveBenefitTx(tx, resourceID, &config); err != nil {
				return err
			}
			c.ResourceIDs[pack.ID] = config.ID
			if pack.ID == "default" {
				c.Benefit.ID = config.ID
			}
		}
		// Removing a package must not orphan inventory, codes or pending orders.
		for pack, id := range previous.ResourceIDs {
			if _, exists := c.ResourceIDs[pack]; exists {
				continue
			}
			var stocks, codes, pending int64
			if err := tx.Model(&BenefitInventory{}).Where("benefit_id = ? AND claimed = ?", id, false).Count(&stocks).Error; err != nil {
				return err
			}
			if err := tx.Model(&BenefitCode{}).Where("benefit_id = ? AND enabled = ?", id, true).Count(&codes).Error; err != nil {
				return err
			}
			if err := tx.Model(&ShopOrder{}).Where("benefit_id = ? AND status = ?", id, "pending").Count(&pending).Error; err != nil {
				return err
			}
			if stocks+codes+pending > 0 {
				return errors.New("套餐仍有库存、启用卡密或待交付订单，不能移除")
			}
		}
		c.StockByPackage = nil
		c.GeneratedSales = false
		c.Revision = 0
		encrypted, err := encryptBenefit(c, "shop")
		if err != nil {
			return err
		}
		now := time.Now().Unix()
		if id == 0 {
			row = ShopProduct{Name: c.Benefit.Name, OnSale: c.OnSale, Encrypted: encrypted, Revision: 1, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Model(&row).Updates(map[string]any{"name": c.Benefit.Name, "on_sale": c.OnSale, "encrypted": encrypted, "revision": gorm.Expr("revision + 1"), "updated_at": now}).Error; err != nil {
				return err
			}
		}
		c.ID = strconv.Itoa(row.ID)
		c.Revision = row.Revision
		if id > 0 {
			c.Revision++
		}
		return nil
	})
	return c, err
}

func ShopProductView(row ShopProduct, private bool) (ShopConfig, error) {
	var c ShopConfig
	if err := decryptBenefit(row.Encrypted, "shop", &c); err != nil {
		return c, err
	}
	c.ID = strconv.Itoa(row.ID)
	c.Revision = row.Revision
	c.OnSale = row.OnSale
	c.StockByPackage = map[string]int64{}
	for pack, id := range c.ResourceIDs {
		var resource Benefit
		if err := DB.First(&resource, id).Error; err != nil {
			return c, err
		}
		var count int64
		if resource.Enabled && resource.StockMode == "shared" {
			count = -1
		} else if resource.Enabled {
			if err := DB.Model(&BenefitInventory{}).Where("benefit_id = ? AND claimed = ? AND disabled = ? AND removed = ?", id, false, false, false).Count(&count).Error; err != nil {
				return c, err
			}
		}
		c.StockByPackage[pack] = count
		if pack == "default" {
			c.Benefit.Enabled = resource.Enabled
		}
	}
	if remaining, active, err := generatedShopStock(DB, row.ID); err != nil {
		return c, err
	} else if active {
		c.StockByPackage = map[string]int64{}
		for _, pack := range shopPackages(c) {
			c.StockByPackage[pack.ID] = remaining[pack.ID]
		}
		c.GeneratedSales = true
		if err := normalizeDripPlans(&c); err != nil {
			return c, err
		}
	}
	if !private {
		c.Benefit.Instructions = ""
		c.Benefit.Fields = []BenefitField{}
		c.ResourceIDs = nil
	}
	return c, nil
}

func shopReceipt(tx *gorm.DB, order *ShopOrder, config BenefitConfig, now int64) error {
	encrypted, err := encryptBenefit(config, "receipt")
	if err != nil {
		return err
	}
	receipt := BenefitReceipt{UserID: order.UserID, CodeID: -order.ID, BenefitID: order.BenefitID, InventoryID: order.InventoryID, Name: config.Name, Summary: config.Summary, Category: config.Category, Tone: config.Tone, Encrypted: encrypted, ReceivedAt: now}
	if config.ValidityDays > 0 {
		receipt.ExpiresAt = now + int64(config.ValidityDays)*86400
	}
	if err := tx.Create(&receipt).Error; err != nil {
		return err
	}
	order.ReceiptID = receipt.ID
	order.Status = "delivered"
	order.UpdatedAt = now
	return tx.Model(order).Updates(map[string]any{"receipt_id": receipt.ID, "status": order.Status, "updated_at": now}).Error
}

func PurchaseShop(userID, productID int, packageID, checkoutID string, expectedPrice int64) (ShopOrder, error) {
	var order ShopOrder
	if userID <= 0 || len(checkoutID) < 16 || len(checkoutID) > 80 || packageID == "" || len(packageID) > 80 {
		return order, ErrShopInvalid
	}
	// Delayed relay writes cannot be used as the authority for an atomic wallet purchase.
	if common.BatchUpdateEnabled {
		return order, errors.New("商城暂不可用，请联系管理员关闭延迟额度写入")
	}
	charged := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var product ShopProduct
		if err := lockForUpdate(tx).First(&product, productID).Error; err != nil {
			return ErrShopConflict
		}
		if err := tx.Where("user_id = ? AND checkout_id = ?", userID, checkoutID).Limit(1).Find(&order).Error; err != nil {
			return err
		}
		if order.ID > 0 {
			if order.ProductID != productID || order.PackageID != packageID {
				return ErrShopConflict
			}
			return nil
		}
		if !product.OnSale {
			return ErrShopConflict
		}
		var config ShopConfig
		if err := decryptBenefit(product.Encrypted, "shop", &config); err != nil {
			return err
		}
		var selection *ShopPackage
		for _, pack := range shopPackages(config) {
			if pack.ID == packageID {
				selection = &pack
				break
			}
		}
		if selection == nil || selection.PriceCents != expectedPrice {
			return ErrShopConflict
		}
		quota, err := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(selection.PriceCents).Div(decimal.NewFromInt(100)).Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
		if err != nil || quota <= 0 {
			return ErrShopInvalid
		}
		benefitID, _ := strconv.Atoi(config.ResourceIDs[packageID])
		_, generated, err := generatedShopStock(tx, productID)
		if err != nil {
			return err
		}
		var snapshot BenefitConfig
		var stockID, dripQuotaGiB int
		if generated {
			if dripQuotaGiB, err = dripPlanQuota(*selection); err != nil {
				return err
			}
			if err := changeGeneratedShopStock(tx, ShopOrder{ProductID: productID, PackageID: packageID}, -1); err != nil {
				return err
			}
			var resource Benefit
			if err := tx.First(&resource, benefitID).Error; err != nil || !resource.Enabled {
				return ErrBenefitUnavailable
			}
			if err := decryptBenefit(resource.Encrypted, "config", &snapshot); err != nil {
				return err
			}
			snapshot.ValidityDays = selection.ValidityDays
			if selection.ValidityDays < 1 || selection.ValidityDays > 3650 {
				return ErrShopInvalid
			}
			var random [18]byte
			if _, err := rand.Read(random[:]); err != nil {
				return err
			}
			snapshot.Fields = []BenefitField{{ID: "code", Label: "兑换码", Kind: "secret", Value: "DRIP-" + base64.RawURLEncoding.EncodeToString(random[:])}}
		} else {
			snapshot, stockID, err = allocateBenefitStock(tx, benefitID)
			if err != nil {
				return err
			}
		}
		result := tx.Model(&User{}).Where("id = ? AND status = ? AND quota >= ?", userID, common.UserStatusEnabled, quota).Update("quota", gorm.Expr("quota - ?", quota))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrShopBalance
		}
		encrypted, err := encryptBenefit(snapshot, "shop-order")
		if err != nil {
			return err
		}
		now := time.Now().Unix()
		provisionState := "none"
		if selection.Delivery == "instant" && len(snapshot.Fields) == 1 && snapshot.Fields[0].Kind == "secret" && strings.HasPrefix(snapshot.Fields[0].Value, "DRIP-") {
			provisionState = "pending"
		}
		order = ShopOrder{UserID: userID, CheckoutID: checkoutID, ProductID: productID, PackageID: packageID, PackageName: selection.Name, Name: config.Benefit.Name, PriceCents: selection.PriceCents, Quota: quota, BenefitID: benefitID, InventoryID: stockID, DripGenerated: generated, DripQuotaGiB: dripQuotaGiB, Encrypted: encrypted, Status: "pending", ProvisionState: provisionState, CreatedAt: now, UpdatedAt: now}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		if selection.Delivery == "instant" {
			if err := shopReceipt(tx, &order, snapshot, now); err != nil {
				return err
			}
		}
		charged = true
		return nil
	})
	if err == nil && charged {
		if cacheErr := cacheDecrUserQuota(userID, int64(order.Quota)); cacheErr != nil {
			common.SysError("shop quota cache decrement failed")
			_ = invalidateUserCache(userID)
		}
	}
	return order, err
}

func SettleShopOrder(id int, refund bool) (ShopOrder, error) {
	var order ShopOrder
	if common.BatchUpdateEnabled {
		return order, ErrShopConflict
	}
	changed := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&order, id).Error; err != nil {
			return err
		}
		if refund && order.Status == "refunded" || !refund && order.Status == "delivered" {
			return nil
		}
		if order.Status != "pending" {
			return ErrShopConflict
		}
		now := time.Now().Unix()
		if !refund {
			var snapshot BenefitConfig
			if err := decryptBenefit(order.Encrypted, "shop-order", &snapshot); err != nil {
				return err
			}
			return shopReceipt(tx, &order, snapshot, now)
		}
		if order.InventoryID > 0 {
			var resource Benefit
			if err := lockForUpdate(tx).First(&resource, order.BenefitID).Error; err != nil {
				return err
			}
			if err := tx.Model(&BenefitInventory{}).Where("id = ? AND claimed = ?", order.InventoryID, true).Updates(map[string]any{"claimed": false, "revision": gorm.Expr("revision + 1"), "updated_at": now}).Error; err != nil {
				return err
			}
		}
		result := tx.Model(&User{}).Where("id = ? AND quota <= ?", order.UserID, common.MaxWalletQuota-order.Quota).Update("quota", gorm.Expr("quota + ?", order.Quota))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrShopBalance
		}
		order.Status = "refunded"
		order.UpdatedAt = now
		if err := tx.Model(&order).Updates(map[string]any{"status": "refunded", "updated_at": now}).Error; err != nil {
			return err
		}
		changed = true
		return nil
	})
	if err == nil && changed {
		if cacheErr := cacheIncrUserQuota(order.UserID, int64(order.Quota)); cacheErr != nil {
			common.SysError("shop quota cache refund failed")
			_ = invalidateUserCache(order.UserID)
		}
	}
	return order, err
}
