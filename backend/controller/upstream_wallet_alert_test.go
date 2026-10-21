package controller

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestUpstreamWalletAlertSettingsRootOnlyAndNoSecrets(t *testing.T) {
	for _, role := range []int{common.RoleCommonUser, common.RoleAdminUser, common.RoleRootUser} {
		t.Run(string(rune('A'+role)), func(t *testing.T) {
			r, _ := credentialRouter(t, role)
			require.NoError(t, model.DB.AutoMigrate(&model.UpstreamWalletAlertConfig{}, &model.UpstreamWalletAlertDelivery{}))
			r.GET("/wallet/alerts", GetUpstreamWalletAlerts)
			r.PUT("/wallet/alerts", UpdateUpstreamWalletAlerts)
			response := credentialRequest(t, r, http.MethodGet, "/wallet/alerts", nil)
			if role != common.RoleRootUser {
				require.Equal(t, 403, response.Code)
				return
			}
			require.Equal(t, 200, response.Code)
			require.Equal(t, "no-store, private", response.Header().Get("Cache-Control"))
			require.NotContains(t, response.Body.String(), "test-provider-pass")
			require.NotContains(t, response.Body.String(), "encrypted")
			c := model.DefaultUpstreamWalletAlertConfig()
			c.Enabled = true
			response = credentialRequest(t, r, http.MethodPut, "/wallet/alerts", c)
			require.Equal(t, 200, response.Code)
			response = credentialRequest(t, r, http.MethodPut, "/wallet/alerts", c)
			require.Equal(t, 409, response.Code)
			c.Recipients = []string{"owner@example.com\r\nBcc:leak@example.com"}
			response = credentialRequest(t, r, http.MethodPut, "/wallet/alerts", c)
			require.Equal(t, 400, response.Code)
			var audit []model.AuditLog
			require.NoError(t, model.DB.Find(&audit).Error)
			raw, _ := json.Marshal(audit)
			require.NotContains(t, string(raw), "test-provider-pass")
		})
	}
}
