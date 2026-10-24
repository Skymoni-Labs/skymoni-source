package relay

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponsesWSModelPublicationChangesOnExistingSession(t *testing.T) {
	db := setupRelayChannelDB(t)
	require.NoError(t, db.AutoMigrate(&model.Model{}))
	require.NoError(t, i18n.Init())
	row := model.Model{ModelName: "published-ws-model", Status: 1}
	require.NoError(t, db.Create(&row).Error)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("GET", "/v1/responses", nil)
	assert.Nil(t, checkResponsesWSModelAccess(c, row.ModelName))
	require.NoError(t, db.Model(&row).Update("status", 0).Error)
	denied := checkResponsesWSModelAccess(c, row.ModelName)
	require.NotNil(t, denied)
	assert.Equal(t, http.StatusNotFound, denied.StatusCode)
	assert.Equal(t, types.ErrorCodeModelUnavailable, denied.GetErrorCode())
	assert.False(t, service.ShouldRetryRelayError(c, denied, 3))
	require.NoError(t, db.Model(&row).Update("status", 1).Error)
	assert.Nil(t, checkResponsesWSModelAccess(c, row.ModelName))
}
