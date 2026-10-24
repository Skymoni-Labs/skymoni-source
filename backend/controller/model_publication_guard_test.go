package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelPublicationHTTPDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env)
			}
			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, i18n.Init())
			meta := model.Model{ModelName: "publication-fixture", Status: 1}
			require.NoError(t, db.Create(&meta).Error)
			channel := model.Channel{Name: "Enabled fixture", Type: 1, Key: "test-only", Models: meta.ModelName, Group: "default", Status: common.ChannelStatusEnabled}
			require.NoError(t, channel.Insert())
			invocations := 0
			router := gin.New()
			router.Use(func(c *gin.Context) {
				c.Set("id", 1)
				common.SetContextKey(c, constant.ContextKeyUsingGroup, "default")
				common.SetContextKey(c, constant.ContextKeyUserGroup, "default")
				c.Next()
			}, middleware.Distribute())
			for _, path := range []string{"/v1/chat/completions", "/v1/messages", "/v1/responses", "/v1/images/generations", "/api/app-account/chat/completions"} {
				router.POST(path, func(c *gin.Context) { invocations++; c.JSON(200, gin.H{"ok": true}) })
			}
			request := func(path string) *httptest.ResponseRecorder {
				w := httptest.NewRecorder()
				r := httptest.NewRequest("POST", path, bytes.NewBufferString(`{"model":"publication-fixture","messages":[{"role":"user","content":"Say OK"}],"stream":true}`))
				r.Header.Set("Content-Type", "application/json")
				r.Header.Set("Accept-Language", "zh-CN")
				router.ServeHTTP(w, r)
				return w
			}
			assert.Equal(t, 200, request("/v1/chat/completions").Code)
			require.Equal(t, 1, invocations)
			require.NoError(t, db.Model(&meta).Update("status", 0).Error)
			for _, path := range []string{"/v1/chat/completions", "/v1/messages", "/v1/responses", "/v1/images/generations", "/api/app-account/chat/completions"} {
				w := request(path)
				assert.Equal(t, http.StatusNotFound, w.Code, w.Body.String())
				assert.Contains(t, w.Body.String(), "model_not_available")
				assert.Contains(t, w.Body.String(), "未开放或已下架")
				assert.Contains(t, w.Body.String(), "更新模型列表")
			}
			assert.Equal(t, 1, invocations, "hidden requests cannot reach the relay/charge handler")
			require.NoError(t, db.Model(&meta).Update("status", 1).Error)
			assert.Equal(t, 200, request("/v1/chat/completions").Code)
			require.NoError(t, db.Delete(&meta).Error)
			assert.Equal(t, http.StatusNotFound, request("/v1/chat/completions").Code)
			assert.Equal(t, 2, invocations, "deleted metadata must also stop new requests")
		})
	}
}
