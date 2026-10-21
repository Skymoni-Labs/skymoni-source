package model

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGeneratedDripFiveTiers(t *testing.T) {
	for _, tier := range []struct {
		name  string
		quota int
	}{
		{"20 GiB 体验装", 20}, {"50 GiB", 50}, {"100 GiB", 100}, {"200 GiB", 200}, {"500 GiB", 500},
	} {
		quota, err := generatedDripQuota("package", tier.name)
		require.NoError(t, err, tier.name)
		require.Equal(t, tier.quota, quota)
	}
	for _, invalid := range []string{"0 GiB", "1000 GiB", "20 GiB unlimited", "体验装"} {
		_, err := generatedDripQuota("package", invalid)
		require.Error(t, err)
	}
}

func TestGeneratedDripAddTiersPreservesStockAndRefund(t *testing.T) {
	t.Setenv("BENEFITS_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("s", 32))))
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	previousDB, previousRedis, previousBatch := DB, common.RedisEnabled, common.BatchUpdateEnabled
	mainType := common.MainDatabaseType()
	DB, common.RedisEnabled, common.BatchUpdateEnabled = db, false, false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.LogDatabaseType())
	t.Cleanup(func() {
		DB, common.RedisEnabled, common.BatchUpdateEnabled = previousDB, previousRedis, previousBatch
		common.SetDatabaseTypes(mainType, common.LogDatabaseType())
		sqlDB.Close()
	})
	require.NoError(t, db.AutoMigrate(&User{}, &Benefit{}, &BenefitInventory{}, &BenefitCode{}, &BenefitReceipt{}, &ShopProduct{}, &ShopGeneratedStock{}, &ShopOrder{}, &ShopRefundRecord{}))
	config := ShopConfig{Benefit: BenefitConfig{Name: "Drip", Category: "license", Tone: "sky", Format: "markdown", StockMode: "individual", Enabled: true, ValidityDays: 100, Fields: []BenefitField{{ID: "code", Label: "兑换码", Kind: "secret"}}},
		PriceCents: 35000, Delivery: "instant", OnSale: true, CategoryLabel: "Drip", DefaultPackageName: "100 GiB",
		Packages: []ShopPackage{{ID: "200", Name: "200 GiB", PriceCents: 50000, ValidityDays: 100, Delivery: "instant"}, {ID: "500", Name: "500 GiB", PriceCents: 100000, ValidityDays: 100, Delivery: "instant"}}}
	value, err := encryptBenefit(config, "shop")
	require.NoError(t, err)
	require.NoError(t, db.Create(&ShopProduct{ID: 3, Name: "Drip", OnSale: true, Encrypted: value, Revision: 1}).Error)
	config, err = SaveShopProduct(3, config)
	require.NoError(t, err)
	require.NoError(t, SetShopGeneratedStock(3, map[string]int64{"default": 7, "200": 8, "500": 9}))
	config.Packages = append(config.Packages, ShopPackage{ID: "20", Name: "20 GiB 体验装", PriceCents: 9900, ValidityDays: 100, Delivery: "instant"}, ShopPackage{ID: "50", Name: "50 GiB", PriceCents: 18800, ValidityDays: 100, Delivery: "instant"})
	_, err = SaveShopProduct(3, config)
	require.NoError(t, err)
	stock, active, err := generatedShopStock(db, 3)
	require.NoError(t, err)
	require.True(t, active)
	require.Equal(t, map[string]int64{"default": 7, "200": 8, "500": 9, "20": 0, "50": 0}, stock)
	stock["20"], stock["50"] = 1, 1
	require.NoError(t, SetShopGeneratedStock(3, stock))
	user := User{Username: "tiercheck", Password: "not-loginable", AffCode: "tiercheck", Role: 1, Status: common.UserStatusEnabled, Quota: 1000000000}
	require.NoError(t, db.Create(&user).Error)
	for _, tier := range []struct {
		id    string
		price int64
		quota int
	}{{"20", 9900, 20}, {"50", 18800, 50}} {
		_, err = PurchaseShop(user.Id, 3, tier.id, "stale-tier-checkout-"+tier.id, tier.price-1)
		require.ErrorIs(t, err, ErrShopConflict)
		order, err := PurchaseShop(user.Id, 3, tier.id, "tier-checkout-fixture-"+tier.id, tier.price)
		require.NoError(t, err)
		require.Equal(t, tier.quota, order.DripQuotaGiB)
		require.Equal(t, tier.price, order.PriceCents)
		_, hash, err := PrepareShopRefund(order.ID)
		require.NoError(t, err)
		_, changed, err := RefundShopOrderWithAmount(order.ID, 1, "fixture cleanup", hash, order.Quota, order.PriceCents)
		require.NoError(t, err)
		require.True(t, changed)
	}
	stock, _, err = generatedShopStock(db, 3)
	require.NoError(t, err)
	require.Equal(t, map[string]int64{"default": 7, "200": 8, "500": 9, "20": 1, "50": 1}, stock)
	current := func() ShopConfig {
		var row ShopProduct
		require.NoError(t, db.First(&row, 3).Error)
		view, err := ShopProductView(row, true)
		require.NoError(t, err)
		return view
	}
	config = current()
	config.Packages = append(config.Packages, ShopPackage{ID: "custom", Name: "自定义试用", QuotaGiB: 47, PriceCents: 12345, ValidityDays: 21, Delivery: "instant"})
	_, err = SaveShopProduct(3, config)
	require.NoError(t, err)
	config = current()
	require.Contains(t, config.Content, "47 GiB")
	require.Contains(t, config.Content, "123.45")
	require.Contains(t, config.Benefit.Instructions, "21 天")
	stock = config.StockByPackage
	stock["custom"] = 2
	require.NoError(t, SetShopGeneratedStock(3, stock))
	old, err := PurchaseShop(user.Id, 3, "custom", "custom-old-fixture-checkout", 12345)
	require.NoError(t, err)
	days, err := ShopOrderDurationDays(old)
	require.NoError(t, err)
	require.Equal(t, 21, days)
	stale := current()
	config = stale
	config.Packages[len(config.Packages)-1].QuotaGiB = 63
	config.Packages[len(config.Packages)-1].ValidityDays = 9
	config.Packages[len(config.Packages)-1].PriceCents = 54321
	_, err = SaveShopProduct(3, config)
	require.NoError(t, err)
	_, err = SaveShopProduct(3, stale)
	require.ErrorIs(t, err, ErrShopConflict)
	cachedEditor := current()
	cachedEditor.QuotaGiB = 0
	for i := range cachedEditor.Packages {
		cachedEditor.Packages[i].QuotaGiB = 0
	}
	_, err = SaveShopProduct(3, cachedEditor)
	require.NoError(t, err)
	require.Equal(t, 63, current().Packages[len(current().Packages)-1].QuotaGiB)
	_, err = PurchaseShop(user.Id, 3, "custom", "custom-stale-price-fixture", 12345)
	require.ErrorIs(t, err, ErrShopConflict)
	newer, err := PurchaseShop(user.Id, 3, "custom", "custom-new-fixture-checkout", 54321)
	require.NoError(t, err)
	require.Equal(t, 63, newer.DripQuotaGiB)
	days, err = ShopOrderDurationDays(newer)
	require.NoError(t, err)
	require.Equal(t, 9, days)
	view, err := GetBenefitWarehouseDetail(old.ReceiptID, user.Id)
	require.NoError(t, err)
	require.Contains(t, view.Benefit.Summary, "47 GiB")
	require.Contains(t, view.Benefit.Summary, "21 天")
	require.Contains(t, view.Benefit.Summary, "123.45")
	require.NotContains(t, view.Benefit.Instructions, "543.21")
	config = current()
	config.Packages = config.Packages[:len(config.Packages)-1]
	_, err = SaveShopProduct(3, config)
	require.NoError(t, err)
	require.NotContains(t, current().StockByPackage, "custom")
	for _, order := range []ShopOrder{old, newer} {
		_, hash, err := PrepareShopRefund(order.ID)
		require.NoError(t, err)
		_, changed, err := RefundShopOrderWithAmount(order.ID, 1, "fixture cleanup", hash, order.Quota, order.PriceCents)
		require.NoError(t, err)
		require.True(t, changed)
	}
	stock, _, err = generatedShopStock(db, 3)
	require.NoError(t, err)
	require.Equal(t, int64(2), stock["custom"])
	require.NoError(t, SetShopGeneratedStock(3, current().StockByPackage))
	stock, _, err = generatedShopStock(db, 3)
	require.NoError(t, err)
	require.Equal(t, int64(2), stock["custom"])

}
