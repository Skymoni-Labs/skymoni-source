package service

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSupplierVerificationRelayErrorRetainsRawAndPolicy(t *testing.T) {
	for _, raw := range []string{
		`{"code":11128,"msg":"conversation id missing","requestId":"vendor-id"}`,
		`{"error":{"message":"{\"code\":11128,\"msg\":\"conversation id missing\",\"requestId\":\"vendor-id\"}","type":"invalid_request_error"}}`,
	} {
		response := &http.Response{StatusCode: 400, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(raw))}
		err := RelayErrorHandler(context.Background(), response, false)
		if err.Error() != raw || err.StatusCode != 400 {
			t.Fatalf("raw error lost: %v", err)
		}
		if err.GetErrorCode() != "unknown_error" && err.GetErrorCode() != types.ErrorCodeBadResponseStatusCode {
			t.Fatalf("routing code changed: %s", err.GetErrorCode())
		}
		if err.ToOpenAIError().Code != string(types.ErrorCodeModelServiceError) {
			t.Fatal("public error not translated")
		}
	}
}

func TestSupplierVerificationLogVisibility(t *testing.T) {
	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldType := common.MainDatabaseType()
	oldCache, oldRedis := common.MemoryCacheEnabled, common.RedisEnabled
	oldLog, oldDisable := constant.ErrorLogEnabled, common.AutomaticDisableChannelEnabled
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLogDB
		common.SetMainDatabaseType(oldType)
		common.MemoryCacheEnabled, common.RedisEnabled = oldCache, oldRedis
		constant.ErrorLogEnabled, common.AutomaticDisableChannelEnabled = oldLog, oldDisable
	})
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	connection, err := database.DB()
	require.NoError(t, err)
	connection.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = connection.Close() })
	model.DB, model.LOG_DB = database, database
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.MemoryCacheEnabled, common.RedisEnabled = false, false
	constant.ErrorLogEnabled, common.AutomaticDisableChannelEnabled = true, false
	require.NoError(t, database.AutoMigrate(&model.User{}, &model.Log{}))
	user := &model.User{Username: "error-view-fixture", Setting: "{}"}
	require.NoError(t, database.Create(user).Error)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set("id", user.Id)
	c.Set("username", user.Username)
	c.Set("original_model", "deepseek-v4.1-flash-low")
	c.Set("group", "default")
	c.Set(common.RequestIdKey, "gateway-test-123")
	raw := `{"code":11128,"msg":"conversation id missing","requestId":"vendor-private-id"}`
	apiError := types.WithOpenAIError(types.OpenAIError{Message: raw, Type: "invalid_request_error"}, 400)
	ProcessChannelError(c, types.ChannelError{ChannelId: 1, ChannelName: "fixture", AutoBan: false}, apiError, nil)
	var stored model.Log
	require.NoError(t, database.First(&stored).Error)
	require.Equal(t, types.ModelServiceErrorMessage, stored.Content)
	var metadata map[string]any
	require.NoError(t, json.Unmarshal([]byte(stored.Other), &metadata))
	require.Equal(t, string(types.ErrorCodeModelServiceError), metadata["error_code"])
	require.Contains(t, metadata["admin_info"].(map[string]any)["upstream_error"], "vendor-private-id")
	visible, _, err := model.GetUserLogs(user.Id, 5, 0, 0, "", "", 0, 20, "", "", "")
	require.NoError(t, err)
	require.Len(t, visible, 1)
	require.NotContains(t, visible[0].Other, "admin_info")
	require.NotContains(t, visible[0].Other, "11128")
	require.NotContains(t, visible[0].Other, "vendor-private-id")
	require.NotContains(t, visible[0].Content, "上游")
}
