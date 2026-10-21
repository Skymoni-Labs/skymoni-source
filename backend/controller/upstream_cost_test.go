package controller

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"net/http/httptest"
	"testing"
)

func TestUpstreamCostsMetadata(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	defer func() { common.OptionMapRWMutex.Lock(); common.OptionMap = previous; common.OptionMapRWMutex.Unlock() }()
	for _, tc := range []struct {
		name, raw string
		status    int
	}{
		{"missing", "", 200}, {"null", "null", 200},
		{"invalid", "bad", 500},
		{"known zero and unknown", `{"jev-latest":[{"provider":"TypeSafe","input_usd_per_million":0.042,"output_usd_per_million":0,"api_key":"must-not-leak"}]}`, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			common.OptionMapRWMutex.Lock()
			common.OptionMap["SkymoniUpstreamCosts"] = tc.raw
			common.OptionMapRWMutex.Unlock()
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			GetUpstreamCosts(c)
			require.Equal(t, tc.status, w.Code)
			require.NotContains(t, w.Body.String(), "must-not-leak")
			if tc.name == "known zero and unknown" {
				var response struct {
					Data map[string][]UpstreamCost `json:"data"`
				}
				require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
				require.Nil(t, response.Data["jev-latest"][0].ModelRatio)
				require.NotNil(t, response.Data["jev-latest"][0].OutputUSDPerMillion)
				require.Equal(t, 0.0, *response.Data["jev-latest"][0].OutputUSDPerMillion)
			}
		})
	}
}
