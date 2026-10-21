package controller

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/service"
)

// Connection tests execute the active decision plugin against the selected
// provider. Like other provider probes, they consume upstream usage; they do
// not create a downstream user request or debit a user's Moni wallet.
func testTypeSafeChannel(parent context.Context, channel *model.Channel, testModel string, stream bool) testResult {
	if stream {
		return testResult{localErr: fmt.Errorf("Jev evaluates decisions synchronously; streaming is not supported")}
	}
	if testModel == "" {
		testModel = "jev-latest"
	}
	if !slices.Contains(strings.Split(channel.Models, ","), testModel) {
		return testResult{localErr: fmt.Errorf("selected model is not enabled on this TypeSafe channel")}
	}
	if channel.GetBaseURL() != "https://api.typesafe.ai" {
		return testResult{localErr: fmt.Errorf("TypeSafe connection test requires the official provider URL")}
	}
	plugin, ok := jsplugin.DefaultRegistry.Get("typesafe")
	if !ok {
		return testResult{localErr: fmt.Errorf("TypeSafe decision plugin is not enabled")}
	}
	ctx, cancel := context.WithTimeout(parent, 30*time.Second)
	defer cancel()
	key, _, keyErr := channel.GetNextEnabledKey()
	if keyErr != nil {
		return testResult{localErr: fmt.Errorf("no enabled TypeSafe provider key")}
	}
	body := map[string]any{
		"model": testModel, "state": "A customer cannot log in and needs urgent technical help.",
		"questions": map[string]any{
			"urgent":     map[string]any{"type": "noul", "instructions": "Does the customer need urgent help?"},
			"department": map[string]any{"type": "choice", "instructions": "Which team should handle this?", "criteria": map[string]any{"support": "Technical support", "sales": "Sales enquiries"}},
			"severity":   map[string]any{"type": "score", "instructions": "How much is the customer blocked?", "criteria": []string{"Not blocked", "Completely blocked"}},
		},
	}
	driver := map[string]any{"model": testModel, "upstreamModel": testModel, "baseUrl": channel.GetBaseURL(), "apiKey": key, "requestBody": body, "publicTaskId": "connection-test"}
	value, err := plugin.Engine.Call(ctx, "buildSubmitRequest", driver)
	if err != nil {
		return testResult{localErr: fmt.Errorf("TypeSafe decision request validation failed")}
	}
	descriptor, ok := value.(map[string]any)
	if !ok || descriptor["url"] != "https://api.typesafe.ai/v1/systemone" {
		return testResult{localErr: fmt.Errorf("invalid TypeSafe decision test endpoint")}
	}
	payload, err := common.Marshal(descriptor["body"])
	if err != nil {
		return testResult{localErr: fmt.Errorf("cannot encode TypeSafe test request")}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.typesafe.ai/v1/systemone", bytes.NewReader(payload))
	if err != nil {
		return testResult{localErr: err}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	client, err := service.GetHttpClientWithProxySettings(channel.GetSetting().Proxy, channel.GetSetting())
	if err != nil {
		return testResult{localErr: fmt.Errorf("invalid TypeSafe channel proxy settings")}
	}
	probeClient := *client
	probeClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := probeClient.Do(req)
	if err != nil {
		return testResult{localErr: fmt.Errorf("TypeSafe connection failed or timed out")}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return testResult{localErr: fmt.Errorf("TypeSafe returned HTTP %d", response.StatusCode)}
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return testResult{localErr: fmt.Errorf("invalid TypeSafe response size")}
	}
	var decoded any
	if err = common.Unmarshal(data, &decoded); err != nil {
		return testResult{localErr: fmt.Errorf("TypeSafe returned invalid JSON")}
	}
	_, err = plugin.Engine.Call(ctx, "parseSubmitResponse", driver, map[string]any{"statusCode": response.StatusCode, "body": decoded})
	if err != nil {
		return testResult{localErr: fmt.Errorf("TypeSafe returned an invalid decision response")}
	}
	return testResult{}
}
