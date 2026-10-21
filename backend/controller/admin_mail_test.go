package controller

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestAdminMailDatabaseMatrixAndDelivery(t *testing.T) {
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
			db, err := gorm.Open(driver, &gorm.Config{})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			oldDB, oldLogDB, oldRedis, oldCookie := model.DB, model.LOG_DB, common.RedisEnabled, common.SessionCookieSecure
			oldMain, oldLog := common.MainDatabaseType(), common.LogDatabaseType()
			model.DB, model.LOG_DB, common.RedisEnabled, common.SessionCookieSecure = db, db, false, true
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&model.AdminMailDelivery{}, &model.AdminMailCampaign{}, &model.User{}, &model.AuditLog{}))
				model.DB, model.LOG_DB, common.RedisEnabled, common.SessionCookieSecure = oldDB, oldLogDB, oldRedis, oldCookie
				common.SetDatabaseTypes(oldMain, oldLog)
				require.NoError(t, sqlDB.Close())
			})
			var version string
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("real database: %s", version)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.AdminMailCampaign{}, &model.AdminMailDelivery{}, &model.User{}, &model.AuditLog{}))
			}
			tokens := []string{"mail-root-fixture", "mail-user-fixture"}
			users := []model.User{
				{Username: "mail-root", Password: "fixture-not-loginable", AffCode: "mr", Role: common.RoleRootUser, Status: 1, AuthVersion: 1, AccessToken: &tokens[0]},
				{Username: "mail-user", Password: "fixture-not-loginable", AffCode: "mu", Role: common.RoleCommonUser, Status: 1, AuthVersion: 1, Email: "one@example.invalid", AccessToken: &tokens[1]},
				{Username: "mail-second", Password: "fixture", AffCode: "ms", Role: 1, Status: 1, Email: "two@example.invalid"},
				{Username: "mail-empty", Password: "fixture", AffCode: "me", Role: 1, Status: 1},
				{Username: "mail-disabled", Password: "fixture", AffCode: "md", Role: 1, Status: 2, Email: "disabled@example.invalid"},
				{Username: "mail-duplicate", Password: "fixture", AffCode: "mx", Role: 1, Status: 1, Email: "ONE@example.invalid"},
			}
			require.NoError(t, db.Create(&users).Error)
			engine := gin.New()
			admin := engine.Group("/mail", middleware.RootAuth())
			admin.GET("", AdminListMail)
			admin.GET("/:id", AdminGetMail)
			admin.GET("/:id/recipients", AdminMailRecipients)
			admin.POST("", middleware.SessionCookieOriginGuard(), AdminCreateMailDraft)
			admin.POST("/preview", middleware.SessionCookieOriginGuard(), AdminPreviewMail)
			admin.POST("/:id/send", middleware.SessionCookieOriginGuard(), AdminQueueMail)
			admin.POST("/:id/cancel", middleware.SessionCookieOriginGuard(), AdminCancelMail)
			request := func(method, path, token, origin string, body any) *httptest.ResponseRecorder {
				data, err := common.Marshal(body)
				require.NoError(t, err)
				req := httptest.NewRequest(method, path, bytes.NewReader(data))
				req.Header.Set("Content-Type", "application/json")
				if token != "" {
					req.Header.Set("Authorization", "Bearer "+token)
				}
				if origin != "" {
					req.Header.Set("Origin", origin)
				}
				rec := httptest.NewRecorder()
				engine.ServeHTTP(rec, req)
				return rec
			}
			input := model.AdminMailInput{RequestKey: uuid.NewString(), Subject: "服务通知", Content: "## Hello\n\n**world**", Format: "markdown", Audience: "all_users"}
			t.Run("privilege and cross-origin checks protect content and sending", func(t *testing.T) {
				for _, route := range []string{"/mail", "/mail/1", "/mail/1/recipients"} {
					assert.Equal(t, 401, request("GET", route, "", "", nil).Code)
					assert.Equal(t, 403, request("GET", route, tokens[1], "", nil).Code)
				}
				for _, route := range []string{"/mail", "/mail/preview", "/mail/1/send", "/mail/1/cancel"} {
					assert.Equal(t, 403, request("POST", route, tokens[1], "http://example.com", input).Code)
					assert.Equal(t, 403, request("POST", route, tokens[0], "https://attacker.invalid", input).Code)
					assert.Equal(t, 403, request("POST", route, tokens[0], "", input).Code)
				}
			})
			t.Run("preview strips executable markup and header injection", func(t *testing.T) {
				malicious := input
				malicious.Format = "html"
				malicious.Content = `<p onclick="alert(1)">Hello</p><script>alert(2)</script><img src="https://tracker.invalid"><a href="javascript:alert(3)">link</a>`
				response := request("POST", "/mail/preview", tokens[0], "http://example.com", malicious)
				require.Equal(t, 200, response.Code)
				var preview struct{ Data struct{ Html string } }
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &preview))
				assert.Contains(t, preview.Data.Html, "Hello")
				for _, forbidden := range []string{"<script", "onclick", "javascript:", "tracker.invalid"} {
					assert.NotContains(t, preview.Data.Html, forbidden)
				}
				malicious.Subject = "Hi\r\nBcc: stranger@example.invalid"
				assert.Equal(t, 400, request("POST", "/mail", tokens[0], "http://example.com", malicious).Code)
				malicious = input
				malicious.Content = strings.Repeat("a", model.AdminMailMaxContentBytes+1)
				assert.Equal(t, 400, request("POST", "/mail", tokens[0], "http://example.com", malicious).Code)
				assert.False(t, model.ValidAdminMailAddress("a@example.com;other@example.com"))
			})
			response := request("POST", "/mail", tokens[0], "http://example.com", input)
			require.Equal(t, 200, response.Code, response.Body.String())
			var result struct{ Data model.AdminMailCampaign }
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
			campaign := result.Data
			assert.Equal(t, 2, campaign.RecipientCount)
			assert.Contains(t, string(campaign.Html), "<strong>world</strong>")
			replay := request("POST", "/mail", tokens[0], "http://example.com", input)
			require.Equal(t, 200, replay.Code)
			var replayResult struct{ Data model.AdminMailCampaign }
			require.NoError(t, common.Unmarshal(replay.Body.Bytes(), &replayResult))
			assert.Equal(t, campaign.Id, replayResult.Data.Id)
			changed := input
			changed.Subject = "different"
			assert.Equal(t, 409, request("POST", "/mail", tokens[0], "http://example.com", changed).Code)
			delivery, _, err := model.ClaimAdminMailDelivery(time.Now().Unix())
			require.NoError(t, err)
			assert.Nil(t, delivery, "draft does not send")
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.AdminMailCampaign{}, &model.AdminMailDelivery{}))
			}
			preserved, err := model.GetAdminMailCampaign(campaign.Id)
			require.NoError(t, err)
			assert.Equal(t, campaign.Html, preserved.Html)
			assert.EqualValues(t, 2, preserved.Counts["pending"])
			var recipients []model.AdminMailDelivery
			require.NoError(t, db.Where("campaign_id = ?", campaign.Id).Find(&recipients).Error)
			duplicate := recipients[0]
			duplicate.Id = 0
			assert.Error(t, db.Create(&duplicate).Error)
			require.NoError(t, model.QueueAdminMailCampaign(campaign.Id))
			require.NoError(t, model.QueueAdminMailCampaign(campaign.Id))
			delivery, work, err := model.ClaimAdminMailDelivery(time.Now().Unix())
			require.NoError(t, err)
			require.NotNil(t, delivery)
			seen := 0
			require.NoError(t, service.DeliverAdminMail(delivery, work, func(subject, email, html string) error {
				seen++
				assert.Equal(t, campaign.Subject, subject)
				assert.Equal(t, "one@example.invalid", email)
				assert.Equal(t, string(campaign.Html), html)
				assert.NotContains(t, html, "two@example.invalid")
				return nil
			}))
			delivery, work, err = model.ClaimAdminMailDelivery(time.Now().Unix())
			require.NoError(t, err)
			require.NotNil(t, delivery)
			require.NoError(t, service.DeliverAdminMail(delivery, work, func(string, string, string) error {
				seen++
				return &common.EmailDeliveryUncertain{Err: io.ErrUnexpectedEOF}
			}))
			delivery, _, err = model.ClaimAdminMailDelivery(time.Now().Unix() + 1000)
			require.NoError(t, err)
			assert.Nil(t, delivery)
			assert.Equal(t, 2, seen)
			preserved, err = model.GetAdminMailCampaign(campaign.Id)
			require.NoError(t, err)
			assert.Equal(t, "completed", preserved.Status)
			assert.EqualValues(t, 1, preserved.Counts["sent"])
			assert.EqualValues(t, 1, preserved.Counts["uncertain"])
			t.Run("cancel and changed accounts cannot be sent", func(t *testing.T) {
				selected := input
				selected.RequestKey = uuid.NewString()
				selected.Audience = "users"
				selected.UserIds = []int{users[2].Id, users[3].Id, users[4].Id}
				mail, err := model.CreateAdminMailDraft(selected, string(campaign.Html), users[0].Id)
				require.NoError(t, err)
				assert.Equal(t, 1, mail.RecipientCount)
				assert.Equal(t, 2, mail.SkippedCount)
				require.NoError(t, model.QueueAdminMailCampaign(mail.Id))
				require.NoError(t, db.Model(&users[2]).Update("email", "changed@example.invalid").Error)
				delivery, work, err := model.ClaimAdminMailDelivery(time.Now().Unix())
				require.NoError(t, err)
				require.NotNil(t, delivery)
				require.NoError(t, service.DeliverAdminMail(delivery, work, func(string, string, string) error { t.Fatal("must not send to an old email"); return nil }))
				var receipt model.AdminMailDelivery
				require.NoError(t, db.First(&receipt, delivery.Id).Error)
				assert.Equal(t, "skipped", receipt.Status)
				selected.RequestKey = uuid.NewString()
				cancelled, err := model.CreateAdminMailDraft(selected, string(campaign.Html), users[0].Id)
				require.NoError(t, err)
				require.NoError(t, model.CancelAdminMailCampaign(cancelled.Id))
				assert.ErrorIs(t, model.QueueAdminMailCampaign(cancelled.Id), model.ErrAdminMailConflict)
			})
			t.Run("failed SMTP does not leak response text into records", func(t *testing.T) {
				selected := input
				selected.RequestKey = uuid.NewString()
				selected.Audience = "users"
				selected.UserIds = []int{users[1].Id}
				mail, err := model.CreateAdminMailDraft(selected, string(campaign.Html), users[0].Id)
				require.NoError(t, err)
				require.NoError(t, model.QueueAdminMailCampaign(mail.Id))
				delivery, work, err := model.ClaimAdminMailDelivery(time.Now().Unix())
				require.NoError(t, err)
				require.NotNil(t, delivery)
				require.NoError(t, service.DeliverAdminMail(delivery, work, func(string, string, string) error { return errors.New("secret-fixture-from-SMTP") }))
				resp := request("GET", fmt.Sprintf("/mail/%d/recipients", mail.Id), tokens[0], "", nil)
				require.Equal(t, 200, resp.Code)
				assert.Contains(t, resp.Body.String(), "smtp_failed")
				assert.NotContains(t, resp.Body.String(), "secret-fixture")
			})
			t.Run("direct emails work without site accounts and reject injected addresses", func(t *testing.T) {
				direct := input
				direct.RequestKey = uuid.NewString()
				direct.Audience = "emails"
				direct.Emails = []string{"EXTERNAL@example.invalid", "external@example.invalid"}
				response := request("POST", "/mail", tokens[0], "http://example.com", direct)
				require.Equal(t, 200, response.Code, response.Body.String())
				var saved struct{ Data model.AdminMailCampaign }
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &saved))
				assert.Equal(t, 1, saved.Data.RecipientCount)
				require.NoError(t, model.QueueAdminMailCampaign(saved.Data.Id))
				delivery, work, err := model.ClaimAdminMailDelivery(time.Now().Unix())
				require.NoError(t, err)
				require.NotNil(t, delivery)
				assert.Zero(t, delivery.UserId)
				require.NoError(t, service.DeliverAdminMail(delivery, work, func(_ string, address string, _ string) error {
					assert.Equal(t, "external@example.invalid", address)
					return nil
				}))
				replay := request("POST", "/mail", tokens[0], "http://example.com", direct)
				require.Equal(t, 200, replay.Code)
				direct.Emails = []string{"changed@example.invalid"}
				assert.Equal(t, 409, request("POST", "/mail", tokens[0], "http://example.com", direct).Code)
				direct.RequestKey = uuid.NewString()
				direct.Emails = []string{"external@example.invalid\r\nBcc:other@example.invalid"}
				assert.Equal(t, 400, request("POST", "/mail", tokens[0], "http://example.com", direct).Code)
				formatted, err := service.RenderAdminMail("排版", "### 标题\n\n- 条目", "markdown")
				require.NoError(t, err)
				assert.Contains(t, formatted, "font-size:18px;font-weight:bold")
				assert.Contains(t, formatted, "list-style-type:disc")
			})
		})
	}
}
