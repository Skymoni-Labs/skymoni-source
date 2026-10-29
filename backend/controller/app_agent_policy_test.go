package controller

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAppAgentPolicyPublicationAndCanonicalToolForwarding(t *testing.T) {
	db := modelManagementDB(t, "sqlite", "")
	require.NoError(t, i18n.Init())
	meta := model.Model{ModelName: "agent-fixture", Status: 1}
	require.NoError(t, db.Create(&meta).Error)
	channel := model.Channel{Name: "Agent fixture", Type: 1, Key: "test-only", Models: meta.ModelName, Group: "default", Status: common.ChannelStatusEnabled}
	require.NoError(t, channel.Insert())
	model.RefreshPricing()
	t.Cleanup(model.InvalidatePricingCache)
	const body = `{"model":"agent-fixture","max_tokens":512,"stream":true,"group":"other","messages":[{"role":"user","content":"hi"}],"tools":[{"type":"function","function":{"name":"read_file","parameters":{"type":"object"}}}]}`
	run := func(authenticated bool) (*httptest.ResponseRecorder, []byte, string) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/api/app-account/agent/chat/completions?ignored=1", bytes.NewBufferString(body))
		c.Request.Header.Set("Authorization", "AppAccount fake-only")
		c.Request.Header.Set("Accept-Language", "zh-CN")
		c.Set("app_account_authenticated", authenticated)
		c.Set("app_account_user_group", "default")
		middleware.AppAccountAgentChatPolicy(c)
		forwarded, _ := io.ReadAll(c.Request.Body)
		return w, forwarded, c.Request.URL.Path
	}
	w, _, _ := run(false)
	assert.Equal(t, 401, w.Code)
	w, forwarded, path := run(true)
	require.Equal(t, 200, w.Code, w.Body.String())
	assert.Equal(t, "/v1/chat/completions", path)
	assert.Contains(t, string(forwarded), `"tools"`)
	assert.NotContains(t, string(forwarded), `"group"`)
	require.NoError(t, db.Model(&meta).Update("status", 0).Error)
	w, _, _ = run(true)
	assert.Equal(t, 404, w.Code)
	assert.Contains(t, w.Body.String(), "model_not_available")
	// Larger programming bodies must still hit publication policy before relay.
	w = httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	large := strings.Replace(body, `"content":"hi"`, `"content":"`+strings.Repeat("history ", 40000)+`"`, 1)
	c.Request = httptest.NewRequest("POST", "/api/app-account/agent/chat/completions", strings.NewReader(large))
	c.Set("app_account_authenticated", true)
	c.Set("app_account_user_group", "default")
	middleware.AppAccountAgentChatPolicy(c)
	assert.Equal(t, 404, w.Code)
	assert.Contains(t, w.Body.String(), "model_not_available")
}

