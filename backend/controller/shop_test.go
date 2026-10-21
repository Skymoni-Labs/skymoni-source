package controller

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
)

func TestShopDatabaseMatrix(t *testing.T) {
	t.Setenv("BENEFITS_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("s", 32))))
	t.Setenv("SHOP_IMAGE_DIR", t.TempDir())
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN required")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN required")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "shop_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			logDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
			require.NoError(t, err)
			require.NoError(t, logDB.AutoMigrate(&model.AuditLog{}))
			previousDB, previousLog, previousRedis, previousBatch := model.DB, model.LOG_DB, common.RedisEnabled, common.BatchUpdateEnabled
			mainType, logType := common.MainDatabaseType(), common.LogDatabaseType()
			model.DB, model.LOG_DB, common.RedisEnabled, common.BatchUpdateEnabled = db, logDB, false, false
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseTypeSQLite)
			models := []any{&model.User{}, &model.Benefit{}, &model.BenefitInventory{}, &model.BenefitInventoryEvent{}, &model.BenefitCode{}, &model.BenefitReceipt{}, &model.ShopProduct{}, &model.ShopGeneratedStock{}, &model.ShopOrder{}, &model.ShopRefundRecord{}, &model.ShopDripSubscription{}}
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&model.ShopOrderSubscription{}))
				require.NoError(t, db.Migrator().DropTable(models...))
				model.DB, model.LOG_DB, common.RedisEnabled, common.BatchUpdateEnabled = previousDB, previousLog, previousRedis, previousBatch
				common.SetDatabaseTypes(mainType, logType)
				require.NoError(t, sqlDB.Close())
				l, _ := logDB.DB()
				require.NoError(t, l.Close())
			})
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Log("database version:", version)
			tokens := []string{"shop-root-fixture", "shop-owner-fixture", "shop-other-fixture"}
			users := make([]model.User, 3)
			for i := range users {
				role := common.RoleCommonUser
				if i == 0 {
					role = common.RoleRootUser
				}
				users[i] = model.User{Username: fmt.Sprintf("shop-%d", i), AffCode: fmt.Sprintf("shop-aff-%d", i), Password: "fixture-not-loginable", Role: role, Status: common.UserStatusEnabled, AccessToken: &tokens[i], AuthVersion: 1, Quota: 100000000}
				require.NoError(t, db.Create(&users[i]).Error)
			}

			t.Run("independent order subscriptions and legacy upgrade", func(t *testing.T) {
				legacyOrder := model.ShopOrder{UserID: users[1].Id, CheckoutID: "legacy-link-fixture", Status: "delivered", ProvisionState: "ready"}
				require.NoError(t, db.Create(&legacyOrder).Error)
				legacyRow := model.ShopDripSubscription{UserID: users[1].Id, Encrypted: "Zml4dHVyZTEyMzQ1ZOZ7us8yuZGJ9/dpc7ohUzKSSuKv/l8eX1dbiEE9VoVSxBIIdLTw", UpdatedAt: 100}
				require.NoError(t, db.Create(&legacyRow).Error)
				for range 2 {
					require.NoError(t, db.AutoMigrate(append(models, &model.ShopOrderSubscription{})...))
				}
				oldLink, _, err := model.ShopSubscriptionLinksForOrder(users[1].Id, legacyOrder.ID)
				require.NoError(t, err)
				assert.Contains(t, oldLink, "legacySubscription901")
				orders := []model.ShopOrder{
					{UserID: users[1].Id, CheckoutID: "new-link-one-fixture", Status: "delivered", ProvisionState: "pending"},
					{UserID: users[1].Id, CheckoutID: "new-link-two-fixture", Status: "delivered", ProvisionState: "pending"},
				}
				for i := range orders {
					require.NoError(t, db.Create(&orders[i]).Error)
					sid := fmt.Sprintf("independentSubscription%d", i)
					require.NoError(t, model.MarkShopOrderProvisioned(orders[i].ID, sid))
					require.NoError(t, model.MarkShopOrderProvisioned(orders[i].ID, sid))
					assert.ErrorIs(t, model.MarkShopOrderProvisioned(orders[i].ID, "changedSubscription"), model.ErrShopConflict)
					link, _, err := model.ShopSubscriptionLinksForOrder(users[1].Id, orders[i].ID)
					require.NoError(t, err)
					assert.True(t, strings.HasSuffix(link, sid))
					_, _, err = model.ShopSubscriptionLinksForOrder(users[2].Id, orders[i].ID)
					assert.Error(t, err)
				}
				var stored model.ShopOrderSubscription
				require.NoError(t, db.First(&stored, "order_id = ?", orders[0].ID).Error)
				assert.NotContains(t, stored.Encrypted, "independentSubscription")
				assert.Error(t, db.Create(&stored).Error, "order uniqueness survives repeated migrations")
				firstLink, _, err := model.ShopSubscriptionLinksForOrder(users[1].Id, orders[0].ID)
				require.NoError(t, err)
				assert.True(t, strings.HasSuffix(firstLink, "independentSubscription0"))
				require.NoError(t, db.Model(&orders[0]).Update("status", "refunded").Error)
				_, _, err = model.ShopSubscriptionLinksForOrder(users[1].Id, orders[0].ID)
				assert.Error(t, err)
				secondLink, _, err := model.ShopSubscriptionLinksForOrder(users[1].Id, orders[1].ID)
				require.NoError(t, err)
				assert.True(t, strings.HasSuffix(secondLink, "independentSubscription1"))
				oldLinkAfter, _, err := model.ShopSubscriptionLinksForOrder(users[1].Id, legacyOrder.ID)
				require.NoError(t, err)
				assert.Equal(t, oldLink, oldLinkAfter)
				require.NoError(t, db.Delete(&model.ShopOrderSubscription{}, "user_id = ?", users[1].Id).Error)
				require.NoError(t, db.Delete(&model.ShopDripSubscription{}, "user_id = ?", users[1].Id).Error)
				require.NoError(t, db.Delete(&model.ShopOrder{}, "id IN ?", []int{legacyOrder.ID, orders[0].ID, orders[1].ID}).Error)
			})
			router := gin.New()
			router.Use(middleware.RequestId(), middleware.DisableCache())
			router.GET("/images/:name", GetShopImage)
			router.GET("/public/products", ListPublicShopProducts)
			self := router.Group("", middleware.UserAuth())
			self.GET("/products", ListShopProducts)
			self.GET("/orders", ListShopOrders)
			self.POST("/purchase", PurchaseShopProduct)
			self.GET("/warehouse", ListBenefitWarehouse)
			self.GET("/warehouse/:id", GetBenefitWarehouseDetail)
			root := self.Group("/admin", middleware.RootAuth())
			root.POST("/images", AdminUploadShopImage)
			root.POST("/products", AdminSaveShopProduct)
			root.PUT("/products/:id/drip-quantity", AdminSetDripSaleQuantity)
			root.POST("/orders/:id/:action", AdminSettleShopOrder)
			root.GET("/orders/:id/refund-quote", DripShopRefundQuote)
			root.GET("/inventory", AdminListBenefitInventory)
			root.GET("/inventory/:id", AdminGetBenefitInventory)
			root.PUT("/inventory/:id", AdminEditBenefitInventory)
			root.POST("/inventory/actions", AdminManageBenefitInventory)
			for _, path := range []string{"/products", "/orders", "/warehouse"} {
				assert.Equal(t, 401, popupNoticeTestRequest(t, router, "GET", path, "", nil).Code)
			}
			assert.Equal(t, 403, popupNoticeTestRequest(t, router, "POST", "/admin/products", tokens[1], map[string]any{}).Code)
			assert.Equal(t, 401, popupNoticeTestRequest(t, router, "POST", "/admin/images", "", nil).Code)
			assert.Equal(t, 403, popupNoticeTestRequest(t, router, "POST", "/admin/images", tokens[1], nil).Code)
			var pngData bytes.Buffer
			require.NoError(t, png.Encode(&pngData, image.NewRGBA(image.Rect(0, 0, 16, 12))))
			var uploadedURL string
			for _, example := range []struct {
				name   string
				data   []byte
				status int
			}{
				{"real.png", pngData.Bytes(), 200},
				{"fake.png", []byte("<svg onload='alert(1)'></svg>"), 400},
				{"oversize.jpg", bytes.Repeat([]byte("x"), 5*1024*1024+1), 400},
			} {
				var body bytes.Buffer
				writer := multipart.NewWriter(&body)
				part, e := writer.CreateFormFile("image", example.name)
				require.NoError(t, e)
				_, e = part.Write(example.data)
				require.NoError(t, e)
				require.NoError(t, writer.Close())
				request := httptest.NewRequest("POST", "/admin/images", &body)
				request.Header.Set("Content-Type", writer.FormDataContentType())
				request.Header.Set("Authorization", "Bearer "+tokens[0])
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				require.Equal(t, example.status, response.Code, response.Body.String())
				if example.status == 200 {
					var result struct {
						Data struct {
							URL string `json:"url"`
						} `json:"data"`
					}
					require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
					uploadedURL = result.Data.URL
					assert.True(t, model.IsShopImageURL(uploadedURL))
					imageResponse := popupNoticeTestRequest(t, router, "GET", "/images/"+strings.TrimPrefix(uploadedURL, "/api/shop/images/"), "", nil)
					require.Equal(t, 200, imageResponse.Code)
					assert.Equal(t, "nosniff", imageResponse.Header().Get("X-Content-Type-Options"))
					assert.Equal(t, "image/jpeg", imageResponse.Header().Get("Content-Type"))
					decoded, format, e := image.Decode(bytes.NewReader(imageResponse.Body.Bytes()))
					require.NoError(t, e)
					assert.Equal(t, "jpeg", format)
					assert.Equal(t, 16, decoded.Bounds().Dx())
				}
			}
			assert.Equal(t, 404, popupNoticeTestRequest(t, router, "GET", "/images/not-an-image.jpg", "", nil).Code)
			config := model.ShopConfig{Benefit: model.BenefitConfig{Name: "Digital account", Summary: "Private delivery", Category: "account", Tone: "sky", Format: "markdown", Instructions: "private instructions", StockMode: "individual", ValidityDays: 30, Enabled: true, Fields: []model.BenefitField{{ID: "account", Label: "Account", Kind: "text"}, {ID: "password", Label: "Password", Kind: "secret"}}}, PriceCents: 100, Delivery: "instant", OnSale: true, CategoryLabel: "Accounts", DefaultPackageName: "Standard", Content: "Public product terms", ContentFormat: "markdown", CardSize: "large", SortOrder: 4, Packages: []model.ShopPackage{{ID: "extended", Name: "Extended", PriceCents: 200, ValidityDays: 90, Delivery: "manual"}}}
			config.ImagesEnabled, config.Images = true, []string{uploadedURL}
			product, err := model.SaveShopProduct(0, config)
			require.NoError(t, err)
			id, _ := strconv.Atoi(product.ID)
			gallery, err := model.ShopProductView(savedShopProduct(t, db, id), false)
			require.NoError(t, err)
			assert.True(t, gallery.ImagesEnabled)
			assert.Equal(t, []string{uploadedURL}, gallery.Images)
			assert.Equal(t, "landscape", gallery.ImageLayout)
			for _, layout := range []string{"portrait", "landscape"} {
				product.ImageLayout = layout
				_, err = model.SaveShopProduct(id, product)
				require.NoError(t, err)
				gallery, err = model.ShopProductView(savedShopProduct(t, db, id), false)
				require.NoError(t, err)
				assert.Equal(t, layout, gallery.ImageLayout)
				assert.Equal(t, []string{uploadedURL}, gallery.Images)
				response := popupNoticeTestRequest(t, router, "GET", "/public/products", "", nil)
				require.Equal(t, 200, response.Code)
				assert.Contains(t, response.Body.String(), `"imageLayout":"`+layout+`"`)
			}
			invalidLayout := config
			invalidLayout.ImageLayout = "stretch"
			_, err = model.SaveShopProduct(0, invalidLayout)
			assert.ErrorIs(t, err, model.ErrShopInvalid)
			invalidGallery := config
			invalidGallery.Images = []string{"data:image/svg+xml,<svg/>"}
			_, err = model.SaveShopProduct(0, invalidGallery)
			assert.Error(t, err)
			resourceID, _ := strconv.Atoi(product.ResourceIDs["default"])
			extendedID, _ := strconv.Atoi(product.ResourceIDs["extended"])
			fields := func(value string) []model.BenefitField {
				return []model.BenefitField{{ID: "account", Label: "Account", Kind: "text", Value: value + "@example.invalid"}, {ID: "password", Label: "Password", Kind: "secret", Value: "private-password-" + value}}
			}
			require.NoError(t, model.ImportBenefitInventory(resourceID, [][]model.BenefitField{fields("one"), fields("two")}))
			require.NoError(t, model.ImportBenefitInventory(extendedID, [][]model.BenefitField{fields("extended")}))
			public := popupNoticeTestRequest(t, router, "GET", "/products?admin=1", tokens[1], nil)
			require.Equal(t, 200, public.Code)
			assert.NotContains(t, public.Body.String(), "private instructions")
			assert.NotContains(t, public.Body.String(), "private-password")
			assert.NotContains(t, public.Body.String(), "resourceIds")
			assert.Contains(t, public.Header().Get("Cache-Control"), "no-store")
			t.Run("anonymous catalog excludes private data and ignores admin escalation", func(t *testing.T) {
				guest := popupNoticeTestRequest(t, router, "GET", "/public/products?admin=1", "", nil)
				require.Equal(t, 200, guest.Code)
				var result struct {
					Data struct {
						Items []model.ShopConfig `json:"items"`
						Total int64              `json:"total"`
					} `json:"data"`
				}
				require.NoError(t, common.Unmarshal(guest.Body.Bytes(), &result))
				require.Len(t, result.Data.Items, 1)
				assert.Equal(t, product.ID, result.Data.Items[0].ID)
				assert.Equal(t, product.PriceCents, result.Data.Items[0].PriceCents)
				assert.Equal(t, int64(1), result.Data.Items[0].StockByPackage["default"])
				assert.Empty(t, result.Data.Items[0].Benefit.Fields)
				assert.Empty(t, result.Data.Items[0].Benefit.Instructions)
				assert.NotContains(t, guest.Body.String(), "balanceCents")
				assert.NotContains(t, guest.Body.String(), "resourceIds")
				assert.NotContains(t, guest.Body.String(), "private-password")
				require.NoError(t, db.Model(&model.ShopProduct{}).Where("id = ?", id).Update("on_sale", false).Error)
				hidden := popupNoticeTestRequest(t, router, "GET", "/public/products?admin=1", "", nil)
				require.Equal(t, 200, hidden.Code)
				require.NoError(t, common.Unmarshal(hidden.Body.Bytes(), &result))
				assert.Empty(t, result.Data.Items)
				assert.Zero(t, result.Data.Total)
				require.NoError(t, db.Model(&model.ShopProduct{}).Where("id = ?", id).Update("on_sale", true).Error)
			})
			// Client cannot set the charged price, owner or shipment contents.
			bad := popupNoticeTestRequest(t, router, "POST", "/purchase", tokens[1], map[string]any{"product_id": id, "package_id": "default", "checkout_id": "wrong-price-fixture", "price_cents": 1})
			assert.Equal(t, 409, bad.Code)
			order, err := model.PurchaseShop(users[1].Id, id, "default", "checkout-primary-fixture", 100)
			require.NoError(t, err)
			require.Equal(t, "delivered", order.Status)
			again, err := model.PurchaseShop(users[1].Id, id, "default", "checkout-primary-fixture", 100)
			require.NoError(t, err)
			assert.Equal(t, order.ID, again.ID)
			var owner model.User
			require.NoError(t, db.First(&owner, users[1].Id).Error)
			assert.Equal(t, 99500000, owner.Quota)
			ownOrders := popupNoticeTestRequest(t, router, "GET", "/orders", tokens[1], nil)
			assert.Contains(t, ownOrders.Body.String(), "Digital account")
			assert.NotContains(t, ownOrders.Body.String(), "private-password")
			assert.NotContains(t, popupNoticeTestRequest(t, router, "GET", "/orders?admin=1", tokens[2], nil).Body.String(), "Digital account")
			path := fmt.Sprintf("/warehouse/%d", order.ReceiptID)
			assert.Equal(t, 404, popupNoticeTestRequest(t, router, "GET", path, tokens[2], nil).Code)
			assert.Contains(t, popupNoticeTestRequest(t, router, "GET", path, tokens[1], nil).Body.String(), "private-password-one")
			assert.Contains(t, popupNoticeTestRequest(t, router, "GET", "/warehouse", tokens[1], nil).Body.String(), "shop:")
			// Redeeming a card claims the second item from that same pool without charging.
			codes, err := model.GenerateBenefitCodes(model.BenefitCodeRequest{BenefitID: resourceID, Mode: "campaign", Count: 1})
			require.NoError(t, err)
			code, err := model.BenefitCodeValue(codes[0])
			require.NoError(t, err)
			receipt, err := model.RedeemBenefit(users[1].Id, code)
			require.NoError(t, err)
			assert.NotEqual(t, order.InventoryID, receipt.InventoryID)
			_, err = model.PurchaseShop(users[1].Id, id, "default", "checkout-empty-fixture", 100)
			assert.ErrorIs(t, err, model.ErrBenefitStock)
			require.NoError(t, db.First(&owner, users[1].Id).Error)
			assert.Equal(t, 99500000, owner.Quota)
			// Manual orders reserve stock, do not disclose it, refund exactly once.
			manual, err := model.PurchaseShop(users[1].Id, id, "extended", "checkout-manual-fixture", 200)
			require.NoError(t, err)
			assert.Equal(t, "pending", manual.Status)
			assert.Zero(t, manual.ReceiptID)
			_, err = model.SaveShopProduct(id, product)
			assert.Error(t, err)
			require.Equal(t, 400, popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/admin/orders/%d/invalid", manual.ID), tokens[0], map[string]any{}).Code)
			refunded, err := model.SettleShopOrder(manual.ID, true)
			require.NoError(t, err)
			assert.Equal(t, "refunded", refunded.Status)
			_, err = model.SettleShopOrder(manual.ID, true)
			require.NoError(t, err)
			require.NoError(t, db.First(&owner, users[1].Id).Error)
			assert.Equal(t, 99500000, owner.Quota)
			manual, err = model.PurchaseShop(users[1].Id, id, "extended", "checkout-delivery-fixture", 200)
			require.NoError(t, err)
			delivered, err := model.SettleShopOrder(manual.ID, false)
			require.NoError(t, err)
			assert.NotZero(t, delivered.ReceiptID)
			deliveredAgain, err := model.SettleShopOrder(manual.ID, false)
			require.NoError(t, err)
			assert.Equal(t, delivered.ReceiptID, deliveredAgain.ReceiptID)
			_, err = model.SettleShopOrder(manual.ID, true)
			assert.ErrorIs(t, err, model.ErrShopConflict)
			t.Run("updated instructions reach existing purchasers and code recipients", func(t *testing.T) {
				before := []model.BenefitReceipt{}
				require.NoError(t, db.Where("benefit_id IN ?", []int{resourceID, extendedID}).Order("id").Find(&before).Error)
				require.Len(t, before, 3)
				previousViews := make(map[int]model.BenefitWarehouseItem)
				for _, receipt := range before {
					view, e := model.GetBenefitWarehouseDetail(receipt.ID, receipt.UserID)
					require.NoError(t, e)
					previousViews[receipt.ID] = view
				}
				updated := product
				updated.Benefit.Instructions = `<p>Updated login guide</p><img src="` + uploadedURL + `" alt="Login guide">`
				updated.Benefit.Format = "html"
				updated.Benefit.ValidityDays = 365
				updated.PriceCents = 500
				_, e := model.SaveShopProduct(id, updated)
				require.NoError(t, e)
				for _, receipt := range before {
					view, e := model.GetBenefitWarehouseDetail(receipt.ID, receipt.UserID)
					require.NoError(t, e)
					assert.Equal(t, updated.Benefit.Instructions, view.Benefit.Instructions)
					assert.Equal(t, "html", view.Benefit.Format)
					assert.Equal(t, previousViews[receipt.ID].Fields, view.Fields)
					assert.Equal(t, previousViews[receipt.ID].Expires, view.Expires)
					assert.Equal(t, previousViews[receipt.ID].Received, view.Received)
					var after model.BenefitReceipt
					require.NoError(t, db.First(&after, receipt.ID).Error)
					assert.Equal(t, receipt, after, "delivery snapshot and entitlement remain unchanged")
				}
				var after model.ShopOrder
				require.NoError(t, db.First(&after, order.ID).Error)
				assert.Equal(t, order.Encrypted, after.Encrypted)
				assert.Equal(t, order.PriceCents, after.PriceCents)
				assert.NotContains(t, popupNoticeTestRequest(t, router, "GET", "/products", tokens[1], nil).Body.String(), "Updated login guide")
				assert.Equal(t, 404, popupNoticeTestRequest(t, router, "GET", path, tokens[2], nil).Code)
				_, e = model.SaveShopProduct(id, product)
				require.NoError(t, e)
			})
			t.Run("delivered Drip refund", func(t *testing.T) {
				drip := config
				drip.Benefit.Name = "Drip voucher"
				drip.Benefit.Category = "license"
				drip.Benefit.Fields = []model.BenefitField{{ID: "code", Label: "Code", Kind: "secret"}}
				drip.Packages = nil
				drip.Images, drip.ImagesEnabled = nil, false
				product, e := model.SaveShopProduct(0, drip)
				require.NoError(t, e)
				productID, _ := strconv.Atoi(product.ID)
				benefitID, _ := strconv.Atoi(product.ResourceIDs["default"])
				voucher := "DRIP-shop-refund-fixture"
				require.NoError(t, model.ImportBenefitInventory(benefitID, [][]model.BenefitField{{{ID: "code", Label: "Code", Kind: "secret", Value: voucher}}}))
				order, e := model.PurchaseShop(users[1].Id, productID, "default", "checkout-drip-refund-fixture", 100)
				require.NoError(t, e)
				require.Equal(t, "delivered", order.Status)
				var before model.User
				require.NoError(t, db.First(&before, users[1].Id).Error)
				unauthorized := popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/admin/orders/%d/refund", order.ID), tokens[1], map[string]any{"reason": "customer request"})
				assert.Equal(t, 403, unauthorized.Code)
				missingGateway := popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/admin/orders/%d/refund", order.ID), tokens[0], map[string]any{"reason": "customer request"})
				assert.Equal(t, 502, missingGateway.Code)
				var unchanged model.User
				require.NoError(t, db.First(&unchanged, users[1].Id).Error)
				assert.Equal(t, before.Quota, unchanged.Quota)
				hash := sha256.Sum256([]byte(voucher))
				wantHash := hex.EncodeToString(hash[:])
				calls := 0
				deny := false
				partial := false
				upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
					if request.URL.Path == "/api/internal/shop/provision" {
						assert.Equal(t, strings.Repeat("p", 48), request.Header.Get("X-Drip-Shop-Provision-Secret"))
						var purchase struct {
							OrderID int    `json:"orderId"`
							Subject string `json:"subject"`
							Code    string `json:"code"`
						}
						assert.NoError(t, json.NewDecoder(request.Body).Decode(&purchase))
						assert.Equal(t, strconv.Itoa(users[1].Id), purchase.Subject)
						assert.True(t, strings.HasPrefix(purchase.Code, "DRIP-"))
						_, _ = w.Write([]byte(`{"ok":true,"subscriptionId":"stableSubscription901"}`))
						return
					}
					calls++
					assert.Contains(t, []string{"/api/internal/shop/refund", "/api/internal/shop/refund-quote"}, request.URL.Path)
					assert.Equal(t, strings.Repeat("x", 40), request.Header.Get("X-Drip-Shop-Refund-Secret"))
					var payload struct {
						OrderID  int    `json:"orderId"`
						CodeHash string `json:"codeHash"`
					}
					assert.NoError(t, json.NewDecoder(request.Body).Decode(&payload))
					assert.Greater(t, payload.OrderID, 0)
					if !deny {
						assert.Equal(t, wantHash, payload.CodeHash)
					}
					w.Header().Set("Content-Type", "application/json")
					if deny {
						w.WriteHeader(http.StatusConflict)
						_, _ = w.Write([]byte(`{"ok":false,"error":"already redeemed"}`))
						return
					}
					if partial {
						_, _ = w.Write([]byte(`{"ok":true,"flowRemaining":1,"flowTotal":2,"timeRemaining":1,"timeTotal":2}`))
					} else {
						_, _ = w.Write([]byte(`{"ok":true,"flowRemaining":1,"flowTotal":1,"timeRemaining":1,"timeTotal":1}`))
					}
				}))
				defer upstream.Close()
				previousClient := shopRefundHTTPClient
				shopRefundHTTPClient = upstream.Client()
				defer func() { shopRefundHTTPClient = previousClient }()
				t.Setenv("DRIP_ACCOUNT_ORIGIN", upstream.URL)
				t.Setenv("DRIP_SHOP_REFUND_SECRET", strings.Repeat("x", 40))
				path := fmt.Sprintf("/admin/orders/%d/refund", order.ID)
				result := popupNoticeTestRequest(t, router, "POST", path, tokens[0], map[string]any{"reason": "Customer requested unused voucher refund"})
				require.Equal(t, 200, result.Code, result.Body.String())
				result = popupNoticeTestRequest(t, router, "POST", path, tokens[0], map[string]any{"reason": "repeat request"})
				require.Equal(t, 200, result.Code, result.Body.String())
				assert.Equal(t, 1, calls)
				var after model.User
				require.NoError(t, db.First(&after, users[1].Id).Error)
				assert.Equal(t, before.Quota+order.Quota, after.Quota)
				var receiptCount int64
				require.NoError(t, db.Model(&model.BenefitReceipt{}).Where("id = ?", order.ReceiptID).Count(&receiptCount).Error)
				assert.Zero(t, receiptCount)
				var stock model.BenefitInventory
				require.NoError(t, db.First(&stock, order.InventoryID).Error)
				assert.True(t, stock.Disabled && stock.Removed && !stock.Claimed)
				var record model.ShopRefundRecord
				require.NoError(t, db.First(&record, "order_id = ?", order.ID).Error)
				assert.NotContains(t, record.EncryptedReason, "Customer requested")
				adminOrders := popupNoticeTestRequest(t, router, "GET", "/orders?admin=1&status=refunded&q="+strconv.Itoa(order.ID), tokens[0], nil)
				assert.Contains(t, adminOrders.Body.String(), "Customer requested unused voucher refund")
				assert.Contains(t, adminOrders.Body.String(), users[1].Username)
				assert.NotContains(t, adminOrders.Body.String(), voucher)
				secondVoucher := "DRIP-already-used-fixture"
				require.NoError(t, model.ImportBenefitInventory(benefitID, [][]model.BenefitField{{{ID: "code", Label: "Code", Kind: "secret", Value: secondVoucher}}}))
				usedOrder, e := model.PurchaseShop(users[1].Id, productID, "default", "checkout-drip-used-fixture", 100)
				require.NoError(t, e)
				var beforeRejected model.User
				require.NoError(t, db.First(&beforeRejected, users[1].Id).Error)
				deny = true
				rejected := popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/admin/orders/%d/refund", usedOrder.ID), tokens[0], map[string]any{"reason": "requested but redeemed"})
				assert.Equal(t, 409, rejected.Code)
				var afterRejected model.User
				require.NoError(t, db.First(&afterRejected, users[1].Id).Error)
				assert.Equal(t, beforeRejected.Quota, afterRejected.Quota)
				require.NoError(t, db.First(&usedOrder, usedOrder.ID).Error)
				assert.Equal(t, "delivered", usedOrder.Status)
				deny, partial = false, true
				secondHash := sha256.Sum256([]byte(secondVoucher))
				wantHash = hex.EncodeToString(secondHash[:])
				quoted := popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/admin/orders/%d/refund-quote", usedOrder.ID), tokens[0], nil)
				require.Equal(t, 200, quoted.Code, quoted.Body.String())
				assert.Contains(t, quoted.Body.String(), `"refundCents":25`)
				partialRefund := popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/admin/orders/%d/refund", usedOrder.ID), tokens[0], map[string]any{"reason": "remaining traffic and time"})
				require.Equal(t, 200, partialRefund.Code, partialRefund.Body.String())
				var partiallyCredited model.User
				require.NoError(t, db.First(&partiallyCredited, users[1].Id).Error)
				assert.Equal(t, beforeRejected.Quota+usedOrder.Quota/4, partiallyCredited.Quota)
				record = model.ShopRefundRecord{}
				require.NoError(t, db.First(&record, "order_id = ?", usedOrder.ID).Error)
				assert.Equal(t, int64(25), record.RefundCents)
				thirdVoucher := "DRIP-auto-provision-fixture"
				require.NoError(t, model.ImportBenefitInventory(benefitID, [][]model.BenefitField{{{ID: "code", Label: "Code", Kind: "secret", Value: thirdVoucher}}}))
				t.Setenv("DRIP_SHOP_PROVISION_SECRET", strings.Repeat("p", 48))
				purchased := popupNoticeTestRequest(t, router, "POST", "/purchase", tokens[1], map[string]any{
					"product_id": productID, "package_id": "default", "checkout_id": "checkout-drip-auto-fixture", "price_cents": 100,
				})
				require.Equal(t, 200, purchased.Code, purchased.Body.String())
				assert.Contains(t, purchased.Body.String(), `"provision_state":"ready"`)
				var autoOrder model.ShopOrder
				require.NoError(t, db.Where("checkout_id = ?", "checkout-drip-auto-fixture").First(&autoOrder).Error)
				warehouse := popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/warehouse/%d", autoOrder.ReceiptID), tokens[1], nil)
				require.Equal(t, 200, warehouse.Code, warehouse.Body.String())
				assert.Contains(t, warehouse.Body.String(), "https://skymoni.com/api/drip/sub/clash/stableSubscription901")
				assert.Equal(t, 404, popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/warehouse/%d", autoOrder.ReceiptID), tokens[2], nil).Code)
			})
			t.Run("generated Drip quantity and refund", func(t *testing.T) {
				var existingProducts int64
				require.NoError(t, db.Model(&model.ShopProduct{}).Count(&existingProducts).Error)
				if existingProducts == 1 {
					_, err := model.SaveShopProduct(0, config)
					require.NoError(t, err)
				}
				drip := config
				drip.Benefit.Name = "Generated Drip"
				drip.Benefit.Category = "license"
				drip.Benefit.Fields = []model.BenefitField{{ID: "code", Label: "Code", Kind: "secret"}}
				drip.Images, drip.ImagesEnabled = nil, false
				drip.DefaultPackageName = "100 GiB"
				drip.Benefit.ValidityDays = 100
				drip.Packages = []model.ShopPackage{
					{ID: "200", Name: "200 GiB", PriceCents: 200, ValidityDays: 100, Delivery: "instant"},
					{ID: "500", Name: "500 GiB", PriceCents: 500, ValidityDays: 100, Delivery: "instant"},
				}
				product, e := model.SaveShopProduct(0, drip)
				require.NoError(t, e)
				require.Equal(t, "3", product.ID)
				legacyResourceID, e := strconv.Atoi(product.ResourceIDs["default"])
				require.NoError(t, e)
				require.NoError(t, model.ImportBenefitInventory(legacyResourceID, [][]model.BenefitField{{
					{ID: "code", Label: "Code", Kind: "secret", Value: "DRIP-legacy-order-fixture"},
				}}))
				legacyOrder, e := model.PurchaseShop(users[2].Id, 3, "default", "legacy-drip-checkout-1", 100)
				require.NoError(t, e)
				assert.False(t, legacyOrder.DripGenerated)
				path := "/admin/products/3/drip-quantity"
				body := map[string]any{"remaining": map[string]int64{"default": 1, "200": 0, "500": 0}}
				assert.Equal(t, 403, popupNoticeTestRequest(t, router, "PUT", path, tokens[1], body).Code)
				activated := popupNoticeTestRequest(t, router, "PUT", path, tokens[0], body)
				require.Equal(t, 200, activated.Code, activated.Body.String())
				view, e := model.ShopProductView(savedShopProduct(t, db, 3), true)
				require.NoError(t, e)
				assert.True(t, view.GeneratedSales)
				assert.Equal(t, int64(1), view.StockByPackage["default"])
				order, e := model.PurchaseShop(users[1].Id, 3, "default", "generated-drip-checkout-1", 100)
				require.NoError(t, e)
				assert.True(t, order.DripGenerated)
				assert.Equal(t, 100, order.DripQuotaGiB)
				assert.Zero(t, order.InventoryID)
				_, code, _, e := model.ShopOrderForProvision(order.ID)
				require.NoError(t, e)
				assert.True(t, strings.HasPrefix(code, "DRIP-"))
				duplicate, e := model.PurchaseShop(users[1].Id, 3, "default", "generated-drip-checkout-1", 100)
				require.NoError(t, e)
				assert.Equal(t, order.ID, duplicate.ID)
				_, e = model.PurchaseShop(users[2].Id, 3, "default", "generated-drip-checkout-2", 100)
				assert.ErrorIs(t, e, model.ErrBenefitStock)
				_, hash, e := model.PrepareShopRefund(order.ID)
				require.NoError(t, e)
				require.NotEmpty(t, hash)
				_, changed, e := model.RefundShopOrderWithAmount(order.ID, users[0].Id, "customer requested", hash, order.Quota/4, order.PriceCents/4)
				require.NoError(t, e)
				assert.True(t, changed)
				_, changed, e = model.RefundShopOrderWithAmount(order.ID, users[0].Id, "repeat request", hash, order.Quota/4, order.PriceCents/4)
				require.NoError(t, e)
				assert.False(t, changed)
				view, e = model.ShopProductView(savedShopProduct(t, db, 3), true)
				require.NoError(t, e)
				assert.Equal(t, int64(1), view.StockByPackage["default"])
				_, legacyHash, e := model.PrepareShopRefund(legacyOrder.ID)
				require.NoError(t, e)
				_, changed, e = model.RefundShopOrderWithAmount(legacyOrder.ID, users[0].Id, "legacy refund", legacyHash, legacyOrder.Quota, legacyOrder.PriceCents)
				require.NoError(t, e)
				assert.True(t, changed)
				view, e = model.ShopProductView(savedShopProduct(t, db, 3), true)
				require.NoError(t, e)
				assert.Equal(t, int64(2), view.StockByPackage["default"])
			})
			// Last-item concurrent purchases cannot allocate one account twice.
			require.NoError(t, model.ImportBenefitInventory(resourceID, [][]model.BenefitField{fields("last")}))
			if dialect != "sqlite" {
				sqlDB.SetMaxOpenConns(8)
			}
			var wg sync.WaitGroup
			results := make(chan error, 2)
			for i := range 2 {
				wg.Go(func() {
					_, err := model.PurchaseShop(users[i+1].Id, id, "default", fmt.Sprintf("concurrent-checkout-%d", i), 100)
					results <- err
				})
			}
			wg.Wait()
			close(results)
			success := 0
			for err := range results {
				if err == nil {
					success++
				} else {
					assert.ErrorIs(t, err, model.ErrBenefitStock)
				}
			}
			assert.Equal(t, 1, success)
			// Insufficient balance rolls back the selected inventory assignment.
			require.NoError(t, model.ImportBenefitInventory(resourceID, [][]model.BenefitField{fields("insufficient")}))
			require.NoError(t, db.Model(&model.User{}).Where("id = ?", users[2].Id).Update("quota", 1).Error)
			_, err = model.PurchaseShop(users[2].Id, id, "default", "insufficient-checkout", 100)
			assert.ErrorIs(t, err, model.ErrShopBalance)
			var available int64
			require.NoError(t, db.Model(&model.BenefitInventory{}).Where("benefit_id = ? AND claimed = ?", resourceID, false).Count(&available).Error)
			assert.EqualValues(t, 1, available)
			t.Run("inventory administration", func(t *testing.T) {
				var stock model.BenefitInventory
				require.NoError(t, db.Where("benefit_id = ? AND claimed = ?", resourceID, false).First(&stock).Error)
				// Upgrade an existing .58 inventory row, then repeat migration. Preserve encrypted contents and ownership.
				ciphertext := stock.Encrypted
				for _, column := range []string{"disabled", "removed", "revision", "updated_at"} {
					require.NoError(t, db.Migrator().DropColumn(&model.BenefitInventory{}, column))
				}
				for range 2 {
					require.NoError(t, db.AutoMigrate(&model.BenefitInventory{}, &model.BenefitInventoryEvent{}))
				}
				require.NoError(t, db.First(&stock, stock.ID).Error)
				assert.Equal(t, ciphertext, stock.Encrypted)
				assert.EqualValues(t, 1, stock.Revision)
				assert.False(t, stock.Disabled)
				assert.False(t, stock.Removed)
				path := fmt.Sprintf("/admin/inventory/%d", stock.ID)
				for _, request := range []struct {
					method, path string
					body         any
				}{{"GET", path, nil}, {"PUT", path, map[string]any{}}, {"POST", "/admin/inventory/actions", map[string]any{}}} {
					assert.Equal(t, 401, popupNoticeTestRequest(t, router, request.method, request.path, "", request.body).Code)
					assert.Equal(t, 403, popupNoticeTestRequest(t, router, request.method, request.path, tokens[1], request.body).Code)
				}
				assert.Equal(t, 404, popupNoticeTestRequest(t, router, "GET", "/admin/inventory/999999", tokens[0], nil).Code)
				assert.Equal(t, 400, popupNoticeTestRequest(t, router, "GET", "/admin/inventory?status=invalid", tokens[0], nil).Code)
				list := popupNoticeTestRequest(t, router, "GET", "/admin/inventory?keyword=insufficient", tokens[0], nil)
				require.Equal(t, 200, list.Code)
				assert.Contains(t, list.Body.String(), "insufficient@example.invalid")
				assert.NotContains(t, list.Body.String(), "private-password")
				detail := popupNoticeTestRequest(t, router, "GET", path, tokens[0], nil)
				assert.Contains(t, detail.Body.String(), "private-password")
				assert.Contains(t, detail.Header().Get("Cache-Control"), "no-store")
				assert.ErrorIs(t, model.ImportBenefitInventory(resourceID, [][]model.BenefitField{fields("new-but-rollback"), fields("insufficient")}), model.ErrInventoryDuplicate)
				page, err := model.ListBenefitInventory(resourceID, "all", "new-but-rollback", 0, 50)
				require.NoError(t, err)
				assert.Zero(t, page.Total)
				edit := model.InventoryEditRequest{Revision: stock.Revision, Fields: fields("editable")}
				assert.Equal(t, 200, popupNoticeTestRequest(t, router, "PUT", path, tokens[0], edit).Code)
				assert.Equal(t, 409, popupNoticeTestRequest(t, router, "PUT", path, tokens[0], edit).Code)
				require.NoError(t, db.First(&stock, stock.ID).Error)
				mutate := func(action string) {
					require.NoError(t, model.ManageBenefitInventory(users[0].Id, model.InventoryActionRequest{Items: []model.InventoryTarget{{ID: stock.ID, Revision: stock.Revision}}, Action: action}))
					require.NoError(t, db.First(&stock, stock.ID).Error)
				}
				mutate("disable")
				view, err := model.ShopProductView(savedShopProduct(t, db, id), false)
				require.NoError(t, err)
				assert.Zero(t, view.StockByPackage["default"])
				_, err = model.PurchaseShop(users[1].Id, id, "default", "disabled-stock-checkout", 100)
				assert.ErrorIs(t, err, model.ErrBenefitStock)
				mutate("remove")
				page, err = model.ListBenefitInventory(resourceID, "removed", "editable", 0, 50)
				require.NoError(t, err)
				assert.Equal(t, 1, page.Total)
				mutate("restore")
				assert.True(t, stock.Disabled)
				mutate("enable")
				assert.False(t, stock.Disabled)
				// A stale batch is atomic and cannot partially disable stock.
				err = model.ManageBenefitInventory(users[0].Id, model.InventoryActionRequest{Items: []model.InventoryTarget{{ID: stock.ID, Revision: stock.Revision}, {ID: 999999, Revision: 1}}, Action: "disable"})
				assert.ErrorIs(t, err, model.ErrInventoryConflict)
				require.NoError(t, db.First(&stock, stock.ID).Error)
				assert.False(t, stock.Disabled)
				order, err := model.PurchaseShop(users[1].Id, id, "default", "inventory-edit-delivered", 100)
				require.NoError(t, err)
				require.NoError(t, db.First(&stock, stock.ID).Error)
				edit = model.InventoryEditRequest{Revision: stock.Revision, Fields: fields("corrected"), Reason: "Corrected password"}
				assert.ErrorIs(t, model.EditBenefitInventory(stock.ID, users[0].Id, edit), model.ErrInventoryInvalid)
				edit.SyncDelivered = true
				require.NoError(t, model.EditBenefitInventory(stock.ID, users[0].Id, edit))
				detail = popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/warehouse/%d", order.ReceiptID), tokens[1], nil)
				assert.Contains(t, detail.Body.String(), "private-password-corrected")
				assert.NotContains(t, detail.Body.String(), "private-password-editable")
				require.NoError(t, db.First(&stock, stock.ID).Error)
				assert.ErrorIs(t, model.ManageBenefitInventory(users[0].Id, model.InventoryActionRequest{Items: []model.InventoryTarget{{ID: stock.ID, Revision: stock.Revision}}, Action: "remove"}), model.ErrInventoryConflict)
				require.NoError(t, model.ImportBenefitInventory(extendedID, [][]model.BenefitField{fields("reserved-management")}))
				pending, err := model.PurchaseShop(users[1].Id, id, "extended", "reserved-management-checkout", 200)
				require.NoError(t, err)
				stock = model.BenefitInventory{}
				require.NoError(t, db.First(&stock, pending.InventoryID).Error)
				assert.ErrorIs(t, model.EditBenefitInventory(stock.ID, users[0].Id, model.InventoryEditRequest{Revision: stock.Revision, Fields: fields("reserved-edit"), SyncDelivered: true, Reason: "should not change"}), model.ErrInventoryConflict)
				_, err = model.SettleShopOrder(pending.ID, true)
				require.NoError(t, err)
				require.NoError(t, db.First(&stock, stock.ID).Error)
				assert.False(t, stock.Claimed)
				page, err = model.ListBenefitInventory(extendedID, "available", "reserved-management", 0, 50)
				require.NoError(t, err)
				assert.Equal(t, 1, page.Total)
				require.NoError(t, model.ImportBenefitInventory(resourceID, [][]model.BenefitField{fields("race-managed")}))
				stock = model.BenefitInventory{}
				require.NoError(t, db.Where("benefit_id = ? AND claimed = ?", resourceID, false).First(&stock).Error)
				start := make(chan struct{})
				outcomes := make(chan error, 2)
				wg.Go(func() {
					<-start
					_, e := model.PurchaseShop(users[1].Id, id, "default", "inventory-race-checkout", 100)
					outcomes <- e
				})
				wg.Go(func() {
					<-start
					outcomes <- model.ManageBenefitInventory(users[0].Id, model.InventoryActionRequest{Items: []model.InventoryTarget{{ID: stock.ID, Revision: stock.Revision}}, Action: "disable"})
				})
				close(start)
				wg.Wait()
				close(outcomes)
				successes := 0
				for e := range outcomes {
					if e == nil {
						successes++
					} else {
						assert.True(t, errors.Is(e, model.ErrBenefitStock) || errors.Is(e, model.ErrInventoryConflict), "%v", e)
					}
				}
				assert.Equal(t, 1, successes)
				bulk := make([][]model.BenefitField, 51)
				for i := range bulk {
					bulk[i] = fields(fmt.Sprintf("page-account-%02d", i))
				}
				require.NoError(t, model.ImportBenefitInventory(resourceID, bulk))
				page, err = model.ListBenefitInventory(resourceID, "available", "page-account", 50, 50)
				require.NoError(t, err)
				assert.Equal(t, 51, page.Total)
				assert.Len(t, page.Items, 1)
				assert.Equal(t, 51, page.Counts["available"])
			})
			var logs []model.AuditLog
			require.NoError(t, logDB.Find(&logs).Error)
			text, err := common.Marshal(logs)
			require.NoError(t, err)
			assert.NotContains(t, string(text), "private-password")
			var saved model.ShopProduct
			require.NoError(t, db.First(&saved, id).Error)
			assert.NotContains(t, saved.Encrypted, "private instructions")
			config.PriceCents = -1
			_, err = model.SaveShopProduct(0, config)
			assert.Error(t, err)
			_ = http.StatusOK
		})
	}
}

