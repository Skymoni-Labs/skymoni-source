package relay

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestRequestPricedModelLimits(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	mapWasNil := common.OptionMap == nil
	if mapWasNil {
		common.OptionMap = make(map[string]string)
	}
	before, existed := common.OptionMap["ModelRequestTokenLimits"]
	common.OptionMap["ModelRequestTokenLimits"] = `{"gemini-3.8-flash-token":{"max_input_tokens":16384,"max_output_tokens":4096}}`
	common.OptionMapRWMutex.Unlock()
	countToken := constant.CountToken
	t.Cleanup(func() {
		constant.CountToken = countToken
		common.OptionMapRWMutex.Lock()
		defer common.OptionMapRWMutex.Unlock()
		if existed {
			common.OptionMap["ModelRequestTokenLimits"] = before
		} else {
			delete(common.OptionMap, "ModelRequestTokenLimits")
		}
		if mapWasNil {
			common.OptionMap = nil
		}
	})
	info := &relaycommon.RelayInfo{OriginModelName: "gemini-3.8-flash-token"}
	for _, tc := range []struct {
		name, endpoint, body, field string
		want                        int64
	}{
		{"default for existing app", "/v1/chat/completions", `{"messages":[{"role":"user","content":"hi"}],"stream":true}`, "max_tokens", 4096},
		{"clamp post override", "/v1/chat/completions", `{"max_tokens":65536,"n":8}`, "max_tokens", 4096},
		{"preserve smaller", "/v1/chat/completions", `{"max_tokens":256}`, "max_tokens", 256},
		{"reasoning output cap", "/v1/chat/completions", `{"max_completion_tokens":65536}`, "max_completion_tokens", 4096},
		{"responses cap", "/v1/responses", `{"max_output_tokens":65536}`, "max_output_tokens", 4096},
		{"native gemini cap", "/v1beta/models/gemini-3.8-flash:generateContent", `{"generationConfig":{"maxOutputTokens":65536,"candidateCount":8}}`, "generationConfig.maxOutputTokens", 4096},
		{"claude compatible cap", "/v1/messages", `{"max_tokens":65536}`, "max_tokens", 4096},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reader, err := helper.LimitUpstreamOutput(info, "https://provider.invalid"+tc.endpoint, strings.NewReader(tc.body))
			require.NoError(t, err)
			body, err := io.ReadAll(reader)
			require.NoError(t, err)
			assert.Equal(t, tc.want, gjson.GetBytes(body, tc.field).Int())
			for _, path := range []string{"n", "generationConfig.candidateCount"} {
				if value := gjson.GetBytes(body, path); value.Exists() {
					assert.Equal(t, int64(1), value.Int())
				}
			}
		})
	}
	t.Run("other models are untouched", func(t *testing.T) {
		reader := strings.NewReader(`{"max_tokens":65536}`)
		result, err := helper.LimitUpstreamOutput(&relaycommon.RelayInfo{OriginModelName: "other-model"}, "https://provider.invalid/v1/chat/completions", reader)
		require.NoError(t, err)
		assert.Same(t, reader, result)
	})
	t.Run("opaque cached history rejected", func(t *testing.T) {
		_, err := helper.LimitUpstreamOutput(info, "https://provider.invalid/v1/responses", strings.NewReader(`{"previous_response_id":"opaque"}`))
		require.Error(t, err)
	})
	t.Run("oversized input rejected before reserve even when estimation disabled", func(t *testing.T) {
		constant.CountToken = false
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
		common.SetContextKey(ctx, constant.ContextKeyOriginalModel, info.OriginModelName)
		request := &dto.GeneralOpenAIRequest{Model: info.OriginModelName, Messages: []dto.Message{{Role: "user", Content: strings.Repeat("hello ", 20000)}}}
		limited := &relaycommon.RelayInfo{OriginModelName: info.OriginModelName, RelayFormat: types.RelayFormatOpenAI, Request: request}
		err := PrepareRequestBilling(ctx, limited)
		require.NotNil(t, err)
		assert.Equal(t, http.StatusBadRequest, err.StatusCode)
		assert.Contains(t, err.Error(), "16384")
		assert.Nil(t, limited.Billing)
	})
	t.Run("multiple candidates rejected before reserve", func(t *testing.T) {
		limits, err := helper.RequestTokenLimits(info.OriginModelName)
		require.NoError(t, err)
		info.Request = &dto.GeneralOpenAIRequest{N: lo.ToPtr(2)}
		require.Error(t, helper.ValidateLimitedRequest(info, limits))
	})
}
