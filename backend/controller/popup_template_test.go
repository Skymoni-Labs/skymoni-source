package controller

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Called by the existing real SQLite/MySQL/PostgreSQL fixture. No production
// databases, users, notices, or session credentials are used.
func testPopupTemplateLifecycle(t *testing.T, db *gorm.DB, router *gin.Engine, tokens []string) {
	path := "/admin/templates"
	input := map[string]any{"name": "福利通知", "title": "领取资源", "content": strings.Repeat("云", 24000), "format": "html", "created_by": 999, "audience": "guest", "status": "published"}
	for _, test := range []struct {
		token  string
		status int
	}{{"", http.StatusUnauthorized}, {tokens[1], http.StatusForbidden}, {tokens[3], http.StatusForbidden}} {
		assert.Equal(t, test.status, popupNoticeTestRequest(t, router, "POST", path, test.token, input).Code)
		assert.Equal(t, test.status, popupNoticeTestRequest(t, router, "GET", path, test.token, nil).Code)
	}
	created := popupNoticeTestRequest(t, router, "POST", path, tokens[0], input)
	require.Equal(t, http.StatusOK, created.Code, created.Body.String())
	var result struct {
		Success bool
		Data    model.PopupTemplate
	}
	require.NoError(t, common.Unmarshal(created.Body.Bytes(), &result))
	item := result.Data
	require.EqualValues(t, 1, item.Revision)
	assert.Equal(t, input["content"], string(item.Content))
	assert.NotEqual(t, 999, item.CreatedBy)
	// Simulate an upgrade from the released schema and repeat startup migration.
	for range 2 {
		require.NoError(t, db.AutoMigrate(&model.PopupNotice{}, &model.PopupNoticeRead{}, &model.PopupNoticeRevision{}, &model.PopupTemplate{}))
	}
	var persisted model.PopupTemplate
	require.NoError(t, db.First(&persisted, item.ID).Error)
	assert.Equal(t, item, persisted)
	// Saving content as a template must never create a deliverable popup.
	eligible, err := model.GetEligiblePopupNotices(0, time.Now().Unix(), 100, nil)
	require.NoError(t, err)
	assert.Empty(t, eligible)
	for i := range 105 {
		extra := model.PopupTemplate{Name: fmt.Sprintf("活动-%03d", i), Title: "最新消息", Content: "测试正文", Format: "text"}
		require.NoError(t, model.CreatePopupTemplate(&extra, item.CreatedBy))
	}
	items, total, err := model.ListPopupTemplates("", 100, 20)
	require.NoError(t, err)
	assert.EqualValues(t, 106, total)
	assert.Len(t, items, 6)
	items, total, err = model.ListPopupTemplates("福利", 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Len(t, items, 1)
	assert.Equal(t, item.ID, items[0].ID)
	input["revision"], input["content"] = item.Revision, "更新后的正文"
	updated := popupNoticeTestRequest(t, router, "PUT", fmt.Sprintf("%s/%d", path, item.ID), tokens[0], input)
	require.Equal(t, http.StatusOK, updated.Code)
	assert.Equal(t, http.StatusConflict, popupNoticeTestRequest(t, router, "PUT", fmt.Sprintf("%s/%d", path, item.ID), tokens[0], input).Code)
	assert.Equal(t, http.StatusConflict, popupNoticeTestRequest(t, router, "DELETE", fmt.Sprintf("%s/%d", path, item.ID), tokens[0], map[string]any{"revision": 1}).Code)
	assert.Equal(t, http.StatusOK, popupNoticeTestRequest(t, router, "DELETE", fmt.Sprintf("%s/%d", path, item.ID), tokens[0], map[string]any{"revision": 2}).Code)
	items, total, err = model.ListPopupTemplates("福利", 0, 20)
	require.NoError(t, err)
	assert.Zero(t, total)
	assert.Empty(t, items)
	for _, invalid := range []map[string]any{
		{"name": "", "title": "有效标题", "content": "正文"},
		{"name": strings.Repeat("云", 101), "title": "有效标题", "content": "正文"},
		{"name": "模板", "title": " ", "content": "正文"},
		{"name": "模板", "title": "有效标题", "content": " "},
		{"name": "模板", "title": "有效标题", "content": "正文", "format": "script"},
		{"name": "模板", "title": "有效标题", "content": strings.Repeat("x", model.MaxPopupNoticeContentBytes+1)},
	} {
		assert.Equal(t, http.StatusBadRequest, popupNoticeTestRequest(t, router, "POST", path, tokens[0], invalid).Code)
	}
	assert.Equal(t, http.StatusBadRequest, popupNoticeTestRequest(t, router, "GET", path+"?p=bad", tokens[0], nil).Code)
}
