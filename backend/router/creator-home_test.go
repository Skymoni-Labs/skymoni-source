package router

import (
	"bytes"
	"encoding/base64"
"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

const homeTestCreator = "local-creator-home-test-token"
const homeTestAdmin = "local-admin-home-test-token"

func setupCreatorHome(t *testing.T, dir string) (*gin.Engine, *gorm.DB) {
	t.Helper()
	t.Setenv("CREATOR_CENTER_DIR", filepath.Join(dir, "catalog"))
	db, err := gorm.Open(sqlite.Open(filepath.Join(dir, "wallet.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	connection, err := db.DB()
	require.NoError(t, err)
	connection.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}, &model.AuditLog{}, &model.CreatorHomeCard{}, &model.CreatorHomeOrder{}, &model.CreatorHomeConfig{}, &model.CreatorHomeAuthor{}))
	oldDB, oldLog, oldRedis, oldBatch := model.DB, model.LOG_DB, common.RedisEnabled, common.BatchUpdateEnabled
	mainType, logType := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB, common.RedisEnabled, common.BatchUpdateEnabled = db, db, false, false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled, common.BatchUpdateEnabled = oldDB, oldLog, oldRedis, oldBatch
		common.SetDatabaseTypes(mainType, logType)
		_ = connection.Close()
	})
	for i, token := range []string{homeTestAdmin, homeTestCreator, "local-other-home-test-token"} {
		role := common.RoleCommonUser
		if i == 0 {
			role = common.RoleRootUser
		}
		user := model.User{Id: 92000 + i, Username: fmt.Sprintf("home-preview-%d", i), DisplayName: "Home preview", Role: role, Status: common.UserStatusEnabled, AccessToken: &token, AffCode: fmt.Sprintf("home-test-%d", i), Quota: 20000000, AuthVersion: 1}
		require.NoError(t, db.Clauses(clause.OnConflict{DoNothing: true}).Create(&user).Error)
	}
	for i, name := range []string{"Mio", "Lin", "Yuki", "Nami"} {
		require.NoError(t, service.ActivateCreator(92001+i, service.CreatorProfile{Name: name, Handle: fmt.Sprintf("home-creator-%d", i)}, "website", service.CreatorTermsVersion, true))
	}
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		if len(c.Works) == 0 {
			c.Works = []service.CreatorWork{{ID: "home-demo-website", OwnerID: 92001, Title: "我的个人网站", Author: "Mio", Summary: "记录生活、设计与创作的一片小天地。", Category: "website", Style: "horizon", Status: "published", Revision: "work-initial"}, {ID: "home-demo-tool", OwnerID: 92001, Title: "云间小工具", Author: "Mio", Summary: "让日常轻一点的小工具。", Category: "software", Style: "cloud", Status: "published", Revision: "work-initial"}}
		}
		return nil
	}))
	engine := gin.New()
	engine.Use(gin.Recovery(), middleware.RequestId())
	registerCreatorRoutes(engine.Group("/api"))
	return engine, db
}
func homeImage(w, h int) string {
	im := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			im.SetRGBA(x, y, color.RGBA{uint8(180 + x%40), uint8(200 + y%40), 240, 255})
		}
	}
	var b bytes.Buffer
	_ = png.Encode(&b, im)
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())
}
func homeRequest(t *testing.T, e *gin.Engine, method, path, token string, data any) *httptest.ResponseRecorder {
	t.Helper()
	var body io.Reader
	if data != nil {
		raw, err := common.Marshal(data)
		require.NoError(t, err)
		body = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, "http://localhost/api/creators"+path, body)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://localhost")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}
func homeDisplayedWorks(t *testing.T, e *gin.Engine) string {
 t.Helper()
 response:=homeRequest(t,e,"GET","/home","",nil)
 require.Equal(t,200,response.Code)
 var body struct {Data struct {Works json.RawMessage `json:"works"`} `json:"data"`}
 require.NoError(t,json.Unmarshal(response.Body.Bytes(),&body))
 return string(body.Data.Works)
}

func TestCreatorHomePaymentAndControls(t *testing.T) {
	e, db := setupCreatorHome(t, t.TempDir())
	image := homeImage(900, 1200)
	card := func() model.CreatorHomeCard {
		var c model.CreatorHomeCard
		require.NoError(t, db.First(&c, "work_id = ?", "home-demo-website").Error)
		return c
	}
	purchase := func(id, plan, revision string) *httptest.ResponseRecorder {
		return homeRequest(t, e, "POST", "/me/home/cards/home-demo-website/purchase", homeTestCreator, map[string]any{"checkoutId": id, "plan": plan, "revision": revision, "confirm": true})
	}
	assert.Equal(t, 401, homeRequest(t, e, "GET", "/me/home", "", nil).Code)
	assert.Equal(t, 403, homeRequest(t, e, "GET", "/admin/home", homeTestCreator, nil).Code)
	assert.Equal(t, 400, homeRequest(t, e, "PUT", "/me/home/cards/home-demo-website", homeTestCreator, map[string]string{"image": homeImage(600, 600)}).Code)
	assert.Equal(t, 400, homeRequest(t, e, "PUT", "/me/home/cards/home-demo-website", homeTestCreator, map[string]string{"image": "data:image/jpeg;base64," + image[len("data:image/png;base64,"):]}).Code)
	assert.Equal(t, 400, homeRequest(t, e, "PUT", "/me/home/cards/home-demo-website", "local-other-home-test-token", map[string]string{"image": image}).Code)
	require.Equal(t, 200, homeRequest(t, e, "PUT", "/me/home/cards/home-demo-website", homeTestCreator, map[string]string{"image": image}).Code)
	assert.Equal(t, 400, purchase("checkout-unapproved-0001", "year", card().Revision).Code)
	assert.Equal(t, 404, homeRequest(t, e, "GET", "/home/posters/home-demo-website", "", nil).Code)
	approve := func() {
		c := card()
		r := homeRequest(t, e, "PUT", "/admin/home/cards/home-demo-website", homeTestAdmin, map[string]any{"decision": "approve", "revision": c.Revision})
		require.Equal(t, 200, r.Code, r.Body.String())
	}
	approve()
	before := card().Revision
	r := purchase("checkout-valid-year-0001", "year", before)
	require.Equal(t, 200, r.Code, r.Body.String())
	c := card()
	assert.False(t, c.Permanent)
	assert.InDelta(t, time.Now().UTC().AddDate(1, 0, 0).Unix(), c.ExpiresAt, 3)
	var user model.User
	require.NoError(t, db.First(&user, 92001).Error)
	assert.Equal(t, 17500000, user.Quota)
	assert.Equal(t, 200, purchase("checkout-valid-year-0001", "year", before).Code)
	assert.Equal(t, 409, purchase("checkout-another-key-0001", "year", before).Code)
	assert.Equal(t, 400, purchase("checkout-fake-plan-0001", "free", c.Revision).Code)
	assert.Equal(t, 409, purchase("checkout-valid-year-0001", "permanent", c.Revision).Code)
	assert.Equal(t, 200, homeRequest(t, e, "GET", "/home/posters/home-demo-website", "", nil).Code)
	public := homeRequest(t, e, "GET", "/home", "", nil).Body.String()
	assert.Contains(t, public, "home-demo-website")
	assert.NotContains(t, public, image)
	assert.NotContains(t, public, "checkoutId")
	// A failed ledger insert rolls the wallet and entitlement back together.
	require.NoError(t, db.Exec("CREATE TRIGGER reject_home_order BEFORE INSERT ON creator_home_orders BEGIN SELECT RAISE(ABORT, 'test rollback'); END").Error)
	assert.Equal(t, 500, purchase("checkout-rollback-0001", "permanent", c.Revision).Code)
	require.NoError(t, db.First(&user, 92001).Error)
	assert.Equal(t, 17500000, user.Quota)
	assert.False(t, card().Permanent)
	require.NoError(t, db.Exec("DROP TRIGGER reject_home_order").Error)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", 92001).Update("quota", 0).Error)
	assert.Equal(t, 402, purchase("checkout-no-balance-0001", "permanent", c.Revision).Code)
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", 92001).Update("quota", 17500000).Error)
	assert.Equal(t, 200, purchase("checkout-permanent-0001", "permanent", c.Revision).Code)
	assert.True(t, card().Permanent)
	assert.Zero(t, card().ExpiresAt)
	assert.Equal(t, 400, purchase("checkout-permanent-again", "year", card().Revision).Code)
	// Editing cannot overwrite the moderated bytes or stop a paid old design.
	require.Equal(t, 200, homeRequest(t, e, "PUT", "/me/home/cards/home-demo-website", homeTestCreator, map[string]string{"image": homeImage(600, 800), "revision": card().Revision}).Code)
	assert.Equal(t, image, card().ApprovedImage)
	assert.Equal(t, 200, homeRequest(t, e, "GET", "/home/posters/home-demo-website", "", nil).Code)
	c = card()
	assert.Equal(t, 200, homeRequest(t, e, "PUT", "/admin/home/cards/home-demo-website", homeTestAdmin, map[string]any{"decision": "display", "revision": c.Revision, "hidden": true}).Code)
	assert.Equal(t, 404, homeRequest(t, e, "GET", "/home/posters/home-demo-website", "", nil).Code)
	assert.NotContains(t, homeDisplayedWorks(t,e), "home-demo-website")
	// Automatic author inclusion is independent of any published or paid work.
	assert.Contains(t, homeRequest(t, e, "GET", "/home", "", nil).Body.String(), "Yuki")
	cfg, err := model.GetCreatorHomeConfig(db)
	require.NoError(t, err)
	cfg.AutoAddCreators = false
	require.NoError(t, service.SaveCreatorHomeConfig(cfg))
	require.NoError(t, service.ActivateCreator(92999, service.CreatorProfile{Name: "New creator", Handle: "new-home-creator"}, "design", service.CreatorTermsVersion, true))
	assert.NotContains(t, homeRequest(t, e, "GET", "/home", "", nil).Body.String(), "New creator")
	assert.Contains(t, homeRequest(t, e, "GET", "/home", "", nil).Body.String(), "Yuki")
	assert.Equal(t, 200, homeRequest(t, e, "PUT", "/admin/home/authors/92999", homeTestAdmin, map[string]any{"visible": true, "position": 1}).Code)
	assert.Contains(t, homeRequest(t, e, "GET", "/home", "", nil).Body.String(), "New creator")
	assert.ErrorIs(t, service.SaveCreatorHomeConfig(cfg), model.ErrCreatorHomeConflict)
	// Creators can edit only their own avatar, never admin visibility or order.
	require.NoError(t, service.SaveCreatorHomeAuthor(92001, model.CreatorHomeAuthor{Visible: false, Position: 23}, true))
	avatar := homeImage(128, 128)
	assert.Equal(t, 200, homeRequest(t, e, "PUT", "/me/home/avatar", homeTestCreator, map[string]any{"avatar": avatar, "visible": true, "position": 0, "userId": 92999}).Code)
	var author model.CreatorHomeAuthor
	require.NoError(t, db.First(&author, 92001).Error)
	assert.False(t, author.Visible)
	assert.Equal(t, 23, author.Position)
	assert.Equal(t, avatar, author.Avatar)
	// Suspension and unpublished works never continue to leak paid posters.
	require.NoError(t, service.WithCreatorCatalog(true, func(c *service.CreatorCatalog) error {
		m := c.Members[92001]
		m.Suspended = true
		c.Members[92001] = m
		return nil
	}))
	assert.Equal(t, 403, homeRequest(t, e, "GET", "/me/home", homeTestCreator, nil).Code)
}

func TestCreatorHomeRenewalExpiryAndConcurrentRetry(t *testing.T) {
	e, db := setupCreatorHome(t, t.TempDir())
	poster := homeImage(450, 600)
	r := homeRequest(t, e, "PUT", "/me/home/cards/home-demo-website", homeTestCreator, map[string]string{"image": poster})
	require.Equal(t, 200, r.Code, r.Body.String())
	card := func() model.CreatorHomeCard {
		var c model.CreatorHomeCard
		require.NoError(t, db.First(&c, "work_id = ?", "home-demo-website").Error)
		return c
	}
	c := card()
	assert.Equal(t, 403, homeRequest(t, e, "PUT", "/admin/home/cards/home-demo-website", homeTestCreator, map[string]any{"decision": "approve", "revision": c.Revision}).Code)
	require.NoError(t, service.ReviewCreatorHome(c.WorkID, c.Revision, "approve", "", false, 0))
	c = card()
	assert.Equal(t, 400, homeRequest(t, e, "POST", "/me/home/cards/home-demo-website/purchase", homeTestCreator, map[string]any{"plan": "year", "checkoutId": "checkout-missing-confirm", "revision": c.Revision}).Code)
	req := httptest.NewRequest("POST", "http://localhost/api/creators/me/home/cards/home-demo-website/purchase", bytes.NewBufferString(`{}`))
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("Authorization", "Bearer "+homeTestCreator)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	assert.Equal(t, 403, rec.Code)
	// Even concurrent transport retries cannot turn one checkout into many charges.
	var wg sync.WaitGroup
	results := make(chan error, 8)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := service.BuyCreatorHome(92001, c.WorkID, "year", "concurrent-checkout-0001", c.Revision)
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	for err := range results {
		require.NoError(t, err)
	}
	var orders int64
	require.NoError(t, db.Model(&model.CreatorHomeOrder{}).Count(&orders).Error)
	assert.EqualValues(t, 1, orders)
	first := card()
	_, err := service.BuyCreatorHome(92001, first.WorkID, "year", "renewal-checkout-0001", first.Revision)
	require.NoError(t, err)
	assert.Equal(t, time.Unix(first.ExpiresAt, 0).UTC().AddDate(1, 0, 0).Unix(), card().ExpiresAt)
	var user model.User
	require.NoError(t, db.First(&user, 92001).Error)
	assert.Equal(t, 15000000, user.Quota)
	// Past-due cards vanish server-side without a cleanup job.
	require.NoError(t, db.Model(&model.CreatorHomeCard{}).Where("work_id = ?", c.WorkID).Update("expires_at", time.Now().Unix()-1).Error)
	assert.Equal(t, 404, homeRequest(t, e, "GET", "/home/posters/home-demo-website", "", nil).Code)
	assert.NotContains(t, homeDisplayedWorks(t,e), "home-demo-website")
	assert.Contains(t, homeRequest(t, e, "GET", "/home", "", nil).Body.String(), "Yuki")
	// Turning a module off cannot permit a new charge or expose a saved poster.
	cfg, err := model.GetCreatorHomeConfig(db)
	require.NoError(t, err)
	cfg.GalleryEnabled = false
	require.NoError(t, service.SaveCreatorHomeConfig(cfg))
	_, err = service.BuyCreatorHome(92001, c.WorkID, "year", "module-disabled-checkout", card().Revision)
	assert.ErrorIs(t, err, model.ErrCreatorHomeInvalid)
	cfg, err = model.GetCreatorHomeConfig(db)
	require.NoError(t, err)
	cfg.GalleryEnabled = true
	require.NoError(t, service.SaveCreatorHomeConfig(cfg))
	common.BatchUpdateEnabled = true
	_, err = service.BuyCreatorHome(92001, c.WorkID, "year", "batch-disabled-checkout", card().Revision)
	require.Error(t, err)
	common.BatchUpdateEnabled = false
	require.NoError(t, db.First(&user, 92001).Error)
	assert.Equal(t, 15000000, user.Quota)
}
