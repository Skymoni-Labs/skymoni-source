package controller

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestUpstreamMonitorPublicSourceParsing(t *testing.T) {
	var plaza yylxPlaza
	require.NoError(t, json.Unmarshal([]byte(`{
    "code":0,"data":{"groups":[
      {"id":8,"name":"GPT Standard","rate_multiplier":0.1,"peak_rate_multiplier":1.5,"models":[
        {"name":"gpt-5.6-sol","pricing":{"billing_mode":"token","input_price":0.000002,"output_price":0.00001,"cache_read_price":0.0000002,"cache_write_price":0.0000025,"cache_write_1h_price":0.000003,"intervals":[{"tier_label":"long","min_tokens":200000,"input_price":0.000004,"output_price":0.000015,"cache_read_price":0.0000004,"cache_write_price":0.000005}]}}
      ]},
      {"id":12,"name":"Image","rate_multiplier":1,"image_rate_independent":true,"image_rate_multiplier":0.5,"models":[
        {"name":"gpt-image-2","pricing":{"billing_mode":"image","per_request_price":0.02}}
      ]}
    ]}}`), &plaza))
	items, err := parseYYLXMonitor(plaza)
	require.NoError(t, err)
	require.Len(t, items, 2)
	require.Equal(t, "gpt-5.6-sol", items[0].Name)
	require.Equal(t, "8", items[0].GroupID)
	require.Equal(t, 2.0, *items[0].RawPrice.InputPerMillion)
	require.InDelta(t, 0.2, *items[0].RawPrice.EffectiveInputPerMillion, 1e-12)
	require.InDelta(t, 1.0, *items[0].RawPrice.EffectiveOutputPerMillion, 1e-12)
	require.InDelta(t, 0.02, *items[0].RawPrice.EffectiveCacheReadPerMillion, 1e-12)
	require.InDelta(t, 0.25, *items[0].RawPrice.EffectiveCacheWritePerMillion, 1e-12)
	require.InDelta(t, 0.3, *items[0].RawPrice.EffectiveCacheWrite1hPerMillion, 1e-12)
	require.InDelta(t, 0.4, *items[0].Tiers[0].EffectiveInputPerMillion, 1e-12)
	require.InDelta(t, 0.04, *items[0].Tiers[0].EffectiveCacheReadPerMillion, 1e-12)
	require.Equal(t, 1.5, *items[0].PeakRateMultiplier)
	require.Equal(t, "request", items[1].BillingType)
	require.Equal(t, 0.02, *items[1].RawPrice.PerRequest)
	require.Equal(t, 0.01, *items[1].RawPrice.EffectivePerRequest)
}

func TestUpstreamMonitor2000PricesAndUnknownExpression(t *testing.T) {
	var pricing run2000Pricing
	require.NoError(t, json.Unmarshal([]byte(`{
      "success":true,"group_ratio":{"default":1,"premium":1.5},"data":[
        {"model_name":"gpt-5.6-terra","quota_type":1,"model_price":0.36,"enable_groups":["default","premium"]},
        {"model_name":"token-model","quota_type":0,"model_ratio":2,"completion_ratio":4,"enable_groups":["default"]},
        {"model_name":"expr-model","quota_type":0,"model_ratio":2,"billing_mode":"tiered_expr"}
      ]}`), &pricing))
	items, err := parse2000Monitor(pricing)
	require.NoError(t, err)
	require.Len(t, items, 4)
	require.Equal(t, 0.36, *items[0].RawPrice.EffectivePerRequest)
	require.InDelta(t, 0.54, *items[1].RawPrice.EffectivePerRequest, 1e-12)
	require.Equal(t, 4.0, *items[2].RawPrice.InputPerMillion)
	require.Equal(t, 16.0, *items[2].RawPrice.OutputPerMillion)
	require.Equal(t, "unknown", items[3].PriceStatus, "an expression cannot be guessed from the ratio")
	require.Nil(t, items[3].RawPrice.EffectiveInputPerMillion)
}

