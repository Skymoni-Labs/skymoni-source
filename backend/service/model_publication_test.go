package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelPublicationSelectionGuard(t *testing.T) {
	db := setupChannelSelectAutoGroupsTest(t)
	require.NoError(t, db.AutoMigrate(&model.Model{}))
	require.NoError(t, i18n.Init())
	createChannelSelectAutoGroupsChannel(t, db, 2102, "default", "guard-hidden,guard-visible")
	for _, row := range []model.Model{{ModelName: "guard-", NameRule: model.NameRulePrefix, Status: 1}, {ModelName: "guard-hidden", Status: 1}} {
		require.NoError(t, db.Create(&row).Error)
	}
	require.NoError(t, db.Model(&model.Model{}).Where("model_name = ?", "guard-hidden").Update("status", 0).Error)
	model.InitChannelCache()
	newContext := func() *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
		return c
	}
	for _, name := range []string{"guard-hidden", "never-published", "never-published[1m]"} {
		// An exact hidden rule overrides a visible prefix. Unknown names without
		// matching metadata also fail closed. A visible prefix still publishes
		// its other concrete names, exactly as it does in the catalog.
		for _, pinned := range []bool{false, true} {
			c := newContext()
			if pinned {
				GetChannelConstraints(c).AddPin(dto.ChannelPin{ChannelId: 2102, Source: dto.PinSourceToken, Rank: dto.PinRankToken})
			}
			channel, _, denied := SelectChannelForRequest(c, name, &RetryParam{Ctx: c, TokenGroup: "default", ModelName: name, Retry: common.GetPointer(0)})
			assert.Nil(t, channel)
			require.NotNil(t, denied)
			assert.Equal(t, http.StatusNotFound, denied.StatusCode)
			assert.Equal(t, types.ErrorCodeModelUnavailable, denied.Code)
			assert.Contains(t, i18n.Translate(i18n.LangZhCN, denied.MessageID, denied.Params), "未开放或已下架")
		}
	}
	c := newContext()
	channel, _, denied := SelectChannelForRequest(c, "guard-visible", &RetryParam{Ctx: c, TokenGroup: "default", ModelName: "guard-visible", Retry: common.GetPointer(0)})
	assert.Nil(t, denied)
	require.NotNil(t, channel)
	// No cache refresh is needed when an administrator changes publication.
	require.NoError(t, db.Model(&model.Model{}).Where("model_name = ?", "guard-hidden").Update("status", 1).Error)
	allowed, err := model.IsModelPublished("guard-hidden")
	require.NoError(t, err)
	assert.True(t, allowed)
	require.NoError(t, db.Where("model_name = ?", "guard-hidden").Delete(&model.Model{}).Error)
	allowed, err = model.IsModelPublished("guard-hidden")
	require.NoError(t, err)
	assert.True(t, allowed, "deleting an override falls back to the visible prefix")
	require.NoError(t, db.Model(&model.Model{}).Where("model_name = ?", "guard-").Update("status", 0).Error)
	allowed, err = model.IsModelPublished("guard-visible")
	require.NoError(t, err)
	assert.False(t, allowed)
	// Polling a server-owned task remains possible after delisting; token pins
	// above cannot use this exception to create a new generation.
	c = newContext()
	GetChannelConstraints(c).AddPin(dto.ChannelPin{ChannelId: 2102, Source: dto.PinSourceOriginTask, Rank: dto.PinRankOriginTask})
	channel, _, denied = SelectChannelForRequest(c, "guard-hidden", &RetryParam{Ctx: c, TokenGroup: "default", Retry: common.GetPointer(0)})
	assert.Nil(t, denied)
	require.NotNil(t, channel)
	// A database failure must never fall back to an enabled hidden channel.
	require.NoError(t, db.Migrator().DropTable(&model.Model{}))
	c = newContext()
	channel, _, denied = SelectChannelForRequest(c, "guard-visible", &RetryParam{Ctx: c, TokenGroup: "default", Retry: common.GetPointer(0)})
	assert.Nil(t, channel)
	require.NotNil(t, denied)
	assert.Equal(t, http.StatusServiceUnavailable, denied.StatusCode)
}
