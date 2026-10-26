package router

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
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
	"gorm.io/gorm"
)

type interruptedSoftwareUpload struct{ first bool }

func (reader *interruptedSoftwareUpload) Read(buffer []byte) (int, error) {
	if reader.first {
		return 0, io.ErrUnexpectedEOF
	}
	reader.first = true
	return copy(buffer, append([]byte("MZ"), bytes.Repeat([]byte("x"), 510)...)), nil
}

func TestSoftwareManagement(t *testing.T) {
	t.Setenv("SOFTWARE_CENTER_DIR", t.TempDir())
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.AuditLog{}))
	require.NoError(t, model.InitSecurityProtection(db))
	previousDB, previousLog, previousRedis, previousSecure, previousTrusted := model.DB, model.LOG_DB, common.RedisEnabled, common.SessionCookieSecure, common.SessionCookieTrustedURLs
	mainType, logType := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB, common.RedisEnabled, common.SessionCookieSecure = db, db, false, true
	common.SessionCookieTrustedURLs = []string{"https://skymoni.com"}
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled, common.SessionCookieSecure, common.SessionCookieTrustedURLs = previousDB, previousLog, previousRedis, previousSecure, previousTrusted
		common.SetDatabaseTypes(mainType, logType)
		connection, e := db.DB()
		require.NoError(t, e)
		require.NoError(t, connection.Close())
	})
	rootToken, userToken := "software-root-fixture", "software-user-fixture"
	for i, user := range []model.User{
		{Id: 90001, Username: "software-admin", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AccessToken: &rootToken, AffCode: "software-root", AuthVersion: 1},
		{Id: 90002, Username: "software-user", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AccessToken: &userToken, AffCode: "software-user", AuthVersion: 1},
	} {
		user.DisplayName = fmt.Sprintf("Software %d", i)
		require.NoError(t, db.Create(&user).Error)
	}
	engine := gin.New()
	engine.Use(middleware.RequestId())
	registerSoftwareRoutes(engine.Group("/api"))
	engine.GET("/api/software/files/:id/:name", controller.DownloadSoftwareFile)
	engine.HEAD("/api/software/files/:id/:name", controller.DownloadSoftwareFile)
	request := func(method, path, token, origin string, body io.Reader, contentType string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "https://skymoni.com"+path, body)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		return rec
	}
	getCatalog := func() service.SoftwareCatalog {
		result := request("GET", "/api/software/admin/catalog", rootToken, "", nil, "")
		require.Equal(t, 200, result.Code, result.Body.String())
		var response struct {
			Data service.SoftwareCatalog `json:"data"`
		}
		require.NoError(t, common.Unmarshal(result.Body.Bytes(), &response))
		return response.Data
	}
	save := func(catalog service.SoftwareCatalog) *httptest.ResponseRecorder {
		data, e := common.Marshal(catalog)
		require.NoError(t, e)
		return request("PUT", "/api/software/admin/catalog", rootToken, "https://skymoni.com", bytes.NewReader(data), "application/json")
	}
	t.Run("guest catalog preserves existing items and keeps App separate", func(t *testing.T) {
		response := request("GET", "/api/software/public", "", "", nil, "")
		require.Equal(t, 200, response.Code)
		assert.Contains(t, response.Body.String(), "CC Switch")
		assert.NotContains(t, response.Body.String(), "skymoni App")
		assert.NotContains(t, response.Body.String(), "revision")
	})
	t.Run("administrator authorization and same-origin writes", func(t *testing.T) {
		for _, path := range []string{"/catalog", "/files"} {
			assert.Equal(t, 401, request("GET", "/api/software/admin"+path, "", "", nil, "").Code)
			assert.Equal(t, 403, request("GET", "/api/software/admin"+path, userToken, "", nil, "").Code)
		}
		for _, method := range []string{"PUT", "POST", "DELETE"} {
			path := "/api/software/admin/catalog"
			if method == "POST" {
				path = "/api/software/admin/files"
			}
			if method == "DELETE" {
				path = "/api/software/admin/files/invalid"
			}
			assert.Equal(t, 401, request(method, path, "", "https://skymoni.com", nil, "").Code)
			assert.Equal(t, 403, request(method, path, userToken, "https://skymoni.com", nil, "").Code)
			assert.Equal(t, 403, request(method, path, rootToken, "https://evil.example", nil, "").Code)
		}
	})
	var file service.SoftwareFile
	t.Run("featured slots persist in order and guests never receive unpublished selections", func(t *testing.T) {
		catalog := getCatalog()
		catalog.Featured = &service.SoftwareFeaturedConfig{Carousel: []string{"cc-switch", "drip"}, Tiles: []string{"skymoni-mail"}}
		catalog.Items[0].Published = false
		require.Equal(t, 200, save(catalog).Code)
		require.Equal(t, catalog.Featured, getCatalog().Featured)
		response := request("GET", "/api/software/public", "", "", nil, "")
		require.Equal(t, 200, response.Code)
		var public struct {
			Data struct {
				Featured service.SoftwareFeaturedConfig `json:"featured"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &public))
		require.Equal(t, []string{"cc-switch"}, public.Data.Featured.Carousel)
		require.Equal(t, []string{"skymoni-mail"}, public.Data.Featured.Tiles)
		stored := getCatalog()
		stored.Items[0].Published = true
		stored.Featured = nil
		require.Equal(t, 200, save(stored).Code)
	})
	t.Run("optional details persist and only published metadata reaches guests", func(t *testing.T) {
		catalog := getCatalog()
		original := append([]service.SoftwareEntry(nil), catalog.Items...)
		catalog.Items[0].Details = &service.SoftwareDetails{Overview: "A real introduction", Features: "Browse\nManage subscriptions", Publisher: "skymoni", UpdatedAt: "2026-10-08", Requirements: "Windows 10 / 11 x64", Screenshots: []string{"/api/shop/images/preview.png"}, ImageLayout: "landscape"}
		catalog.Items = append(catalog.Items, service.SoftwareEntry{ID: "draft-details", Kind: "tool", Name: "Draft", SortOrder: 100, Appearance: "generic", Details: &service.SoftwareDetails{Overview: "Private draft description"}})
		require.Equal(t, 200, save(catalog).Code)
		stored := getCatalog()
		require.Equal(t, catalog.Items[0].Details, stored.Items[0].Details)
		require.Nil(t, stored.Items[1].Details, "legacy records must stay compatible")
		public := request("GET", "/api/software/public", "", "", nil, "")
		assert.Contains(t, public.Body.String(), "A real introduction")
		assert.NotContains(t, public.Body.String(), "Private draft description")
		stored.Items = original
		require.Equal(t, 200, save(stored).Code)
	})
	t.Run("invalid detail metadata is rejected without replacing the catalog", func(t *testing.T) {
		for _, details := range []*service.SoftwareDetails{
			{Screenshots: []string{"javascript:alert(1)"}},
			{Screenshots: []string{"/api/shop/images/../private"}},
			{Screenshots: []string{"#installation"}},
			{Screenshots: []string{""}},
			{Screenshots: make([]string, 13)},
			{Overview: strings.Repeat("x", 12001)},
			{Publisher: strings.Repeat("x", 121)},
			{UpdatedAt: "2026-02-30"},
			{ImageLayout: "stretch"},
		} {
			catalog := getCatalog()
			catalog.Items[0].Details = details
			assert.Equal(t, 400, save(catalog).Code)
			assert.Equal(t, catalog.Revision, getCatalog().Revision)
		}
	})
	payload := []byte("PK\x03\x04software-management-fixture")
	upload := func(name string, data []byte) *httptest.ResponseRecorder {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, e := writer.CreateFormFile("file", name)
		require.NoError(t, e)
		_, e = part.Write(data)
		require.NoError(t, e)
		require.NoError(t, writer.Close())
		return request("POST", "/api/software/admin/files", rootToken, "https://skymoni.com", &body, writer.FormDataContentType())
	}
	t.Run("invalid installer uploads leave no public files", func(t *testing.T) {
		for _, example := range []struct {
			name string
			data []byte
		}{
			{"page.html", []byte("<script>bad</script>")}, {"fake.exe", []byte("<html>not executable")}, {"../escape.zip", payload}, {"empty.zip", nil},
		} {
			assert.Equal(t, 400, upload(example.name, example.data).Code, example.name)
		}
		_, err := service.StoreSoftwareInstaller("large.exe", bytes.NewReader(append([]byte("MZ"), bytes.Repeat([]byte("x"), 512)...)), 32)
		assert.ErrorIs(t, err, service.ErrSoftwareStorageFull)
		_, err = service.StoreSoftwareInstaller("interrupted.exe", &interruptedSoftwareUpload{}, 1024)
		assert.ErrorIs(t, err, io.ErrUnexpectedEOF)
		entries, err := os.ReadDir(filepath.Join(service.SoftwareDirectory(), "files"))
		require.NoError(t, err)
		assert.Empty(t, entries)
	})
	t.Run("upload generates persistent metadata but draft download is private", func(t *testing.T) {
		response := upload("示例工具.zip", payload)
		require.Equal(t, 200, response.Code, response.Body.String())
		var data struct {
			Data service.SoftwareFile `json:"data"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &data))
		file = data.Data
		assert.Equal(t, int64(len(payload)), file.Bytes)
		assert.Equal(t, fmt.Sprintf("%x", sha256.Sum256(payload)), file.SHA256)
		assert.Equal(t, 404, request("GET", file.URL, "", "", nil, "").Code)
		stored, e := service.LoadSoftwareFile(file.ID)
		require.NoError(t, e)
		assert.Equal(t, file, stored)
	})
	t.Run("publish exposes installer and rejects stale edits", func(t *testing.T) {
		catalog := getCatalog()
		stale := catalog
		entry := service.SoftwareEntry{ID: "sample-tool", Kind: "tool", Name: "Sample Tool", DownloadURL: "https://skymoni.com" + file.URL, Appearance: "generic", SortOrder: 5, Published: true}
		catalog.Items = append(catalog.Items, entry)
		result := save(catalog)
		require.Equal(t, 200, result.Code, result.Body.String())
		assert.Equal(t, 409, save(stale).Code)
		catalog = getCatalog()
		assert.Equal(t, "sample-tool", catalog.Items[0].ID)
		persisted, e := service.LoadSoftwareCatalog()
		require.NoError(t, e)
		assert.Equal(t, catalog, persisted)
		public := request("GET", "/api/software/public", "", "", nil, "")
		assert.Contains(t, public.Body.String(), "Sample Tool")
		download := request("GET", file.URL, "", "", nil, "")
		require.Equal(t, 200, download.Code)
		assert.Equal(t, payload, download.Body.Bytes())
		assert.Equal(t, "application/octet-stream", download.Header().Get("Content-Type"))
		assert.Equal(t, "nosniff", download.Header().Get("X-Content-Type-Options"))
		assert.True(t, strings.HasPrefix(download.Header().Get("Content-Disposition"), "attachment;"))
		assert.Equal(t, "no-store", download.Header().Get("Cache-Control"))
		head := request("HEAD", file.URL, "", "", nil, "")
		assert.Equal(t, 200, head.Code)
		assert.Empty(t, head.Body.Bytes())
		assert.Equal(t, 409, request("DELETE", "/api/software/admin/files/"+file.ID, rootToken, "https://skymoni.com", nil, "").Code)
	})
	t.Run("unsafe links and duplicate IDs cannot be saved", func(t *testing.T) {
		for _, link := range []string{"javascript:alert(1)", "//evil.example", "/api/software/files/../../secret", "https://admin:secret@example.com"} {
			catalog := getCatalog()
			catalog.Items[0].DetailURL = link
			assert.Equal(t, 400, save(catalog).Code, link)
		}
		catalog := getCatalog()
		catalog.Items = append(catalog.Items, catalog.Items[0])
		assert.Equal(t, 400, save(catalog).Code)
	})
	t.Run("unpublish removes public access then unused files can be deleted", func(t *testing.T) {
		catalog := getCatalog()
		catalog.Items[0].Published = false
		require.Equal(t, 200, save(catalog).Code)
		assert.NotContains(t, request("GET", "/api/software/public", "", "", nil, "").Body.String(), "Sample Tool")
		assert.Equal(t, 404, request("GET", file.URL, "", "", nil, "").Code)
		catalog = getCatalog()
		catalog.Items = catalog.Items[1:]
		require.Equal(t, 200, save(catalog).Code)
		assert.Equal(t, 200, request("DELETE", "/api/software/admin/files/"+file.ID, rootToken, "https://skymoni.com", nil, "").Code)
		assert.Equal(t, 404, request("GET", file.URL, "", "", nil, "").Code)
		assert.Equal(t, 404, request("DELETE", "/api/software/admin/files/"+file.ID, rootToken, "https://skymoni.com", nil, "").Code)
	})
}
