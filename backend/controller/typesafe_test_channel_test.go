package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTypeSafeCapabilitiesAndConnectionValidation(t *testing.T) {
	assert.Equal(t, []constant.EndpointType{constant.EndpointType("typesafe")}, common.GetEndpointTypesByChannelType(constant.ChannelTypeTaskPlugin, "jev-latest"))
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI}, common.GetEndpointTypesByChannelType(constant.ChannelTypeDeepSeek, "deepseek-flash"))
	base := "https://api.typesafe.ai"
	c := &model.Channel{Models: "jev-latest,jev-preview,jev-1.13.0", BaseURL: &base}
	for _, tc := range []struct {
		name, model string
		stream      bool
		message     string
	}{
		{"stream", "jev-latest", true, "streaming is not supported"},
		{"disabled model", "gpt-4", false, "not enabled"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := testTypeSafeChannel(context.Background(), c, tc.model, tc.stream)
			require.Error(t, r.localErr)
			assert.Contains(t, r.localErr.Error(), tc.message)
		})
	}
	base = "https://example.com"
	r := testTypeSafeChannel(context.Background(), c, "jev-latest", false)
	require.Error(t, r.localErr)
	assert.Contains(t, r.localErr.Error(), "official provider URL")
}

func TestTypeSafeSDKModelsRespectTokenLimits(t *testing.T) {
	withSelfUseModeEnabled(t)
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.Create(&model.User{Id: 1001, Username: "typesafe-model-user", Password: "test-only", Group: "default", Status: common.UserStatusEnabled}).Error)
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "default", Model: "jev-latest", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "jev-preview", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "deepseek-flash", ChannelId: 2, Enabled: true},
	}).Error)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/typesafe/v1/models", nil)
	c.Set("id", 1001)
	common.SetContextKey(c, constant.ContextKeyTokenModelLimitEnabled, true)
	common.SetContextKey(c, constant.ContextKeyTokenModelLimit, map[string]bool{"jev-latest": true, "deepseek-flash": true})
	ListModels(c, constant.ChannelTypeTaskPlugin)
	require.Equal(t, http.StatusOK, w.Code)
	var payload struct {
		Models []struct {
			Name        string `json:"name"`
			ReleaseDate string `json:"release_date"`
		} `json:"models"`
	}
	require.NoError(t, common.Unmarshal(w.Body.Bytes(), &payload))
	require.Len(t, payload.Models, 1)
	assert.Equal(t, "jev-latest", payload.Models[0].Name)
}
