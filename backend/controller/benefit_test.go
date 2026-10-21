package controller

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

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
)

func TestBenefitDatabaseMatrix(t *testing.T) {
	t.Setenv("BENEFITS_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", 32))))
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.New(postgres.Config{DSN: os.Getenv("TEST_POSTGRES_DSN"), PreferSimpleProtocol: true})
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "benefit_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			logDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
			require.NoError(t, err)
			require.NoError(t, logDB.AutoMigrate(&model.AuditLog{}))
			previousDB, previousLog, previousRedis := model.DB, model.LOG_DB, common.RedisEnabled
			mainType, logType := common.MainDatabaseType(), common.LogDatabaseType()
			model.DB, model.LOG_DB, common.RedisEnabled = db, logDB, false
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseTypeSQLite)
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&model.BenefitReceipt{}, &model.BenefitCode{}, &model.BenefitInventory{}, &model.Benefit{}, &model.PopupNoticeRevision{}, &model.PopupNoticeRead{}, &model.PopupNotice{}, &model.User{}))
				model.DB, model.LOG_DB, common.RedisEnabled = previousDB, previousLog, previousRedis
				common.SetDatabaseTypes(mainType, logType)
				require.NoError(t, sqlDB.Close())
				logSQL, _ := logDB.DB()
				require.NoError(t, logSQL.Close())
			})
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("database version: %s", version)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.User{}, &model.PopupNotice{}, &model.PopupNoticeRead{}, &model.PopupNoticeRevision{}, &model.Benefit{}, &model.BenefitInventory{}, &model.BenefitCode{}, &model.BenefitReceipt{}))
			}
			tokens := []string{"benefit-root-fixture", "benefit-owner-fixture", "benefit-other-fixture", "benefit-admin-fixture"}
			roles := []int{common.RoleRootUser, common.RoleCommonUser, common.RoleCommonUser, common.RoleAdminUser}
			users := make([]model.User, 4)
			for i := range users {
				users[i] = model.User{Username: fmt.Sprintf("benefit-user-%d", i), Password: "fixture", AffCode: fmt.Sprintf("bft-%d", i), Role: roles[i], Status: common.UserStatusEnabled, AccessToken: &tokens[i], AuthVersion: 1, Quota: 123456}
				require.NoError(t, db.Create(&users[i]).Error)
			}
			legacy := model.PopupNotice{Title: "Preserved", Content: "existing popup", Format: "text", Audience: "all_users", Status: "published", Frequency: "once"}
			require.NoError(t, model.CreatePopupNotice(&legacy, users[0].Id))
			require.NoError(t, model.ReadPopupNotice(users[1].Id, legacy.Id, legacy.Revision, time.Now().Unix()))
			require.NoError(t, db.Migrator().DropColumn(&model.PopupNotice{}, "benefit_code_id"))
			require.NoError(t, db.Migrator().DropColumn(&model.PopupNoticeRevision{}, "benefit_code_id"))
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.PopupNotice{}, &model.PopupNoticeRevision{}, &model.Benefit{}, &model.BenefitInventory{}, &model.BenefitCode{}, &model.BenefitReceipt{}))
				require.NoError(t, model.BackfillPopupNoticeRevisions())
			}
			preserved, err := model.GetPopupNotice(legacy.Id)
			require.NoError(t, err)
			assert.Equal(t, "existing popup", string(preserved.Content))
			assert.Zero(t, preserved.BenefitCodeID)
			assert.EqualValues(t, 1, preserved.ReadCount)
			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.Use(middleware.RequestId(), middleware.DisableCache())
			root := router.Group("/admin", middleware.RootAuth())
			root.GET("", AdminListBenefits)
			root.POST("", AdminSaveBenefit)
			root.GET("/:id", AdminGetBenefit)
			root.GET("/codes", AdminListBenefitCodes)
			root.POST("/codes", AdminGenerateBenefitCodes)
			self := router.Group("", middleware.UserAuth())
			self.GET("/warehouse", ListBenefitWarehouse)
			self.GET("/warehouse/:id", GetBenefitWarehouseDetail)
			self.POST("/redeem", RedeemBenefit)
			self.POST("/popup/:id/redeem", RedeemBenefit)
			for _, path := range []string{"/admin", "/warehouse", "/warehouse/1"} {
				assert.Equal(t, http.StatusUnauthorized, popupNoticeTestRequest(t, router, "GET", path, "", nil).Code)
			}
			for _, token := range tokens[1:] {
				assert.Equal(t, http.StatusForbidden, popupNoticeTestRequest(t, router, "GET", "/admin", token, nil).Code)
			}
			config := model.BenefitConfig{Name: "Account", Summary: "Private resource", Category: "account", Tone: "sky", Format: "markdown", Instructions: "Use your own account", StockMode: "individual", Enabled: true, ValidityDays: 7, Fields: []model.BenefitField{{ID: "account", Label: "Account", Kind: "text"}, {ID: "password", Label: "Password", Kind: "secret"}, {ID: "url", Label: "Website", Kind: "link"}}}
			created, err := model.SaveBenefit(0, config)
			require.NoError(t, err)
			id, err := strconv.Atoi(created.ID)
			require.NoError(t, err)
			fields := []model.BenefitField{{ID: "account", Label: "Account", Kind: "text", Value: "private-owner@example.invalid"}, {ID: "password", Label: "Password", Kind: "secret", Value: "never-leak-password"}, {ID: "url", Label: "Website", Kind: "link", Value: "https://example.invalid/account"}}
			require.NoError(t, model.ImportBenefitInventory(id, [][]model.BenefitField{fields}))
			codes, err := model.GenerateBenefitCodes(model.BenefitCodeRequest{BenefitID: id, Count: 1, Mode: "campaign", Limit: 5})
			require.NoError(t, err)
			code, err := model.BenefitCodeValue(codes[0])
			require.NoError(t, err)
			var stored model.BenefitInventory
			require.NoError(t, db.First(&stored).Error)
			assert.NotContains(t, stored.Encrypted, "never-leak-password")
			assert.NotContains(t, stored.Encrypted, "private-owner")
			response := popupNoticeTestRequest(t, router, "POST", "/redeem", tokens[1], map[string]any{"code": code, "user_id": users[2].Id})
			require.Equal(t, 200, response.Code, response.Body.String())
			assert.NotContains(t, response.Body.String(), "never-leak-password")
			var result struct{ Data model.BenefitWarehouseItem }
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
			require.NotEmpty(t, result.Data.ID)
			require.NotEqual(t, "0", result.Data.ID)
			path := "/warehouse/" + result.Data.ID
			assert.Equal(t, 404, popupNoticeTestRequest(t, router, "GET", path, tokens[2], nil).Code)
			detail := popupNoticeTestRequest(t, router, "GET", path, tokens[1], nil)
			assert.Contains(t, detail.Body.String(), "never-leak-password")
			assert.Contains(t, detail.Header().Get("Cache-Control"), "no-store")
			list := popupNoticeTestRequest(t, router, "GET", "/warehouse?user_id="+strconv.Itoa(users[1].Id)+"&admin=1", tokens[2], nil)
			assert.NotContains(t, list.Body.String(), "Private resource")
			assert.NotContains(t, list.Body.String(), "never-leak-password")
			list = popupNoticeTestRequest(t, router, "GET", "/warehouse", tokens[1], nil)
			assert.NotContains(t, list.Body.String(), "private-owner")
			assert.NotContains(t, list.Body.String(), "never-leak-password")
			assert.Equal(t, 409, popupNoticeTestRequest(t, router, "POST", "/redeem", tokens[1], map[string]any{"code": code}).Code)
			_, err = model.RedeemBenefit(users[2].Id, code)
			assert.ErrorIs(t, err, model.ErrBenefitStock)
			var updatedCode model.BenefitCode
			require.NoError(t, db.First(&updatedCode, codes[0].ID).Error)
			assert.Equal(t, 1, updatedCode.Claimed)
			changed := created
			changed.Name = "Edited"
			changed.Instructions = "<p>New instructions</p>"
			changed.Format = "html"
			_, err = model.SaveBenefit(id, changed)
			require.NoError(t, err)
			detail = popupNoticeTestRequest(t, router, "GET", path, tokens[1], nil)
			assert.Contains(t, detail.Body.String(), "New instructions")
			assert.Contains(t, detail.Body.String(), `"format":"html"`)
			assert.NotContains(t, detail.Body.String(), "Use your own account")
			assert.Contains(t, detail.Body.String(), "never-leak-password")
			assert.Contains(t, detail.Body.String(), "Private resource")
			assert.NotContains(t, detail.Body.String(), `"name":"Edited"`)
			changed.Instructions = ""
			changed.Enabled = false
			_, err = model.SaveBenefit(id, changed)
			require.NoError(t, err)
			detail = popupNoticeTestRequest(t, router, "GET", path, tokens[1], nil)
			assert.Equal(t, 200, detail.Code)
			assert.Contains(t, detail.Body.String(), `"instructions":""`)
			assert.NotContains(t, detail.Body.String(), "New instructions")
			assert.Contains(t, detail.Body.String(), "never-leak-password")
			changed.Enabled = true
			_, err = model.SaveBenefit(id, changed)
			require.NoError(t, err)
			shared := config
			shared.Name = "Shared resource"
			shared.StockMode = "shared"
			shared.Fields = fields
			shared.ValidityDays = 0
			shared, err = model.SaveBenefit(0, shared)
			require.NoError(t, err)
			sharedID, _ := strconv.Atoi(shared.ID)
			for _, failure := range []string{"disabled", "expired", "target"} {
				request := model.BenefitCodeRequest{BenefitID: sharedID, Count: 1, Mode: "single"}
				if failure == "target" {
					request.TargetUserID = users[1].Id
				}
				rows, err := model.GenerateBenefitCodes(request)
				require.NoError(t, err)
				text, err := model.BenefitCodeValue(rows[0])
				require.NoError(t, err)
				if failure == "disabled" {
					require.NoError(t, db.Model(&rows[0]).Update("enabled", false).Error)
				}
				if failure == "expired" {
					require.NoError(t, db.Model(&rows[0]).Update("expires_at", time.Now().Unix()-1).Error)
				}
				_, err = model.RedeemBenefit(users[2].Id, text)
				assert.ErrorIs(t, err, model.ErrBenefitUnavailable)
			}
			// Real concurrent requests must never consume a one-use code twice.
			if dialect != "sqlite" {
				sqlDB.SetMaxOpenConns(4)
			}
			raceCodes, err := model.GenerateBenefitCodes(model.BenefitCodeRequest{BenefitID: sharedID, Count: 1, Mode: "single"})
			require.NoError(t, err)
			raceCode, err := model.BenefitCodeValue(raceCodes[0])
			require.NoError(t, err)
			var group sync.WaitGroup
			successes := make(chan bool, 2)
			for _, user := range users[1:3] {
				group.Go(func() { _, err := model.RedeemBenefit(user.Id, raceCode); successes <- err == nil })
			}
			group.Wait()
			close(successes)
			successCount := 0
			for success := range successes {
				if success {
					successCount++
				}
			}
			assert.Equal(t, 1, successCount)
			// Different codes compete for the same remaining independent item.
			raceFields := append([]model.BenefitField(nil), fields...)
			raceFields[0].Value = "second-owner@example.invalid"
			require.NoError(t, model.ImportBenefitInventory(id, [][]model.BenefitField{raceFields}))
			stockCodes, err := model.GenerateBenefitCodes(model.BenefitCodeRequest{BenefitID: id, Count: 2, Mode: "single"})
			require.NoError(t, err)
			stockResults := make(chan bool, 2)
			for i, user := range users[1:3] {
				text, err := model.BenefitCodeValue(stockCodes[i])
				require.NoError(t, err)
				group.Go(func() { _, err := model.RedeemBenefit(user.Id, text); stockResults <- err == nil })
			}
			group.Wait()
			close(stockResults)
			stockSuccess := 0
			for success := range stockResults {
				if success {
					stockSuccess++
				}
			}
			assert.Equal(t, 1, stockSuccess)
			// Unlimited campaigns still allow one claim per account.
			campaign, err := model.GenerateBenefitCodes(model.BenefitCodeRequest{BenefitID: sharedID, Count: 1, Mode: "campaign", Limit: 0})
			require.NoError(t, err)
			value, err := model.BenefitCodeValue(campaign[0])
			require.NoError(t, err)
			for _, user := range users[1:3] {
				_, err = model.RedeemBenefit(user.Id, value)
				require.NoError(t, err)
				_, err = model.RedeemBenefit(user.Id, value)
				assert.ErrorIs(t, err, model.ErrBenefitClaimed)
			}
			popupCodes, err := model.GenerateBenefitCodes(model.BenefitCodeRequest{BenefitID: sharedID, Count: 1, Mode: "campaign", Limit: 5, TargetUserID: users[1].Id})
			require.NoError(t, err)
			notice := model.PopupNotice{Title: "Resource", Content: "Click to claim", Format: "text", Audience: "user", TargetUserId: users[1].Id, Status: "published", Frequency: "once", BenefitCodeID: popupCodes[0].ID}
			require.NoError(t, model.CreatePopupNotice(&notice, users[0].Id))
			_, err = model.RedeemPopupBenefit(users[2].Id, notice.Id, notice.Revision)
			assert.ErrorIs(t, err, model.ErrBenefitUnavailable)
			_, err = model.RedeemPopupBenefit(users[1].Id, notice.Id, notice.Revision+1)
			assert.ErrorIs(t, err, model.ErrBenefitUnavailable)
			popupResponse := popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/popup/%d/redeem", notice.Id), tokens[1], map[string]any{"revision": notice.Revision})
			assert.Equal(t, 200, popupResponse.Code, popupResponse.Body.String())
			assert.NotContains(t, popupResponse.Body.String(), "never-leak-password")
			require.NoError(t, db.Model(&model.PopupNotice{}).Where("id = ?", notice.Id).Update("status", "disabled").Error)
			_, err = model.RedeemPopupBenefit(users[1].Id, notice.Id, notice.Revision)
			assert.ErrorIs(t, err, model.ErrBenefitUnavailable)
			assert.Error(t, model.ValidatePopupBenefit(popupCodes[0].ID, "all_users", 0))
			var owner model.User
			require.NoError(t, db.First(&owner, users[1].Id).Error)
			assert.Equal(t, 123456, owner.Quota)
			var logs []model.AuditLog
			require.NoError(t, logDB.Find(&logs).Error)
			encoded, err := common.Marshal(logs)
			require.NoError(t, err)
			assert.NotContains(t, string(encoded), "never-leak-password")
			assert.NotContains(t, string(encoded), code)
			// The database's unique constraint is a final replay barrier.
			var receipt model.BenefitReceipt
			require.NoError(t, db.First(&receipt).Error)
			receipt.ID = 0
			assert.Error(t, db.Create(&receipt).Error)
			invalid := fields
			invalid[2].Value = "javascript:alert(1)"
			assert.Error(t, model.ImportBenefitInventory(id, [][]model.BenefitField{invalid}))
			t.Setenv("BENEFITS_ENCRYPTION_KEY", "")
			_, err = model.GetBenefitConfig(id)
			assert.ErrorIs(t, err, model.ErrBenefitKey)
		})
	}
}
