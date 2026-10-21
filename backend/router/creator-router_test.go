package router

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestCreatorCenter(t *testing.T) {
	t.Setenv("CREATOR_CENTER_DIR", t.TempDir())
	dialect := gorm.Dialector(sqlite.Open(":memory:"))
	dbType := common.DatabaseTypeSQLite
	if dsn := os.Getenv("CREATOR_GRANT_MYSQL_DSN"); dsn != "" {
		dialect = mysql.Open(dsn)
		dbType = common.DatabaseTypeMySQL
	}
	if dsn := os.Getenv("CREATOR_GRANT_POSTGRES_DSN"); dsn != "" {
		dialect = postgres.Open(dsn)
		dbType = common.DatabaseTypePostgreSQL
	}
	db, err := gorm.Open(dialect, &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.CommunityAccessConfig{}, &model.User{}, &model.TopUp{}, &model.Redemption{}, &model.RedemptionClaim{}, &model.Log{}, &model.AuditLog{}, &model.CreatorHomeCard{}, &model.CreatorHomeOrder{}, &model.CreatorHomeConfig{}, &model.CreatorHomeAuthor{}))
	previousDB, previousLog, previousRedis, previousSecure, previousTrusted := model.DB, model.LOG_DB, common.RedisEnabled, common.SessionCookieSecure, common.SessionCookieTrustedURLs
	mainType, logType := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB, common.RedisEnabled, common.SessionCookieSecure = db, db, false, true
	common.SessionCookieTrustedURLs = []string{"https://skymoni.com"}
	common.SetDatabaseTypes(dbType, dbType)
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled, common.SessionCookieSecure, common.SessionCookieTrustedURLs = previousDB, previousLog, previousRedis, previousSecure, previousTrusted
		common.SetDatabaseTypes(mainType, logType)
		connection, e := db.DB()
		require.NoError(t, e)
		require.NoError(t, connection.Close())
	})
	tokens := []string{"creator-root-test", "creator-one-test", "creator-two-test", "creator-unpaid-test", "creator-delegated-admin-test"}
	for i := range 5 {
		role := common.RoleCommonUser
		if i == 4 {
			role = common.RoleAdminUser
		}
		if i == 0 {
			role = common.RoleRootUser
		}
		user := model.User{Id: 91000 + i, Username: fmt.Sprintf("creator-user-%d", i), DisplayName: "Creator", Role: role, Status: common.UserStatusEnabled, AccessToken: &tokens[i], AffCode: fmt.Sprintf("creator-code-%d", i), AuthVersion: 1}
		require.NoError(t, db.Create(&user).Error)
	}
	engine := gin.New()
	engine.Use(middleware.RequestId())
	registerCreatorRoutes(engine.Group("/api"))
	engine.GET("/api/user/", middleware.AdminAuth(), controller.GetAllUsers)
	engine.GET("/api/user/search", middleware.AdminAuth(), controller.SearchUsers)
	request := func(method, path, token, origin string, data any) *httptest.ResponseRecorder {
		var body io.Reader
		if data != nil {
			raw, e := common.Marshal(data)
			require.NoError(t, e)
			body = bytes.NewReader(raw)
		}
		req := httptest.NewRequest(method, "https://skymoni.com/api/creators"+path, body)
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
	apply := map[string]any{"name": "Test creator", "bio": "I build useful things.", "direction": "software", "accepted": true, "termsVersion": service.CreatorTermsVersion}
	t.Run("visitor cannot read private workspace or mutate and cross origin writes are rejected", func(t *testing.T) {
		assert.Equal(t, 401, request("GET", "/me", "", "", nil).Code)
		assert.Equal(t, 401, request("POST", "/me/apply", "", "https://skymoni.com", apply).Code)
		assert.Equal(t, 403, request("POST", "/me/apply", tokens[1], "https://evil.example", apply).Code)
		assert.Equal(t, 403, request("GET", "/admin", tokens[1], "", nil).Code)
	})
	t.Run("unpaid member cannot activate even with forged client eligibility", func(t *testing.T) {
		assert.Equal(t, 403, request("POST", "/me/apply", tokens[3], "https://skymoni.com", apply).Code)
		assert.Contains(t, request("GET", "/me", tokens[3], "", nil).Body.String(), `"mode":"member"`)
	})
	t.Run("root grants eligibility but never accepts terms or changes payment data", func(t *testing.T) {
		path := "/admin/users/91003/grant"
		assert.Equal(t, 401, request("POST", path, "", "https://skymoni.com", nil).Code)
		assert.Equal(t, 403, request("POST", path, tokens[3], "https://skymoni.com", nil).Code)
		assert.Equal(t, 403, request("POST", path, tokens[4], "https://skymoni.com", nil).Code)
		assert.Equal(t, 403, request("POST", path, tokens[0], "https://evil.example", nil).Code)
		assert.Equal(t, 404, request("POST", "/admin/users/99999/grant", tokens[0], "https://skymoni.com", nil).Code)
		assert.Equal(t, 400, request("POST", "/admin/users/invalid/grant", tokens[0], "https://skymoni.com", nil).Code)
		for i := range 2 {
			rec := request("POST", path, tokens[0], "https://skymoni.com", map[string]any{"accepted": true})
			require.Equal(t, 200, rec.Code, rec.Body.String())
			assert.Contains(t, rec.Body.String(), `"status":"authorized"`, "retry %d", i)
		}
		var member service.CreatorMember
		require.NoError(t, service.WithCreatorCatalog(false, func(c *service.CreatorCatalog) error { member = c.Members[91003]; return nil }))
		assert.Zero(t, member.AcceptedAt)
		assert.Empty(t, member.TermsVersion)
		assert.Equal(t, 91000, member.GrantedBy)
		assert.Positive(t, member.GrantedAt)
		var audits int64
		require.NoError(t, db.Model(&model.AuditLog{}).Where("action = ?", "creator.admin.grant").Count(&audits).Error)
		assert.EqualValues(t, 1, audits)
		assert.Contains(t, request("GET", "/me", tokens[3], "", nil).Body.String(), `"mode":"eligible"`)
		assert.Contains(t, request("GET", "/me", tokens[3], "", nil).Body.String(), `"manuallyGranted":true`)
		assert.Equal(t, 403, request("PUT", "/me/profile", tokens[3], "https://skymoni.com", map[string]any{"profile": service.CreatorProfile{Name: "Before consent", Handle: "no-consent"}}).Code)
		wrong := map[string]any{"name": "Manual creator", "bio": "My projects", "direction": "software", "accepted": false, "termsVersion": service.CreatorTermsVersion}
		assert.Equal(t, 400, request("POST", "/me/apply", tokens[3], "https://skymoni.com", wrong).Code)
		wrong["accepted"], wrong["termsVersion"] = true, "old-terms"
		assert.Equal(t, 400, request("POST", "/me/apply", tokens[3], "https://skymoni.com", wrong).Code)
		wrong["termsVersion"] = service.CreatorTermsVersion
		rec := request("POST", "/me/apply", tokens[3], "https://skymoni.com", wrong)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		assert.Contains(t, rec.Body.String(), `"mode":"creator"`)
		assert.Equal(t, 200, request("POST", path, tokens[0], "https://skymoni.com", nil).Code)
		eligible, e := model.HasCreatorRecharge(91003)
		require.NoError(t, e)
		assert.False(t, eligible)
		var user model.User
		require.NoError(t, db.First(&user, 91003).Error)
		assert.Zero(t, user.Quota)
		require.NoError(t, service.WithCreatorCatalog(false, func(c *service.CreatorCatalog) error {
			assert.Equal(t, member.GrantedAt, c.Members[91003].GrantedAt)
			assert.Equal(t, "Manual creator", c.Members[91003].Profile.Name)
			assert.Positive(t, c.Members[91003].AcceptedAt)
			return nil
		}))
	})
	t.Run("list and search return creator state; disabled deleted and suspended accounts cannot be granted", func(t *testing.T) {
		for i := 5; i < 8; i++ {
			u := model.User{Id: 91000 + i, Username: fmt.Sprintf("creator-user-%d", i), Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: fmt.Sprintf("grant-test-%d", i)}
			if i == 5 {
				u.Status = common.UserStatusDisabled
			}
			require.NoError(t, db.Create(&u).Error)
			if i == 6 {
				require.NoError(t, db.Delete(&u).Error)
			}
		}
		_, _, e := service.GrantCreator(91007, 91000)
		require.NoError(t, e)
		require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
			m := c.Members[91007]
			m.Suspended = true
			c.Members[91007] = m
			return nil
		}))
		for _, tc := range []struct{ id, code int }{{91005, 403}, {91006, 404}, {91007, 403}} {
			assert.Equal(t, tc.code, request("POST", fmt.Sprintf("/admin/users/%d/grant", tc.id), tokens[0], "https://skymoni.com", nil).Code)
		}
		for _, path := range []string{"/api/user/?page_size=20", "/api/user/search?keyword=creator-user-3"} {
			req := httptest.NewRequest("GET", "https://skymoni.com"+path, nil)
			req.Header.Set("Authorization", "Bearer "+tokens[0])
			rec := httptest.NewRecorder()
			engine.ServeHTTP(rec, req)
			require.Equal(t, 200, rec.Code, rec.Body.String())
			assert.Contains(t, rec.Body.String(), `"creator_status":"active"`)
			assert.NotContains(t, rec.Body.String(), "creator-unpaid-test")
			assert.NotContains(t, rec.Body.String(), `"grantedBy"`)
		}
	})
	// Exercise the actual credit redemption path, without any online order.
	for _, uid := range []int{91001, 91002} {
		code := &model.Redemption{Key: fmt.Sprintf("creator-credit-%d", uid), Name: "Activity credit", Quota: 1, Status: common.RedemptionCodeStatusEnabled, Reusable: uid == 91002}
		require.NoError(t, code.Insert())
		_, err := model.Redeem(code.Key, uid)
		require.NoError(t, err)
		// Code cleanup and spending must not remove qualification.
		require.NoError(t, code.Delete())
		require.NoError(t, db.Model(&model.User{}).Where("id = ?", uid).Update("quota", 0).Error)
	}
	t.Run("credit-code member explicitly accepts current terms before activation", func(t *testing.T) {
		assert.Contains(t, request("GET", "/me", tokens[1], "", nil).Body.String(), `"mode":"eligible"`)
		rejected := map[string]any{"name": "Creator", "bio": "A biography", "direction": "software", "accepted": false, "termsVersion": service.CreatorTermsVersion}
		assert.Equal(t, 400, request("POST", "/me/apply", tokens[1], "https://skymoni.com", rejected).Code)
		for _, token := range tokens[1:3] {
			assert.Equal(t, 200, request("POST", "/me/apply", token, "https://skymoni.com", apply).Code)
		}
	})
	work := service.CreatorWork{ID: "creator-work-test", Title: "A useful tool", Summary: "A real public introduction.", Category: "software", Style: "notes", Status: "draft", Images: []string{}}
	saveWork := func(w service.CreatorWork, token string) *httptest.ResponseRecorder {
		return request("PUT", "/me/works/"+w.ID, token, "https://skymoni.com", w)
	}
	parseWork := func(rec *httptest.ResponseRecorder) service.CreatorWork {
		var result struct {
			Data service.CreatorWork `json:"data"`
		}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &result))
		return result.Data
	}
	t.Run("ownership is set by server and drafts are never public", func(t *testing.T) {
		work.OwnerID = 91002
		work.Author = "Forged author"
		response := saveWork(work, tokens[1])
		require.Equal(t, 200, response.Code, response.Body.String())
		work = parseWork(response)
		assert.Equal(t, 91001, work.OwnerID)
		assert.Equal(t, "Test creator", work.Author)
		assert.NotContains(t, request("GET", "/public", "", "", nil).Body.String(), work.ID)
		assert.Equal(t, 404, request("GET", "/public/"+work.ID, "", "", nil).Code)
		assert.Equal(t, 403, saveWork(work, tokens[2]).Code)
		assert.NotContains(t, request("GET", "/me", tokens[2], "", nil).Body.String(), work.ID)
	})
	t.Run("stale revision and script links cannot replace saved content", func(t *testing.T) {
		bad := work
		bad.Revision = "outdated"
		assert.Equal(t, 409, saveWork(bad, tokens[1]).Code)
		bad = work
		bad.URL = "javascript:alert(1)"
		assert.Equal(t, 400, saveWork(bad, tokens[1]).Code)
		bad = work
		bad.Status = "published"
		assert.Equal(t, 400, saveWork(bad, tokens[1]).Code)
	})
	var file service.CreatorFile
	t.Run("uploads are private and foreign attachment references are rejected", func(t *testing.T) {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, e := writer.CreateFormFile("file", "workflow.txt")
		require.NoError(t, e)
		_, e = part.Write([]byte("creator-private-file"))
		require.NoError(t, e)
		require.NoError(t, writer.Close())
		req := httptest.NewRequest("POST", "https://skymoni.com/api/creators/me/files", &body)
		req.Header.Set("Authorization", "Bearer "+tokens[1])
		req.Header.Set("Origin", "https://skymoni.com")
		req.Header.Set("Content-Type", writer.FormDataContentType())
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		var response struct {
			Data service.CreatorFile `json:"data"`
		}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &response))
		file = response.Data
		assert.Equal(t, 404, request("GET", "/files/"+file.ID, "", "", nil).Code)
		assert.Equal(t, 404, request("GET", "/me/files/"+file.ID, tokens[2], "", nil).Code)
		assert.Equal(t, "creator-private-file", request("GET", "/me/files/"+file.ID, tokens[1], "", nil).Body.String())
		foreign := work
		foreign.ID = "foreign-work"
		foreign.Revision = ""
		foreign.Attachment = &file
		assert.Equal(t, 403, saveWork(foreign, tokens[2]).Code)
		_, e = service.StoreCreatorFile(91001, "../bad.zip", strings.NewReader("bad"))
		assert.ErrorIs(t, e, service.ErrCreatorInvalid)
		_, e = service.StoreCreatorFile(91001, "active.html", strings.NewReader("<script>"))
		assert.ErrorIs(t, e, service.ErrCreatorInvalid)
	})
	t.Run("only root can approve and approved attachment is available until unpublished", func(t *testing.T) {
		work.Status = "review"
		work.Attachment = &file
		rec := saveWork(work, tokens[1])
		require.Equal(t, 200, rec.Code, rec.Body.String())
		work = parseWork(rec)
		review := map[string]any{"revision": work.Revision, "decision": "approve", "note": "Reviewed"}
		assert.Equal(t, 403, request("POST", "/admin/work/"+work.ID, tokens[1], "https://skymoni.com", review).Code)
		rec = request("POST", "/admin/work/"+work.ID, tokens[0], "https://skymoni.com", review)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		assert.Contains(t, request("GET", "/public", "", "", nil).Body.String(), work.ID)
		rec = request("GET", "/files/"+file.ID, "", "", nil)
		assert.Equal(t, 200, rec.Code)
		assert.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
		assert.Contains(t, rec.Header().Get("Content-Disposition"), "attachment")
		err = service.WithCreatorCatalog(false, func(c *service.CreatorCatalog) error { work = c.Works[0]; return nil })
		require.NoError(t, err)
		work.Status = "draft"
		rec = saveWork(work, tokens[1])
		require.Equal(t, 200, rec.Code)
		work = parseWork(rec)
		assert.Equal(t, 404, request("GET", "/files/"+file.ID, "", "", nil).Code)
	})
	t.Run("software submissions require own software and cannot publish themselves", func(t *testing.T) {
		release := service.CreatorRelease{ID: "version-test", ProjectID: work.ID, Version: "1.0.0", Platform: "Windows", DownloadURL: "https://example.com/app.zip", Notes: "A meaningful release note.", Provenance: "original", Status: "review"}
		path := "/me/releases/" + release.ID
		assert.Equal(t, 403, request("PUT", path, tokens[2], "https://skymoni.com", release).Code)
		assert.Equal(t, 200, request("PUT", path, tokens[1], "https://skymoni.com", release).Code)
		release.ID = "forged-version"
		release.Status = "published"
		assert.Equal(t, 400, request("PUT", "/me/releases/"+release.ID, tokens[1], "https://skymoni.com", release).Code)
	})
	t.Run("deleting own project is revision checked and frees its references", func(t *testing.T) {
		assert.Equal(t, 404, request("DELETE", "/me/works/"+work.ID, tokens[2], "https://skymoni.com", map[string]string{"revision": work.Revision}).Code)
		assert.Equal(t, 200, request("DELETE", "/me/works/"+work.ID, tokens[1], "https://skymoni.com", map[string]string{"revision": work.Revision}).Code)
		assert.Equal(t, 200, request("DELETE", "/me/files/"+file.ID, tokens[1], "https://skymoni.com", nil).Code)
	})
}

