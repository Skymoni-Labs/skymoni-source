package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestModelAccountHandlersRequireRoot(t *testing.T) {
	for _, role := range []int{0, common.RoleCommonUser, common.RoleAdminUser} {
		for _, handler := range []gin.HandlerFunc{GetModelAccounts, UpdateModelAccountPriority} {
			response := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(response)
			c.Request = httptest.NewRequest(http.MethodPut, "/api/model-accounts/priority", strings.NewReader(`{"priority":400}`))
			c.Set("role", role)
			handler(c)
			require.Equal(t, http.StatusForbidden, response.Code)
		}
	}
}

func TestModelAccountPriorityRejectsInvalidJSON(t *testing.T) {
	for _, body := range []string{`{"priority": 1.5}`, `{"priority": "400"}`, `{`} {
		response := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(response)
		c.Request = httptest.NewRequest(http.MethodPut, "/api/model-accounts/priority", strings.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("role", common.RoleRootUser)
		UpdateModelAccountPriority(c)
		require.Equal(t, http.StatusBadRequest, response.Code)
	}
}
