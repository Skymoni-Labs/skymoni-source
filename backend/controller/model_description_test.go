package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestListModelsReturnsPublicDescriptions(t *testing.T) {
	withSelfUseModeEnabled(t)
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.Create(&model.User{
		Id: 1001, Username: "description-user", Password: "password",
		Group: "default", Status: common.UserStatusEnabled,
	}).Error)
	require.NoError(t, db.Create(&[]model.Model{
		{ModelName: "code-model", Description: "用于代码使用。", Status: 1},
		{ModelName: "plain-model", Status: 1},
		{ModelName: "hidden-model", Description: "hidden", Status: 0},
	}).Error)
	require.NoError(t, db.Model(&model.Model{}).Where("model_name = ?", "hidden-model").Update("status", 0).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "default", Model: "code-model", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "plain-model", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "hidden-model", ChannelId: 1, Enabled: true},
	}).Error)

	for _, format := range []struct {
		name      string
		typeID    int
		listField string
		idField   string
	}{
		{"openai", constant.ChannelTypeOpenAI, "data", "id"},
		{"anthropic", constant.ChannelTypeAnthropic, "data", "id"},
		{"gemini", constant.ChannelTypeGemini, "models", "name"},
	} {
		t.Run(format.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodGet, "/v1/models", nil)
			ctx.Set("id", 1001)
			ListModels(ctx, format.typeID)
			require.Equal(t, http.StatusOK, recorder.Code)
			var payload map[string]any
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
			items := payload[format.listField].([]any)
			require.Len(t, items, 2)
			byID := make(map[string]map[string]any)
			for _, item := range items {
				fields := item.(map[string]any)
				byID[fields[format.idField].(string)] = fields
			}
			require.Equal(t, "用于代码使用。", byID["code-model"]["description"])
			require.Empty(t, byID["plain-model"]["description"])
			require.NotContains(t, byID, "hidden-model")
		})
	}
}