// Uses disposable databases only. The production query is tested against real
// engines without changing production user data or migrations.
func TestCreatorEligibilityDatabaseMatrix(t *testing.T) {
	dialects := map[string]gorm.Dialector{"sqlite": sqlite.Open(":memory:")}
	if dsn := os.Getenv("CREATOR_TEST_MYSQL_DSN"); dsn != "" {
		require.Contains(t, dsn, "creator_verify_")
		dialects["mysql"] = mysql.Open(dsn)
	}
	if dsn := os.Getenv("CREATOR_TEST_POSTGRES_DSN"); dsn != "" {
		require.Contains(t, dsn, "creator_verify_")
		dialects["postgres"] = postgres.Open(dsn)
	}
	for name, dialect := range dialects {
		t.Run(name, func(t *testing.T) {
			db, e := gorm.Open(dialect, &gorm.Config{})
			require.NoError(t, e)
			old := model.DB
			model.DB = db
			t.Cleanup(func() { model.DB = old; sqlDB, e := db.DB(); require.NoError(t, e); require.NoError(t, sqlDB.Close()) })
			require.NoError(t, db.AutoMigrate(&model.TopUp{}, &model.Redemption{}, &model.RedemptionClaim{}))
			require.NoError(t, db.AutoMigrate(&model.TopUp{}, &model.Redemption{}, &model.RedemptionClaim{}))
			for i, tc := range []struct {
				name, status, provider string
				money                  float64
				completed              int64
				expected               bool
			}{
				{"unpaid", common.TopUpStatusPending, model.PaymentProviderEpay, 10, 0, false},
				{"gift", common.TopUpStatusSuccess, "", 0, 1, false},
				{"balance conversion", common.TopUpStatusSuccess, model.PaymentProviderBalance, 10, 1, false},
				{"failed payment", common.TopUpStatusFailed, model.PaymentProviderStripe, 10, 1, false},
				{"legacy paid history", common.TopUpStatusSuccess, model.PaymentProviderEpay, 1, 1, true},
				{"stripe paid", common.TopUpStatusSuccess, model.PaymentProviderStripe, 1, 1, true},
			} {
				t.Run(tc.name, func(t *testing.T) {
					uid := 92000 + i
					row := model.TopUp{UserId: uid, TradeNo: fmt.Sprintf("matrix-%d", uid), Money: tc.money, Status: tc.status, PaymentProvider: tc.provider, CompleteTime: tc.completed, CreateTime: 1}
					require.NoError(t, db.Create(&row).Error)
					ok, e := model.HasCreatorRecharge(uid)
					require.NoError(t, e)
					assert.Equal(t, tc.expected, ok)
				})
			}
			for i, tc := range []struct {
				name     string
				status   int
				quota    int
				redeemed int64
				owner    bool
				deleted  bool
				expected bool
			}{
				{"historical one-time", common.RedemptionCodeStatusUsed, 1, 1, true, false, true},
				{"deleted expired credit", common.RedemptionCodeStatusUsed, 1, 1, true, true, true},
				{"unused code", common.RedemptionCodeStatusEnabled, 1, 0, true, false, false},
				{"disabled unused code", common.RedemptionCodeStatusDisabled, 1, 0, true, false, false},
				{"other account redeemed", common.RedemptionCodeStatusUsed, 1, 1, false, false, false},
				{"no completed redemption", common.RedemptionCodeStatusUsed, 1, 0, true, false, false},
				{"zero credit", common.RedemptionCodeStatusUsed, 0, 1, true, false, false},
			} {
				t.Run(tc.name, func(t *testing.T) {
					uid := 93000 + i
					used := uid
					if !tc.owner {
						used += 1000
					}
					row := model.Redemption{Key: fmt.Sprintf("matrix-code-%d", uid), Status: tc.status, Quota: tc.quota, UsedUserId: used, RedeemedTime: tc.redeemed, ExpiredTime: 1}
					require.NoError(t, db.Create(&row).Error)
					if tc.quota == 0 {
						require.NoError(t, db.Model(&row).Update("quota", 0).Error)
					}
					if tc.deleted {
						require.NoError(t, db.Delete(&row).Error)
					}
					ok, e := model.HasCreatorRecharge(uid)
					require.NoError(t, e)
					assert.Equal(t, tc.expected, ok)
				})
			}
			t.Run("reusable claim survives source deletion", func(t *testing.T) {
				require.NoError(t, db.Create(&model.RedemptionClaim{RedemptionId: 99999, UserId: 94000, Quota: 1, CreatedTime: 1}).Error)
				ok, e := model.HasCreatorRecharge(94000)
				require.NoError(t, e)
				assert.True(t, ok)
			})
			ok, e := model.HasCreatorRecharge(99999)
			require.NoError(t, e)
			assert.False(t, ok)
		})
	}
}
