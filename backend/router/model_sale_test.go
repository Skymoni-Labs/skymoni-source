package router

import (
	"bytes"
	"encoding/json"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestModelSaleRootPermissionsAndPublicRedaction(t *testing.T) {
	e, _ := setupCreatorHome(t, t.TempDir())
	require.NoError(t, model.DB.AutoMigrate(&model.ModelSale{}))
	registerModelSaleRoutes(e.Group("/api"))
	request := func(method, path, token, origin string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "http://localhost/api/model-sales"+path, bytes.NewBufferString(`{}`))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec
	}
	require.Equal(t, 401, request("GET", "", "", " ").Code)
	require.Equal(t, 403, request("GET", "", homeTestCreator, "").Code)
	require.Equal(t, 403, request("POST", "", homeTestCreator, "http://localhost").Code)
	require.Equal(t, 403, request("POST", "/costs/refresh", homeTestCreator, "http://localhost").Code)
	require.Equal(t, 403, request("POST", "/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/mail-draft", homeTestCreator, "http://localhost").Code)
	require.Equal(t, 403, request("GET", "/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/check", homeTestCreator, "").Code)
	require.Equal(t, 400, request("POST", "", homeTestAdmin, "http://localhost").Code)
	id := strings.Repeat("c", 32)
	sale := model.ModelSale{ID: id, Title: "public sale", Status: "draft", StartAt: time.Now().Unix() + 600, EndAt: time.Now().Unix() + 3600, Config: model.ModelSaleConfig{Models: []string{"private-template-model"}, Discount: 5, Policy: model.DefaultModelSalePolicy(), CountdownMode: "end"}, Message: "private internal reason", Plan: []model.ModelSalePlan{{Name: "private-template-model", OriginalVersion: "private-version"}}}
	require.NoError(t, model.DB.Create(&sale).Error)
	rec := request("GET", "/public/"+id, "", "")
	require.Equal(t, 200, rec.Code)
	body := rec.Body.String()
	require.NotContains(t, body, "private")
	require.NotContains(t, body, "policy")
	require.NotContains(t, body, "cost")
	require.NotContains(t, body, "plan")
	var value map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &value))
	require.Equal(t, 200, request("GET", "", homeTestAdmin, "").Code)
	list := request("GET", "/public", "", "")
	require.Equal(t, 200, list.Code)
	require.NotContains(t, list.Body.String(), "private")
	require.NotContains(t, list.Body.String(), "minimum_margin")
}