func TestAppAgentFullRelayAgainstSyntheticUpstream(t *testing.T) {
	modelManagementDB(t, "sqlite", "") // Initialize dialect-specific model column names.
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 60
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })
	user, _ := setupAppAccountTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Model{}, &model.Vendor{}, &model.Channel{}, &model.Ability{}))
	require.NoError(t, model.LOG_DB.AutoMigrate(&model.Log{}))
	require.NoError(t, model.DB.Model(user).Updates(map[string]any{"quota": 100000000, "setting": `{"billing_preference":"wallet_only"}`}).Error)
	const modelName = "agent-relay-fixture"
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"agent-relay-fixture":1}`))
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{"agent-relay-fixture":1}`))
	require.NoError(t, model.DB.Create(&model.Model{ModelName: modelName, Status: 1}).Error)
	upstreamCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		data, err := io.ReadAll(r.Body)
		assert.NoError(t, err)
		assert.Contains(t, string(data), `"tools"`)
		assert.NotContains(t, string(data), `"group":"forbidden"`)
		assert.NotContains(t, r.Header.Get("Authorization"), "AppAccount")
		if strings.Contains(string(data), `"stream":true`) {
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: {\"id\":\"chatcmpl-fixture\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"agent-relay-fixture\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"tool_calls\":[{\"index\":0,\"id\":\"call_2\",\"type\":\"function\",\"function\":{\"name\":\"write\",\"arguments\":\"{}\"}}]},\"finish_reason\":null}]}\n\n")
			_, _ = io.WriteString(w, "data: {\"id\":\"chatcmpl-fixture\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"agent-relay-fixture\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":3,\"total_tokens\":13}}\n\n")
			_, _ = io.WriteString(w, "data: [DONE]\n\n")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"chatcmpl-fixture","object":"chat.completion","created":1,"model":"agent-relay-fixture","choices":[{"index":0,"message":{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"write","arguments":"{}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":3,"total_tokens":13}}`)
	}))
	t.Cleanup(upstream.Close)
	channel := model.Channel{Name: "Synthetic upstream", Type: 1, Key: "upstream-test", BaseURL: &upstream.URL, Models: modelName, Group: "default", Status: common.ChannelStatusEnabled}
	require.NoError(t, channel.Insert())
	model.RefreshPricing()
	t.Cleanup(model.InvalidatePricingCache)
	device, _, verifier := approveAppAccountTest(t, user)
	token, _, err := service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
	require.NoError(t, err)
	const path = "/api/app-account/agent/chat/completions"
	router := gin.New()
	router.POST(path, middleware.AppAccountAuth(true), middleware.AppAccountFunding, middleware.AppAccountAgentChatPolicy, middleware.ModelRequestRateLimit(), middleware.Distribute(), AppBetaRelay)
	request := httptest.NewRequest("POST", path, strings.NewReader(`{"model":"agent-relay-fixture","max_tokens":512,"stream":false,"group":"forbidden","messages":[{"role":"user","content":"hi"}],"tools":[{"type":"function","function":{"name":"write","parameters":{"type":"object"}}}]}`))
	request.Header.Set("Authorization", "AppAccount "+token)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, 200, response.Code, response.Body.String())
	assert.Equal(t, 1, upstreamCalls)
	assert.Contains(t, response.Body.String(), `"tool_calls"`)
	assert.Contains(t, response.Body.String(), `"call_1"`)
	quota, err := model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 100000000-13, quota)
	stream := httptest.NewRequest("POST", path, strings.NewReader(`{"model":"agent-relay-fixture","max_tokens":512,"stream":true,"messages":[{"role":"user","content":"hi"}],"tools":[{"type":"function","function":{"name":"write","parameters":{"type":"object"}}}]}`))
	stream.Header.Set("Authorization", "AppAccount "+token)
	stream.Header.Set("Content-Type", "application/json")
	streamResponse := httptest.NewRecorder()
	router.ServeHTTP(streamResponse, stream)
	require.Equal(t, 200, streamResponse.Code, streamResponse.Body.String())
	assert.Contains(t, streamResponse.Body.String(), "call_2")
	assert.Contains(t, streamResponse.Body.String(), "tool_calls")
	assert.Equal(t, 2, upstreamCalls)
	quota, err = model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 100000000-26, quota)
	require.NoError(t, model.DB.Model(&model.Model{}).Where("model_name = ?", modelName).Update("status", 0).Error)
	retry := httptest.NewRequest("POST", path, strings.NewReader(`{"model":"agent-relay-fixture","max_tokens":512,"messages":[{"role":"user","content":"hi"}]}`))
	retry.Header.Set("Authorization", "AppAccount "+token)
	retry.Header.Set("Content-Type", "application/json")
	rejected := httptest.NewRecorder()
	router.ServeHTTP(rejected, retry)
	assert.Equal(t, 404, rejected.Code)
	assert.Contains(t, rejected.Body.String(), "model_not_available")
	assert.Equal(t, 2, upstreamCalls)
	quota, err = model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 100000000-26, quota)
}

// The relay handler is a synthetic fixture: no real upstream request or
// real account is involved. It verifies the candidate endpoint retains the
// existing native account authentication and billing context.
func TestAppAgentAccountAuthAndBillingWithSyntheticRelay(t *testing.T) {
	modelManagementDB(t, "sqlite", "") // Initialize dialect-specific model column names.
	user, _ := setupAppAccountTest(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Model{}, &model.Vendor{}, &model.Channel{}, &model.Ability{}))
	require.NoError(t, model.DB.Model(user).Update("quota", 1000).Error)
	meta := model.Model{ModelName: "agent-billing-fixture", Status: 1}
	require.NoError(t, model.DB.Create(&meta).Error)
	channel := model.Channel{Name: "Agent billing fixture", Type: 1, Key: "test-only", Models: meta.ModelName, Group: "default", Status: common.ChannelStatusEnabled}
	require.NoError(t, channel.Insert())
	model.RefreshPricing()
	t.Cleanup(model.InvalidatePricingCache)
	device, _, verifier := approveAppAccountTest(t, user)
	token, _, err := service.ExchangeAppAccount(device, verifier, "127.0.0.1", "test")
	require.NoError(t, err)
	const path = "/api/app-account/agent/chat/completions"
	const body = `{"model":"agent-billing-fixture","max_tokens":512,"messages":[{"role":"user","content":"hi"}],"tools":[{"type":"function","function":{"name":"read_file","parameters":{"type":"object"}}}]}`
	calls := 0
	router := gin.New()
	router.POST(path, middleware.AppAccountAuth(true), middleware.AppAccountFunding, middleware.AppAccountAgentChatPolicy, middleware.ModelRequestRateLimit(), middleware.Distribute(), func(c *gin.Context) {
		calls++
		assert.Empty(t, c.GetHeader("Authorization"))
		info := relaycommon.GenRelayInfoOpenAI(c, &dto.GeneralOpenAIRequest{})
		assert.True(t, info.IsPlayground)
		assert.False(t, info.IsAppBeta)
		info.ForcePreConsume = true
		s, apiErr := service.NewBillingSession(c, info, 20)
		require.Nil(t, apiErr)
		require.NoError(t, s.Settle(30))
		c.Status(200)
	})
	request := func(credential, requestBody string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", path, strings.NewReader(requestBody))
		r.Header.Set("Authorization", "AppAccount "+credential)
		router.ServeHTTP(w, r)
		return w
	}
	require.Equal(t, 401, request("invalid", body).Code)
	require.Equal(t, 200, request(token, body).Code)
	assert.Equal(t, 1, calls)
	quota, err := model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 970, quota)
	betaBody := strings.Replace(body, `"model":`, `"funding":"beta","model":`, 1)
	require.NotEqual(t, 200, request(token, betaBody).Code, "unapproved beta funding must never fall back to the wallet")
	quota, err = model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, 970, quota)
	assert.Equal(t, 1, calls)
	require.NoError(t, model.DB.Model(&meta).Update("status", 0).Error)
	require.Equal(t, 404, request(token, body).Code)
	assert.Equal(t, 1, calls, "unpublished models cannot reach billing or relay")
}