func TestShopSubscriptionProxyServesClashWithoutExposingUpstream(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		assert.Equal(t, "/api/subscription/clash/stableSubscription901", request.URL.Path)
		w.Header().Set("Subscription-Userinfo", "upload=0; download=1024; total=2048")
		_, _ = w.Write([]byte("proxies:\n  - name: Korea\n"))
	}))
	defer upstream.Close()
	previousClient := shopRefundHTTPClient
	shopRefundHTTPClient = upstream.Client()
	defer func() { shopRefundHTTPClient = previousClient }()
	t.Setenv("DRIP_ACCOUNT_ORIGIN", upstream.URL)
	router := gin.New()
	router.GET("/api/drip/sub/:format/:id", ProxyDripShopSubscription)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/drip/sub/clash/stableSubscription901", nil))
	require.Equal(t, 200, response.Code)
	assert.Contains(t, response.Body.String(), "name: Korea")
	assert.Contains(t, response.Header().Get("Subscription-Userinfo"), "total=2048")
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	invalid := httptest.NewRecorder()
	router.ServeHTTP(invalid, httptest.NewRequest("GET", "/api/drip/sub/clash/short", nil))
	assert.Equal(t, 404, invalid.Code)
}

func TestShopSubscriptionProxyServesJSONWithoutForwardingBrowserCredentials(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		assert.Equal(t, "/api/subscription/json/stableSubscription901", request.URL.Path)
		assert.Empty(t, request.Header.Get("Cookie"))
		assert.Empty(t, request.Header.Get("Authorization"))
		w.Header().Set("Subscription-Userinfo", "upload=1; download=2; total=2048; expire=1900000000")
		w.Header().Set("Set-Cookie", "private=upstream")
		_, _ = w.Write([]byte(`[{"outbounds":[{"protocol":"vless"}]}]`))
	}))
	defer upstream.Close()
	previousClient := shopRefundHTTPClient
	shopRefundHTTPClient = upstream.Client()
	defer func() { shopRefundHTTPClient = previousClient }()
	t.Setenv("DRIP_ACCOUNT_ORIGIN", upstream.URL)
	router := gin.New()
	router.GET("/api/drip/sub/:format/:id", ProxyDripShopSubscription)
	request := httptest.NewRequest("GET", "/api/drip/sub/json/stableSubscription901", nil)
	request.Header.Set("Cookie", "session=browser")
	request.Header.Set("Authorization", "Bearer browser")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, 200, response.Code)
	assert.Equal(t, "application/json; charset=utf-8", response.Header().Get("Content-Type"))
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	assert.Empty(t, response.Header().Get("Set-Cookie"))
	assert.Contains(t, response.Header().Get("Subscription-Userinfo"), "total=2048")
	assert.JSONEq(t, `[{"outbounds":[{"protocol":"vless"}]}]`, response.Body.String())
	for _, path := range []string{"/api/drip/sub/json/short", "/api/drip/sub/singbox/stableSubscription901", "/api/drip/sub/json/invalid.Subscription"} {
		invalid := httptest.NewRecorder()
		router.ServeHTTP(invalid, httptest.NewRequest("GET", path, nil))
		assert.Equal(t, 404, invalid.Code)
	}
}

func savedShopProduct(t *testing.T, db *gorm.DB, id int) model.ShopProduct {
	t.Helper()
	var row model.ShopProduct
	require.NoError(t, db.First(&row, id).Error)
	return row
}