func TestUpstreamMonitorMappedDifferencesAndFailedSource(t *testing.T) {
	mapping := `{"local-alias":"upstream-a"}`
	base := "https://api.2000.run"
	channels := []*model.Channel{
		{Id: 1, Name: "upstream", Status: common.ChannelStatusEnabled, BaseURL: &base, Models: "local-alias,old-model", ModelMapping: &mapping},
		{Id: 2, Name: "disabled", Status: common.ChannelStatusManuallyDisabled, BaseURL: &base, Models: "disabled-model"},
	}
	routes, _ := monitorRoutes(channels)
	provider := upstreamMonitorProvider{Provider: "2000run", Status: "ok", Models: []upstreamMonitorModel{{Name: "upstream-a"}, {Name: "new-model"}}}
	monitorDiff(&provider, routes["2000run"])
	require.Equal(t, []string{"local-alias", "old-model"}, provider.LocalModels)
	require.Equal(t, []string{"new-model"}, provider.NewModels)
	require.Equal(t, []string{"old-model"}, provider.RemovedModels)
	require.Equal(t, "model_name_only", provider.DiffScope)
	require.False(t, provider.RemovalActionable)
	failed := upstreamMonitorProvider{Provider: "2000run", Status: "error"}
	monitorDiff(&failed, routes["2000run"])
	require.Empty(t, failed.RemovedModels, "a fetch failure must not propose mass removal")
}

func TestUpstreamMonitorChoosesOfficialTypeSafeChannelForInventory(t *testing.T) {
	unrelated := "https://other.example.com"
	official := "https://api.typesafe.ai"
	_, channel := monitorRoutes([]*model.Channel{
		{Id: 1, Name: "TypeSafe proxy", Status: common.ChannelStatusEnabled, BaseURL: &unrelated, Models: "jev-latest"},
		{Id: 2, Name: "TypeSafe official", Status: common.ChannelStatusEnabled, BaseURL: &official, Models: "jev-latest"},
	})
	require.NotNil(t, channel)
	require.Equal(t, 2, channel.Id)
	require.Equal(t, "example-key", monitorCleanKey(`"example-key"`))
}

func TestTypeSafeInventorySupportsOfficialAndCompatibleShapes(t *testing.T) {
	for _, source := range []string{
		`{"models":[{"name":"jev-latest","description":"decision model"}]}`,
		`{"data":[{"id":"jev-latest"}]}`,
	} {
		var inventory typeSafeInventory
		require.NoError(t, json.Unmarshal([]byte(source), &inventory))
		items, err := parseTypeSafeInventory(inventory)
		require.NoError(t, err)
		require.Len(t, items, 1)
		require.Equal(t, "jev-latest", items[0].Name)
		require.Equal(t, "unknown", items[0].PriceStatus)
		require.Nil(t, items[0].RawPrice.PerRequest)
	}
}

func TestUpstreamMonitorPriceChangesAreGroupSpecific(t *testing.T) {
	var previous, current []upstreamMonitorModel
	require.NoError(t, json.Unmarshal([]byte(`[
		{"name":"shared","group":"standard","group_id":"1","billing_type":"token","raw_price":{"effective_input_per_million":1}},
		{"name":"shared","group":"premium","group_id":"2","billing_type":"token","raw_price":{"effective_input_per_million":2}}
	]`), &previous))
	require.NoError(t, json.Unmarshal([]byte(`[
		{"name":"shared","group":"premium","group_id":"2","billing_type":"token","raw_price":{"effective_input_per_million":3}},
		{"name":"shared","group":"standard","group_id":"1","billing_type":"token","raw_price":{"effective_input_per_million":1}},
		{"name":"new","group":"standard","group_id":"1","billing_type":"token","raw_price":{"effective_input_per_million":9}}
	]`), &current))
	changes := monitorPriceChanges(previous, current)
	require.Len(t, changes, 1)
	require.Equal(t, "2", changes[0].GroupID)
	require.Equal(t, 2.0, *changes[0].OldPrice.EffectiveInputPerMillion)
	require.Equal(t, 3.0, *changes[0].NewPrice.EffectiveInputPerMillion)
}

