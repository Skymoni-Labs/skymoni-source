package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
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

type popupNoticeTestResponse struct {
	Success bool              `json:"success"`
	Data    model.PopupNotice `json:"data"`
}

func popupNoticeTestRequest(t *testing.T, router http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := common.Marshal(body)
	require.NoError(t, err)
	request := httptest.NewRequest(method, path, bytes.NewReader(encoded))
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}

func TestPopupNoticeDatabaseMatrixAndAudienceLifecycle(t *testing.T) {
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
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "popup_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			logDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
			require.NoError(t, err)
			logSQL, err := logDB.DB()
			require.NoError(t, err)
			logSQL.SetMaxOpenConns(1)
			require.NoError(t, logDB.AutoMigrate(&model.AuditLog{}))
			previousDB, previousLogDB := model.DB, model.LOG_DB
			previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
			previousRedis := common.RedisEnabled
			model.DB, model.LOG_DB, common.RedisEnabled = db, logDB, false
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseTypeSQLite)
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&model.PopupTemplate{}, &model.PopupNoticeRevision{}, &model.PopupNoticeRead{}, &model.PopupNotice{}, &model.User{}))
				model.DB, model.LOG_DB, common.RedisEnabled = previousDB, previousLogDB, previousRedis
				common.SetDatabaseTypes(previousMain, previousLog)
				require.NoError(t, sqlDB.Close())
				require.NoError(t, logSQL.Close())
			})
			var version string
			versionQuery := "SELECT version()"
			if dialect == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("database version: %s", version)
			// Fresh startup, repeated migration and a >64 KiB content round trip.
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.PopupNotice{}, &model.PopupNoticeRead{}, &model.PopupNoticeRevision{}))
				require.NoError(t, model.BackfillPopupNoticeRevisions())
			}
			large := model.PopupNotice{Title: "中文内容", Content: model.PopupNoticeContent(strings.Repeat("a", 100000)), Format: "html", Audience: "guest", Status: "draft", Frequency: "once"}
			require.NoError(t, model.CreatePopupNotice(&large, 1))
			stored, err := model.GetPopupNotice(large.Id)
			require.NoError(t, err)
			assert.Equal(t, large.Content, stored.Content)
			// Upgrade the preceding popup schema, whose authored schedule did not
			// include a duration. Neither the schedule nor receipts may be lost.
			require.NoError(t, db.Migrator().DropColumn(&model.PopupNotice{}, "duration_days"))
			require.NoError(t, db.Migrator().DropTable(&model.PopupNoticeRevision{}))
			legacyStart, legacyEnd := int64(1700000000), int64(1700259200)
			require.NoError(t, db.Model(&model.PopupNotice{}).Where("id = ?", large.Id).Updates(map[string]any{"start_at": legacyStart, "end_at": legacyEnd}).Error)
			legacyRead := model.PopupNoticeRead{NoticeId: large.Id, Revision: 1, UserId: 42, ReadAt: legacyStart}
			require.NoError(t, db.Create(&legacyRead).Error)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.PopupNotice{}, &model.PopupNoticeRead{}, &model.PopupNoticeRevision{}))
				require.NoError(t, model.BackfillPopupNoticeRevisions())
			}
			stored, err = model.GetPopupNotice(large.Id)
			require.NoError(t, err)
			assert.Equal(t, large.Content, stored.Content)
			assert.Zero(t, stored.DurationDays)
			assert.Equal(t, legacyStart, stored.StartAt)
			assert.Equal(t, legacyEnd, stored.EndAt)
			assert.EqualValues(t, 1, stored.ReadCount)
			var upgradedRead model.PopupNoticeRead
			require.NoError(t, db.First(&upgradedRead, legacyRead.Id).Error)
			assert.Equal(t, legacyRead, upgradedRead)
			legacyHistory, err := model.GetPopupNoticeHistory(42, legacyRead.Id)
			require.NoError(t, err)
			assert.Equal(t, large.Content, legacyHistory.Content)
			assert.Error(t, db.Create(&model.PopupNoticeRead{NoticeId: large.Id, Revision: 1, UserId: 42}).Error)
			require.NoError(t, db.Migrator().DropTable(&model.PopupNoticeRevision{}, &model.PopupNoticeRead{}, &model.PopupNotice{}))
			// Upgrade an existing users schema; the existing account survives.
			require.NoError(t, db.AutoMigrate(&model.User{}))
			tokens := []string{"popup-root-fixture", "popup-owner-fixture", "popup-other-fixture", "popup-admin-fixture"}
			roles := []int{common.RoleRootUser, common.RoleCommonUser, common.RoleCommonUser, common.RoleAdminUser}
			users := make([]model.User, 4)
			for i := range users {
				users[i] = model.User{Username: fmt.Sprintf("popup-user-%d", i), Password: "fixture", AffCode: fmt.Sprintf("popup-%d", i), Role: roles[i], Status: common.UserStatusEnabled, AccessToken: &tokens[i], AuthVersion: 1}
				require.NoError(t, db.Create(&users[i]).Error)
			}
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.PopupNotice{}, &model.PopupNoticeRead{}, &model.PopupNoticeRevision{}))
				require.NoError(t, model.BackfillPopupNoticeRevisions())
			}
			var owner model.User
			require.NoError(t, db.First(&owner, users[1].Id).Error)
			assert.Equal(t, users[1].Username, owner.Username)
			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.Use(middleware.RequestId(), middleware.DisableCache())
			router.GET("/guest", GetGuestPopupNotices)
			router.GET("/self", middleware.UserAuth(), GetSelfPopupNotices)
			router.GET("/history", middleware.UserAuth(), GetSelfPopupNoticeHistory)
			router.GET("/history/:id", middleware.UserAuth(), GetSelfPopupNoticeHistoryDetail)
			router.POST("/:id/read", middleware.UserAuth(), ReadPopupNotice)
			admin := router.Group("/admin", middleware.RootAuth())
			admin.GET("", AdminListPopupNotices)
			admin.POST("", AdminCreatePopupNotice)
			admin.GET("/:id", AdminGetPopupNotice)
			admin.PUT("/:id", AdminUpdatePopupNotice)
			admin.DELETE("/:id", AdminDeletePopupNotice)
			admin.POST("/:id/state", AdminSetPopupNoticeState)
			admin.GET("/templates", AdminListPopupTemplates)
			admin.POST("/templates", AdminSavePopupTemplate)
			admin.PUT("/templates/:id", AdminSavePopupTemplate)
			admin.DELETE("/templates/:id", AdminDeletePopupTemplate)
			t.Run("template library persists and never delivers templates", func(t *testing.T) {
				require.NoError(t, db.AutoMigrate(&model.PopupTemplate{}))
				testPopupTemplateLifecycle(t, db, router, tokens)
			})

			t.Run("anonymous and non-root callers cannot administer or acknowledge", func(t *testing.T) {
				for _, path := range []string{"/self", "/admin", "/history", "/history/1"} {
					assert.Equal(t, http.StatusUnauthorized, popupNoticeTestRequest(t, router, "GET", path, "", nil).Code)
				}
				assert.Equal(t, http.StatusUnauthorized, popupNoticeTestRequest(t, router, "POST", "/1/read", "", map[string]any{"revision": 1}).Code)
				for _, token := range tokens[1:] {
					assert.Equal(t, http.StatusForbidden, popupNoticeTestRequest(t, router, "POST", "/admin", token, map[string]any{"title": "unauthorized", "content": "private"}).Code)
				}
			})
			now := time.Now().Unix()
			items := []model.PopupNotice{
				{Title: "All", Content: "all logged users", Audience: "all_users", Status: "published", Frequency: "once", Format: "text"},
				{Title: "Private", Content: "private-owner-body", Audience: "user", TargetUserId: owner.Id, Status: "published", Frequency: "once", Format: "markdown", Priority: 9},
				{Title: "Visitor", Content: "public guest body", Audience: "guest", Status: "published", Frequency: "once", Format: "html"},
				{Title: "Draft", Content: "draft-body", Audience: "all_users", Status: "draft", Frequency: "once", Format: "auto"},
				{Title: "Expired", Content: "expired-body", Audience: "all_users", Status: "published", Frequency: "once", Format: "text", EndAt: now - 1},
				{Title: "Future", Content: "future-body", Audience: "all_users", Status: "published", Frequency: "once", Format: "text", StartAt: now + 3600},
				{Title: "Disabled", Content: "disabled-body", Audience: "all_users", Status: "disabled", Frequency: "once", Format: "text"},
			}
			for i := range items {
				require.NoError(t, model.CreatePopupNotice(&items[i], users[0].Id))
			}
			t.Run("audience delivery is isolated and strips administrative fields", func(t *testing.T) {
				guest := popupNoticeTestRequest(t, router, "GET", "/guest", "", nil)
				require.Equal(t, 200, guest.Code)
				assert.Contains(t, guest.Body.String(), "public guest body")
				assert.NotContains(t, guest.Body.String(), "private-owner-body")
				assert.NotContains(t, guest.Body.String(), "all logged users")
				assert.Contains(t, guest.Header().Get("Cache-Control"), "no-store")
				response := popupNoticeTestRequest(t, router, "GET", "/self?user_id="+strconv.Itoa(owner.Id), tokens[2], nil)
				assert.NotContains(t, response.Body.String(), "private-owner-body")
				response = popupNoticeTestRequest(t, router, "GET", "/self", tokens[1], nil)
				assert.Contains(t, response.Body.String(), "private-owner-body")
				for _, content := range []string{"public guest body", "draft-body", "expired-body", "future-body", "disabled-body", "target_user_id", "created_by"} {
					assert.NotContains(t, response.Body.String(), content)
				}
				var result struct{ Data []popupNoticeDelivery }
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				require.Len(t, result.Data, 2)
				assert.Equal(t, items[1].Id, result.Data[0].Id)
			})
			t.Run("private receipt cannot be forged and repeated acknowledgement is idempotent", func(t *testing.T) {
				path := fmt.Sprintf("/%d/read", items[1].Id)
				identityChanged := popupNoticeTestRequest(t, router, "POST", path, tokens[1], map[string]any{"revision": 1, "expected_user_id": users[2].Id})
				assert.Equal(t, 409, identityChanged.Code)
				assert.Contains(t, identityChanged.Body.String(), "POPUP_IDENTITY_CHANGED")
				var readCount int64
				require.NoError(t, db.Model(&model.PopupNoticeRead{}).Where("notice_id = ?", items[1].Id).Count(&readCount).Error)
				assert.Zero(t, readCount, "a changed actor must not acknowledge the notice for a different account")
				assert.Equal(t, 404, popupNoticeTestRequest(t, router, "POST", path, tokens[2], map[string]any{"revision": 1, "user_id": owner.Id}).Code)
				assert.Equal(t, 409, popupNoticeTestRequest(t, router, "POST", path, tokens[1], map[string]any{"revision": 2}).Code)
				for range 2 {
					require.Equal(t, 200, popupNoticeTestRequest(t, router, "POST", path, tokens[1], map[string]any{"revision": 1, "user_id": users[2].Id, "expected_user_id": owner.Id}).Code)
				}
				var receipts []model.PopupNoticeRead
				require.NoError(t, db.Where("notice_id = ?", items[1].Id).Find(&receipts).Error)
				require.Len(t, receipts, 1)
				assert.Equal(t, owner.Id, receipts[0].UserId)
				confirmed, err := model.GetPopupNotice(items[1].Id)
				require.NoError(t, err)
				assert.EqualValues(t, 1, confirmed.ReadCount)
				listed, _, err := model.ListPopupNotices("", "user", "Private", 0, 20)
				require.NoError(t, err)
				require.Len(t, listed, 1)
				assert.EqualValues(t, 1, listed[0].ReadCount)
				assert.Error(t, db.Create(&model.PopupNoticeRead{NoticeId: items[1].Id, Revision: 1, UserId: owner.Id}).Error)
				assert.NotContains(t, popupNoticeTestRequest(t, router, "GET", "/self", tokens[1], nil).Body.String(), "private-owner-body")
			})
			t.Run("changing content and explicit resend advance revision but disable-enable does not", func(t *testing.T) {
				path := fmt.Sprintf("/admin/%d", items[1].Id)
				for _, status := range []string{"disabled", "published"} {
					response := popupNoticeTestRequest(t, router, "POST", path+"/state", tokens[0], map[string]any{"status": status})
					require.Equal(t, 200, response.Code)
					var result popupNoticeTestResponse
					require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
					assert.EqualValues(t, 1, result.Data.Revision)
				}
				assert.NotContains(t, popupNoticeTestRequest(t, router, "GET", "/self", tokens[1], nil).Body.String(), "private-owner-body")
				changed := items[1]
				changed.Content = "updated-private"
				response := popupNoticeTestRequest(t, router, "PUT", path, tokens[0], changed)
				require.Equal(t, 200, response.Code)
				var result popupNoticeTestResponse
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.EqualValues(t, 2, result.Data.Revision)
				assert.Equal(t, 409, popupNoticeTestRequest(t, router, "PUT", path, tokens[0], changed).Code)
				assert.Equal(t, 409, popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/%d/read", items[1].Id), tokens[1], map[string]any{"revision": 1}).Code)
				assert.Contains(t, popupNoticeTestRequest(t, router, "GET", "/self", tokens[1], nil).Body.String(), "updated-private")
				response = popupNoticeTestRequest(t, router, "POST", path+"/state", tokens[0], map[string]any{"status": "published", "resend": true})
				require.Equal(t, 200, response.Code)
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.EqualValues(t, 3, result.Data.Revision)
				resent, err := model.GetPopupNotice(items[1].Id)
				require.NoError(t, err)
				assert.Zero(t, resent.ReadCount, "earlier revisions must not inflate the new revision's confirmation count")
			})
			t.Run("duration drafts begin at publication and explicit resend renews them", func(t *testing.T) {
				body := map[string]any{"title": "Duration", "content": "duration body", "duration_days": 2, "status": "draft", "start_at": 1700000000, "end_at": 1700259200}
				response := popupNoticeTestRequest(t, router, "POST", "/admin", tokens[0], body)
				require.Equal(t, http.StatusCreated, response.Code)
				var result popupNoticeTestResponse
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.Equal(t, 2, result.Data.DurationDays)
				assert.Zero(t, result.Data.StartAt)
				assert.Zero(t, result.Data.EndAt)
				assert.Zero(t, result.Data.PublishedAt)
				path := fmt.Sprintf("/admin/%d", result.Data.Id)
				agedDraft := time.Now().Unix() - 10*86400
				require.NoError(t, db.Model(&model.PopupNotice{}).Where("id = ?", result.Data.Id).Updates(map[string]any{"created_at": agedDraft, "updated_at": agedDraft}).Error)
				beforePublish := time.Now().Unix()
				response = popupNoticeTestRequest(t, router, "POST", path+"/state", tokens[0], map[string]any{"status": "published"})
				require.Equal(t, http.StatusOK, response.Code)
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.GreaterOrEqual(t, result.Data.PublishedAt, beforePublish)
				assert.LessOrEqual(t, result.Data.PublishedAt, time.Now().Unix())
				assert.Equal(t, result.Data.PublishedAt+2*86400, result.Data.EndAt)
				assert.Zero(t, result.Data.StartAt)
				assert.EqualValues(t, 1, result.Data.Revision)
				published := result.Data
				for _, status := range []string{"disabled", "published"} {
					response = popupNoticeTestRequest(t, router, "POST", path+"/state", tokens[0], map[string]any{"status": status})
					require.Equal(t, http.StatusOK, response.Code)
					require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
					assert.Equal(t, published.EndAt, result.Data.EndAt)
					assert.Equal(t, published.PublishedAt, result.Data.PublishedAt)
					assert.Equal(t, published.Revision, result.Data.Revision)
				}
				body["content"], body["duration_days"], body["revision"] = "edited duration body", 5, result.Data.Revision
				response = popupNoticeTestRequest(t, router, "PUT", path, tokens[0], body)
				require.Equal(t, http.StatusOK, response.Code)
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.Equal(t, 5, result.Data.DurationDays)
				assert.Zero(t, result.Data.StartAt)
				assert.Zero(t, result.Data.EndAt)
				assert.EqualValues(t, 2, result.Data.Revision)
				oldPublication := time.Now().Unix() - 7*86400
				require.NoError(t, db.Model(&model.PopupNotice{}).Where("id = ?", result.Data.Id).Update("published_at", oldPublication).Error)
				beforePublish = time.Now().Unix()
				response = popupNoticeTestRequest(t, router, "POST", path+"/state", tokens[0], map[string]any{"status": "published"})
				require.Equal(t, http.StatusOK, response.Code)
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.GreaterOrEqual(t, result.Data.PublishedAt, beforePublish)
				assert.Equal(t, result.Data.PublishedAt+5*86400, result.Data.EndAt)
				assert.EqualValues(t, 2, result.Data.Revision)
				require.NoError(t, db.Model(&model.PopupNotice{}).Where("id = ?", result.Data.Id).Updates(map[string]any{"published_at": oldPublication, "end_at": oldPublication + 5*86400}).Error)
				beforePublish = time.Now().Unix()
				response = popupNoticeTestRequest(t, router, "POST", path+"/state", tokens[0], map[string]any{"status": "published", "resend": true})
				require.Equal(t, http.StatusOK, response.Code)
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.GreaterOrEqual(t, result.Data.PublishedAt, beforePublish)
				assert.Equal(t, result.Data.PublishedAt+5*86400, result.Data.EndAt)
				assert.EqualValues(t, 3, result.Data.Revision)
				require.NoError(t, model.ReadPopupNotice(owner.Id, result.Data.Id, result.Data.Revision, result.Data.EndAt-1))
				assert.ErrorIs(t, model.ReadPopupNotice(owner.Id, result.Data.Id, result.Data.Revision, result.Data.EndAt), model.ErrPopupNoticeNotFound)
			})
			t.Run("published duration edits retain the publication anchor and zero is permanent", func(t *testing.T) {
				for _, days := range []int{0, 3650} {
					body := map[string]any{"title": "Published duration", "content": "duration body", "status": "published", "duration_days": days}
					response := popupNoticeTestRequest(t, router, "POST", "/admin", tokens[0], body)
					require.Equal(t, http.StatusCreated, response.Code)
					var result popupNoticeTestResponse
					require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
					assert.Equal(t, days, result.Data.DurationDays)
					assert.Zero(t, result.Data.StartAt)
					if days == 0 {
						assert.Zero(t, result.Data.EndAt)
						continue
					}
					assert.Equal(t, result.Data.PublishedAt+int64(days)*86400, result.Data.EndAt)
					oldPublication := result.Data.PublishedAt - 86400
					require.NoError(t, db.Model(&model.PopupNotice{}).Where("id = ?", result.Data.Id).Updates(map[string]any{"published_at": oldPublication, "end_at": oldPublication + int64(days)*86400}).Error)
					body["content"], body["duration_days"], body["revision"] = "updated published duration", 3, result.Data.Revision
					response = popupNoticeTestRequest(t, router, "PUT", fmt.Sprintf("/admin/%d", result.Data.Id), tokens[0], body)
					require.Equal(t, http.StatusOK, response.Code)
					require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
					assert.Equal(t, oldPublication, result.Data.PublishedAt)
					assert.Equal(t, oldPublication+3*86400, result.Data.EndAt)
				}
			})
			t.Run("legacy timestamp windows survive omitted duration until an explicit duration save", func(t *testing.T) {
				start, end := time.Now().Unix()+86400, time.Now().Unix()+4*86400
				body := map[string]any{"title": "Legacy window", "content": "legacy body", "status": "published", "start_at": start, "end_at": end}
				response := popupNoticeTestRequest(t, router, "POST", "/admin", tokens[0], body)
				require.Equal(t, http.StatusCreated, response.Code)
				var result popupNoticeTestResponse
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.Zero(t, result.Data.DurationDays)
				assert.Equal(t, start, result.Data.StartAt)
				assert.Equal(t, end, result.Data.EndAt)
				path := fmt.Sprintf("/admin/%d", result.Data.Id)
				publication := result.Data.PublishedAt
				body["content"], body["revision"] = "edited legacy body", result.Data.Revision
				response = popupNoticeTestRequest(t, router, "PUT", path, tokens[0], body)
				require.Equal(t, http.StatusOK, response.Code)
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.Equal(t, publication, result.Data.PublishedAt)
				for _, status := range []string{"disabled", "published", "draft", "published"} {
					response = popupNoticeTestRequest(t, router, "POST", path+"/state", tokens[0], map[string]any{"status": status})
					require.Equal(t, http.StatusOK, response.Code)
					require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
					assert.Equal(t, start, result.Data.StartAt)
					assert.Equal(t, end, result.Data.EndAt)
				}
				body["status"], body["duration_days"], body["revision"] = "draft", 0, result.Data.Revision
				response = popupNoticeTestRequest(t, router, "PUT", path, tokens[0], body)
				require.Equal(t, http.StatusOK, response.Code)
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.Zero(t, result.Data.StartAt)
				assert.Zero(t, result.Data.EndAt)
				response = popupNoticeTestRequest(t, router, "POST", path+"/state", tokens[0], map[string]any{"status": "published"})
				require.Equal(t, http.StatusOK, response.Code)
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				assert.Zero(t, result.Data.DurationDays)
				assert.Zero(t, result.Data.StartAt)
				assert.Zero(t, result.Data.EndAt)
			})
			t.Run("daily resumes on next Beijing day while visit remains eligible", func(t *testing.T) {
				fixedNow := time.Date(2026, 10, 4, 15, 59, 0, 0, time.UTC).Unix()
				for _, frequency := range []string{"daily", "visit"} {
					item := model.PopupNotice{Title: frequency, Content: "repeatable", Format: "text", Audience: "user", TargetUserId: owner.Id, Status: "published", Frequency: frequency}
					require.NoError(t, model.CreatePopupNotice(&item, users[0].Id))
					require.NoError(t, model.ReadPopupNotice(owner.Id, item.Id, 1, fixedNow))
					eligible, err := model.GetEligiblePopupNotices(owner.Id, fixedNow, 1, nil)
					require.NoError(t, err)
					found := false
					for _, candidate := range eligible {
						if candidate.Id == item.Id {
							found = true
						}
					}
					assert.Equal(t, frequency == "visit", found)
					eligible, err = model.GetEligiblePopupNotices(owner.Id, fixedNow+120, 1, nil)
					require.NoError(t, err)
					found = false
					for _, candidate := range eligible {
						if candidate.Id == item.Id {
							found = true
						}
					}
					assert.True(t, found)
					if frequency == "daily" {
						require.NoError(t, model.ReadPopupNotice(owner.Id, item.Id, 1, fixedNow+120))
					}
				}
			})
			t.Run("validation rejects oversized content bad enum interval and missing target", func(t *testing.T) {
				for _, body := range []any{
					map[string]any{"title": "valid", "content": strings.Repeat("x", model.MaxPopupNoticeContentBytes+1)},
					map[string]any{"title": strings.Repeat("云", 201), "content": "text"},
					map[string]any{"title": "valid", "content": "text", "format": "script"},
					map[string]any{"title": "valid", "content": "text", "audience": "user", "target_user_id": 999999},
					map[string]any{"title": "valid", "content": "text", "start_at": 10, "end_at": 9},
					map[string]any{"title": "valid", "content": "text", "frequency": "always"},
					map[string]any{"title": "valid", "content": "text", "duration_days": -1},
					map[string]any{"title": "valid", "content": "text", "duration_days": 3651},
					map[string]any{"title": "valid", "content": "text", "duration_days": 1.5},
				} {
					assert.Equal(t, 400, popupNoticeTestRequest(t, router, "POST", "/admin", tokens[0], body).Code)
				}
				for _, days := range []int{-1, 3651} {
					assert.Equal(t, http.StatusBadRequest, popupNoticeTestRequest(t, router, "PUT", fmt.Sprintf("/admin/%d", items[0].Id), tokens[0], map[string]any{"title": "valid", "content": "text", "revision": 1, "duration_days": days}).Code)
				}
			})
			t.Run("visitor pagination can deliver messages after the first twenty", func(t *testing.T) {
				for i := range 20 {
					item := model.PopupNotice{Title: fmt.Sprintf("Visitor %d", i), Content: "extra visitor", Audience: "guest", Status: "published", Frequency: "once", Format: "text"}
					require.NoError(t, model.CreatePopupNotice(&item, users[0].Id))
				}
				first := popupNoticeTestRequest(t, router, "GET", "/guest?p=1", "", nil)
				second := popupNoticeTestRequest(t, router, "GET", "/guest?p=2", "", nil)
				var result struct{ Data []popupNoticeDelivery }
				require.NoError(t, common.Unmarshal(first.Body.Bytes(), &result))
				require.Len(t, result.Data, 20)
				require.NoError(t, common.Unmarshal(second.Body.Bytes(), &result))
				require.Len(t, result.Data, 1)
				assert.Equal(t, items[2].Id, result.Data[0].Id)
				assert.Equal(t, 400, popupNoticeTestRequest(t, router, "GET", "/guest?p=-1", "", nil).Code)
			})
			t.Run("delete is soft and expired draft and guest receipts are denied", func(t *testing.T) {
				for _, i := range []int{2, 3, 4, 5, 6} {
					assert.Equal(t, 404, popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/%d/read", items[i].Id), tokens[1], map[string]any{"revision": 1}).Code)
				}
				path := fmt.Sprintf("/admin/%d", items[1].Id)
				require.Equal(t, 200, popupNoticeTestRequest(t, router, "DELETE", path, tokens[0], nil).Code)
				assert.Equal(t, 404, popupNoticeTestRequest(t, router, "GET", path, tokens[0], nil).Code)
				var deleted model.PopupNotice
				require.NoError(t, db.Unscoped().First(&deleted, items[1].Id).Error)
				assert.True(t, deleted.DeletedAt.Valid)
				var audit []model.AuditLog
				require.NoError(t, logDB.Where("category = ?", model.AuditCategoryOperation).Find(&audit).Error)
				encoded, err := common.Marshal(audit)
				require.NoError(t, err)
				assert.NotContains(t, string(encoded), "private-owner-body")
				assert.NotContains(t, string(encoded), "updated-private")
			})
			t.Run("own history retains immutable shared content after retarget expiry disable and deletion", func(t *testing.T) {
				item := model.PopupNotice{Title: "Original received title", Content: "original-history-body", Format: "markdown", Audience: "all_users", Status: "published", Frequency: "once"}
				require.NoError(t, model.CreatePopupNotice(&item, users[0].Id))
				for _, token := range tokens[1:3] {
					require.Equal(t, http.StatusOK, popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/%d/read", item.Id), token, map[string]any{"revision": item.Revision}).Code)
				}
				var snapshotCount int64
				require.NoError(t, db.Model(&model.PopupNoticeRevision{}).Where("notice_id = ? AND revision = ?", item.Id, item.Revision).Count(&snapshotCount).Error)
				assert.EqualValues(t, 1, snapshotCount, "recipients share one immutable content copy")
				var receipt model.PopupNoticeRead
				require.NoError(t, db.Where("notice_id = ? AND revision = ? AND user_id = ?", item.Id, item.Revision, owner.Id).First(&receipt).Error)
				historyPath := fmt.Sprintf("/history/%d", receipt.Id)
				response := popupNoticeTestRequest(t, router, "GET", "/history?user_id="+strconv.Itoa(users[2].Id), tokens[1], nil)
				require.Equal(t, http.StatusOK, response.Code)
				assert.Contains(t, response.Body.String(), item.Title)
				assert.NotContains(t, response.Body.String(), string(item.Content))
				for _, field := range []string{"target_user_id", "user_id", "created_by", "audience", "content"} {
					assert.NotContains(t, response.Body.String(), `"`+field+`"`)
				}
				assert.Contains(t, response.Header().Get("Cache-Control"), "no-store")
				assert.Equal(t, http.StatusNotFound, popupNoticeTestRequest(t, router, "GET", historyPath+"?user_id="+strconv.Itoa(owner.Id), tokens[2], nil).Code)
				changed := item
				changed.Title, changed.Content, changed.Format = "Later private title", "later-private-body", "html"
				changed.Audience, changed.TargetUserId = "user", users[3].Id
				changed.Status = "draft"
				require.NoError(t, db.Model(&model.PopupNotice{}).Where("id = ?", item.Id).Update("published_at", item.PublishedAt-2*86400).Error)
				response = popupNoticeTestRequest(t, router, "PUT", fmt.Sprintf("/admin/%d", item.Id), tokens[0], changed)
				require.Equal(t, http.StatusOK, response.Code)
				var updated popupNoticeTestResponse
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &updated))
				assert.EqualValues(t, 2, updated.Data.Revision)
				require.NoError(t, db.Model(&model.PopupNoticeRevision{}).Where("notice_id = ? AND revision = ?", item.Id, updated.Data.Revision).Count(&snapshotCount).Error)
				assert.Zero(t, snapshotCount, "an edited draft must not be archived as a published revision")
				beforePublication := time.Now().Unix()
				response = popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/admin/%d/state", item.Id), tokens[0], map[string]any{"status": "published"})
				require.Equal(t, http.StatusOK, response.Code)
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &updated))
				assert.GreaterOrEqual(t, updated.Data.PublishedAt, beforePublication)
				require.Equal(t, http.StatusOK, popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/%d/read", item.Id), tokens[3], map[string]any{"revision": updated.Data.Revision}).Code)
				var laterReceipt model.PopupNoticeRead
				require.NoError(t, db.Where("notice_id = ? AND revision = ? AND user_id = ?", item.Id, updated.Data.Revision, users[3].Id).First(&laterReceipt).Error)
				laterHistory, err := model.GetPopupNoticeHistory(users[3].Id, laterReceipt.Id)
				require.NoError(t, err)
				assert.Equal(t, updated.Data.PublishedAt, laterHistory.PublishedAt)
				assert.Equal(t, http.StatusNotFound, popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/history/%d?user_id=%d", laterReceipt.Id, users[3].Id), tokens[1], nil).Code)
				response = popupNoticeTestRequest(t, router, "GET", "/history?user_id="+strconv.Itoa(users[3].Id), tokens[1], nil)
				assert.NotContains(t, response.Body.String(), changed.Title)
				assert.NotContains(t, response.Body.String(), string(changed.Content))
				require.NoError(t, db.Model(&model.PopupNotice{}).Where("id = ?", item.Id).Update("end_at", time.Now().Unix()-1).Error)
				for _, operation := range []string{"expired", "disabled", "deleted"} {
					if operation == "disabled" {
						require.Equal(t, http.StatusOK, popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/admin/%d/state", item.Id), tokens[0], map[string]any{"status": "disabled"}).Code)
					} else if operation == "deleted" {
						require.Equal(t, http.StatusOK, popupNoticeTestRequest(t, router, "DELETE", fmt.Sprintf("/admin/%d", item.Id), tokens[0], nil).Code)
					}
					response = popupNoticeTestRequest(t, router, "GET", historyPath, tokens[1], nil)
					require.Equal(t, http.StatusOK, response.Code, operation)
					var detail struct {
						Data model.PopupNoticeHistoryDetail
					}
					require.NoError(t, common.Unmarshal(response.Body.Bytes(), &detail))
					assert.Equal(t, item.Title, detail.Data.Title)
					assert.Equal(t, item.Content, detail.Data.Content)
					assert.Equal(t, item.Format, detail.Data.Format)
					assert.Equal(t, item.PublishedAt, detail.Data.PublishedAt)
					assert.Equal(t, receipt.ReadAt, detail.Data.ReadAt)
					assert.NotContains(t, response.Body.String(), string(changed.Content))
					assert.Contains(t, response.Header().Get("Cache-Control"), "no-store")
				}
				var unchangedReceipt model.PopupNoticeRead
				require.NoError(t, db.First(&unchangedReceipt, receipt.Id).Error)
				assert.Equal(t, receipt, unchangedReceipt, "history viewing does not acknowledge or alter frequency")
			})
			t.Run("legacy snapshots recover only matching receipts and protect disabled content before first edit", func(t *testing.T) {
				legacy := model.PopupNotice{Title: "Legacy disabled title", Content: "legacy-disabled-before-edit", Format: "text", Audience: "user", TargetUserId: owner.Id, Status: "disabled", Frequency: "once", Revision: 7, PublishedAt: 1700000000, EndAt: 1700259200}
				require.NoError(t, db.Create(&legacy).Error)
				read := model.PopupNoticeRead{NoticeId: legacy.Id, Revision: legacy.Revision, UserId: owner.Id, ReadAt: legacy.PublishedAt}
				require.NoError(t, db.Create(&read).Error)
				changed := legacy
				changed.Content, changed.Status = "new-draft-must-not-replace-history", "draft"
				response := popupNoticeTestRequest(t, router, "PUT", fmt.Sprintf("/admin/%d", legacy.Id), tokens[0], changed)
				require.Equal(t, http.StatusOK, response.Code)
				response = popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/history/%d", read.Id), tokens[1], nil)
				require.Equal(t, http.StatusOK, response.Code)
				assert.Contains(t, response.Body.String(), string(legacy.Content))
				assert.NotContains(t, response.Body.String(), string(changed.Content))
				archived := legacy
				archived.Id, archived.Title, archived.Content = 0, "Legacy deleted title", "legacy-deleted-body"
				archived.DeletedAt = gorm.DeletedAt{Time: time.Unix(1700259300, 0), Valid: true}
				require.NoError(t, db.Create(&archived).Error)
				matched := model.PopupNoticeRead{NoticeId: archived.Id, Revision: archived.Revision, UserId: owner.Id, ReadAt: archived.PublishedAt}
				unrecoverable := model.PopupNoticeRead{NoticeId: archived.Id, Revision: archived.Revision - 1, UserId: owner.Id, ReadAt: archived.PublishedAt - 1}
				require.NoError(t, db.Create(&matched).Error)
				require.NoError(t, db.Create(&unrecoverable).Error)
				for range 2 {
					require.NoError(t, model.BackfillPopupNoticeRevisions())
				}
				response = popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/history/%d", matched.Id), tokens[1], nil)
				require.Equal(t, http.StatusOK, response.Code)
				assert.Contains(t, response.Body.String(), string(archived.Content))
				assert.Equal(t, http.StatusNotFound, popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/history/%d", unrecoverable.Id), tokens[1], nil).Code)
				var snapshotCount int64
				require.NoError(t, db.Model(&model.PopupNoticeRevision{}).Where("notice_id = ?", archived.Id).Count(&snapshotCount).Error)
				assert.EqualValues(t, 1, snapshotCount)
				active := model.PopupNotice{Title: "Legacy active", Content: "legacy-ack-fallback", Format: "text", Audience: "user", TargetUserId: owner.Id, Status: "published", Frequency: "once", Revision: 1, PublishedAt: time.Now().Unix() - 100}
				require.NoError(t, db.Create(&active).Error)
				require.Equal(t, http.StatusOK, popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/%d/read", active.Id), tokens[1], map[string]any{"revision": active.Revision}).Code)
				var acknowledged model.PopupNoticeRead
				require.NoError(t, db.Where("notice_id = ? AND user_id = ?", active.Id, owner.Id).First(&acknowledged).Error)
				response = popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/history/%d", acknowledged.Id), tokens[1], nil)
				require.Equal(t, http.StatusOK, response.Code)
				assert.Contains(t, response.Body.String(), string(active.Content))
			})
			t.Run("history keyset cursor orders equal read times by receipt id without skipping", func(t *testing.T) {
				readAt := time.Now().Unix() + 30*86400
				ids := make([]int, 25)
				for i := range ids {
					item := model.PopupNotice{Title: fmt.Sprintf("History cursor %d", i), Content: "history-cursor-body", Format: "text", Audience: "user", TargetUserId: owner.Id, Status: "published", Frequency: "once"}
					require.NoError(t, model.CreatePopupNotice(&item, users[0].Id))
					require.NoError(t, model.ReadPopupNotice(owner.Id, item.Id, item.Revision, readAt))
					var read model.PopupNoticeRead
					require.NoError(t, db.Where("notice_id = ? AND user_id = ?", item.Id, owner.Id).First(&read).Error)
					ids[i] = read.Id
				}
				response := popupNoticeTestRequest(t, router, "GET", "/history", tokens[1], nil)
				require.Equal(t, http.StatusOK, response.Code)
				var result struct {
					Data []model.PopupNoticeHistory
				}
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				require.Len(t, result.Data, 20)
				for i := range result.Data {
					assert.Equal(t, ids[24-i], result.Data[i].Id)
					assert.Equal(t, readAt, result.Data[i].ReadAt)
				}
				last := result.Data[len(result.Data)-1]
				response = popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/history?after_read_at=%d&after_id=%d", last.ReadAt, last.Id), tokens[1], nil)
				require.Equal(t, http.StatusOK, response.Code)
				require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
				require.GreaterOrEqual(t, len(result.Data), 5)
				for i := range 5 {
					assert.Equal(t, ids[4-i], result.Data[i].Id)
				}
				for _, query := range []string{"after_id=1", "after_read_at=1", "after_id=0&after_read_at=1", "after_id=1&after_read_at=-1", "after_id=bad&after_read_at=1"} {
					assert.Equal(t, http.StatusBadRequest, popupNoticeTestRequest(t, router, "GET", "/history?"+query, tokens[1], nil).Code)
				}
			})
			t.Run("cursor continues after acknowledgements remove the first page", func(t *testing.T) {
				for i := range 25 {
					item := model.PopupNotice{Title: fmt.Sprintf("Cursor %d", i), Content: "cursor-private", Audience: "user", TargetUserId: owner.Id, Status: "published", Frequency: "once", Format: "text", Priority: 20}
					require.NoError(t, model.CreatePopupNotice(&item, users[0].Id))
				}
				first := popupNoticeTestRequest(t, router, "GET", "/self", tokens[1], nil)
				var result struct{ Data []popupNoticeDelivery }
				require.NoError(t, common.Unmarshal(first.Body.Bytes(), &result))
				require.Len(t, result.Data, 20)
				last := result.Data[len(result.Data)-1]
				for _, item := range result.Data {
					require.Equal(t, 200, popupNoticeTestRequest(t, router, "POST", fmt.Sprintf("/%d/read", item.Id), tokens[1], map[string]any{"revision": item.Revision}).Code)
				}
				second := popupNoticeTestRequest(t, router, "GET", fmt.Sprintf("/self?after_id=%d&after_priority=%d", last.Id, last.Priority), tokens[1], nil)
				require.NoError(t, common.Unmarshal(second.Body.Bytes(), &result))
				count := 0
				for _, item := range result.Data {
					if item.Priority == 20 {
						count++
					}
				}
				assert.Equal(t, 5, count, "keyset cursor must not skip remaining messages when preceding receipts shrink the feed")
				assert.Equal(t, 400, popupNoticeTestRequest(t, router, "GET", "/guest?after_id=0&after_priority=0", "", nil).Code)
			})
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.PopupNotice{}, &model.PopupNoticeRead{}, &model.PopupNoticeRevision{}))
				require.NoError(t, model.BackfillPopupNoticeRevisions())
			}
		})
	}
}
