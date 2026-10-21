package router

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUsageDocsPublicationPermissionsAndImages(t *testing.T) {
	t.Setenv("USAGE_DOCS_DIR", t.TempDir())
	e, _ := setupCreatorHome(t, t.TempDir())
	registerUsageDocsRoutes(e.Group("/api"))
	request := func(method, path, token, origin string, data any) *httptest.ResponseRecorder {
		raw, _ := json.Marshal(data)
		req := httptest.NewRequest(method, "http://localhost/api/docs"+path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec
	}
	draft := service.DocsPage{Title: "使用教程", Category: "开始", Blocks: []service.DocsBlock{{ID: "section1", Type: "heading", Text: "安装", Level: 2}, {ID: "body", Type: "text", Text: "draft secret"}}}
	body := func(revision, action string) any {
		return map[string]any{"draft": draft, "revision": revision, "action": action}
	}
	assert.Equal(t, 401, request("GET", "/admin", "", "", nil).Code)
	assert.Equal(t, 403, request("GET", "/admin", homeTestCreator, "", nil).Code)
	assert.Equal(t, 403, request("PUT", "/admin/tutorial", homeTestCreator, "http://localhost", body("new", "save")).Code)
	assert.Equal(t, 403, request("PUT", "/admin/tutorial", homeTestAdmin, "https://other.test", body("new", "save")).Code)
	decode := func(r *httptest.ResponseRecorder) service.DocsEntry {
		require.Equal(t, 200, r.Code, r.Body.String())
		var out struct {
			Data service.DocsEntry `json:"data"`
		}
		require.NoError(t, json.Unmarshal(r.Body.Bytes(), &out))
		return out.Data
	}
	entry := decode(request("PUT", "/admin/tutorial", homeTestAdmin, "http://localhost", body("new", "save")))
	assert.Equal(t, 404, request("GET", "/public/tutorial", "", "", nil).Code)
	assert.NotContains(t, request("GET", "/public", "", "", nil).Body.String(), "draft secret")
	entry = decode(request("PUT", "/admin/tutorial", homeTestAdmin, "http://localhost", body(entry.Revision, "publish")))
	require.Equal(t, 200, request("GET", "/public/tutorial", "", "", nil).Code)
	draft.Blocks[1].Text = "revised draft private"
	previous := entry.Revision
	entry = decode(request("PUT", "/admin/tutorial", homeTestAdmin, "http://localhost", body(entry.Revision, "save")))
	public := request("GET", "/public/tutorial", "", "", nil).Body.String()
	assert.Contains(t, public, "draft secret")
	assert.NotContains(t, public, "revised draft private")
	assert.NotContains(t, public, "revision")
	assert.Equal(t, 409, request("PUT", "/admin/tutorial", homeTestAdmin, "http://localhost", body(previous, "publish")).Code)
	// Reject active image formats and keep draft-only uploads private.
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	part, err := writer.CreateFormFile("file", "evil.svg")
	require.NoError(t, err)
	_, _ = part.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`))
	_ = writer.Close()
	upload := func(raw []byte, contentType string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "http://localhost/api/docs/admin/images", bytes.NewReader(raw))
		req.Header.Set("Content-Type", contentType)
		req.Header.Set("Origin", "http://localhost")
		req.Header.Set("Authorization", "Bearer "+homeTestAdmin)
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec
	}
	assert.Equal(t, 400, upload(buffer.Bytes(), writer.FormDataContentType()).Code)
	png, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(homeImage(24, 24), "data:image/png;base64,"))
	require.NoError(t, err)
	id, err := service.StoreDocsImage(png)
	require.NoError(t, err)
	assert.Equal(t, 404, request("GET", "/images/"+id, "", "", nil).Code)
	assert.Equal(t, 200, request("GET", "/images/"+id, homeTestAdmin, "", nil).Code)
	draft.Blocks = append(draft.Blocks, service.DocsBlock{ID: "image", Type: "image", URL: "/api/docs/images/" + id})
	entry = decode(request("PUT", "/admin/tutorial", homeTestAdmin, "http://localhost", body(entry.Revision, "publish")))
	image := request("GET", "/images/"+id, "", "", nil)
	assert.Equal(t, 200, image.Code)
	assert.Equal(t, "nosniff", image.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "image/png", image.Header().Get("Content-Type"))
	entry = decode(request("PUT", "/admin/tutorial", homeTestAdmin, "http://localhost", body(entry.Revision, "unpublish")))
	assert.Equal(t, 404, request("GET", "/public/tutorial", "", "", nil).Code)
	assert.Equal(t, 404, request("GET", "/images/"+id, "", "", nil).Code)
	_ = decode(request("PUT", "/admin/tutorial", homeTestAdmin, "http://localhost", body(entry.Revision, "delete")))
	assert.NotContains(t, request("GET", "/admin", homeTestAdmin, "", nil).Body.String(), "tutorial")
}
func TestUsageDocsConcurrentSaveAndValidation(t *testing.T) {
	t.Setenv("USAGE_DOCS_DIR", t.TempDir())
	draft := service.DocsPage{Title: "并发测试", Blocks: []service.DocsBlock{{ID: "h", Type: "heading", Text: "标题", Level: 2}}}
	_, err := service.SaveDocs("x", "new", "save", draft)
	require.NoError(t, err)
	var entry service.DocsEntry
	require.NoError(t, service.WithDocsCatalog(false, func(c *service.DocsCatalog) error { entry = c.Entries[0]; return nil }))
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := service.SaveDocs("x", entry.Revision, "save", draft)
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	good, conflicts := 0, 0
	for err := range results {
		if err == nil {
			good++
		} else if err == service.ErrDocsConflict {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	assert.Equal(t, 1, good)
	assert.Equal(t, 1, conflicts)
	draft.Blocks[0].Type = "script"
	_, err = service.SaveDocs("bad", "new", "save", draft)
	assert.ErrorIs(t, err, service.ErrDocsInvalid)
	draft.Blocks[0] = service.DocsBlock{ID: "image", Type: "image", URL: "javascript:alert(1)"}
	_, err = service.SaveDocs("bad", "new", "save", draft)
	assert.ErrorIs(t, err, service.ErrDocsInvalid)
	_, err = service.SaveDocs("../../escape", "new", "save", draft)
	assert.ErrorIs(t, err, service.ErrDocsInvalid)
}