func TestUpstreamMonitorTaskFlagsCompleteOutage(t *testing.T) {
	snapshot := upstreamMonitorSnapshot{CheckedAt: "2026-09-23T00:00:00Z", Providers: []upstreamMonitorProvider{
		{Provider: "yylx", Status: "error", Error: monitorString("upstream HTTP 503")},
		{Provider: "2000run", Status: "error", Error: monitorString("upstream request failed")},
		{Provider: "typesafe", Status: "partial", Error: monitorString("upstream HTTP 401")},
	}}
	result, err := summarizeUpstreamMonitorTask(snapshot)
	require.ErrorContains(t, err, "all upstream monitor sources failed")
	require.NotNil(t, result["providers"])
	snapshot.Providers[0].Status = "ok"
	snapshot.Providers[0].Models = []upstreamMonitorModel{{Name: "model-a"}}
	_, err = summarizeUpstreamMonitorTask(snapshot)
	require.NoError(t, err, "a single available source is a partial success")
}

func TestUpstreamMonitorFetchIsBoundedAndDoesNotLeakBearer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/large":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, strings.Repeat("x", monitorMaxBodyBytes+1))
		case "/redirect":
			http.Redirect(w, request, "/ok", http.StatusFound)
		case "/unauthorized":
			w.WriteHeader(http.StatusUnauthorized)
		default:
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"models":[{"name":"jev-latest"}]}`)
		}
	}))
	defer server.Close()
	client := newUpstreamMonitorClient()
	for _, path := range []string{"/large", "/redirect", "/unauthorized"} {
		var payload any
		err := fetchUpstreamMonitorJSON(context.Background(), client, server.URL+path, "secret-test-key", &payload)
		require.Error(t, err)
		require.NotContains(t, err.Error(), "secret-test-key")
	}
	var payload struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	require.NoError(t, fetchUpstreamMonitorJSON(context.Background(), client, server.URL+"/ok", "secret-test-key", &payload))
	require.Equal(t, "jev-latest", payload.Models[0].Name)
}

func TestUpstreamMonitorContinuesAfterOneProviderFails(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/yylx":
			_, _ = io.WriteString(w, `{"code":0,"data":{"groups":[{"id":1,"name":"standard","rate_multiplier":1,"models":[{"name":"model-y","pricing":{"billing_mode":"token","input_price":0.000001}}]}]}}`)
		case "/run":
			_, _ = io.WriteString(w, `{"success":true,"group_ratio":{"default":1},"data":[{"model_name":"model-r","quota_type":1,"model_price":0.1,"enable_groups":["default"]}]}`)
		default:
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(w, `{"error":"unauthorized"}`)
		}
	}))
	defer server.Close()
	snapshot := collectUpstreamMonitor(context.Background(), newUpstreamMonitorClient(), nil, "secret-test-key", time.Now(),
		[3]string{server.URL + "/yylx", server.URL + "/run", server.URL + "/typesafe"})
	require.Equal(t, "ok", snapshot.Providers[0].Status)
	require.Equal(t, "ok", snapshot.Providers[1].Status)
	require.Equal(t, "partial", snapshot.Providers[2].Status)
	require.NotNil(t, snapshot.Providers[2].Error)
	require.Empty(t, snapshot.Providers[2].RemovedModels)
	encoded, err := json.Marshal(snapshot)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "secret-test-key")
}

func TestUpstreamMonitorTypeSafeInventorySuccessIsNotPriceFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/typesafe" {
			_, _ = io.WriteString(w, `{"models":[{"name":"jev-latest"}]}`)
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	snapshot := collectUpstreamMonitor(context.Background(), newUpstreamMonitorClient(), nil, "test-key", time.Now(), [3]string{server.URL + "/yylx", server.URL + "/run", server.URL + "/typesafe"})
	require.Equal(t, "ok", snapshot.Providers[2].Status)
	require.Nil(t, snapshot.Providers[2].Error)
	require.NotNil(t, snapshot.Providers[2].Notice)
	require.Equal(t, "unknown", snapshot.Providers[2].Models[0].PriceStatus)
}
