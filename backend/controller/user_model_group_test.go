package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestUserModelGroupRequestValidation(t *testing.T) {
	visible := map[string]struct{}{"gpt-5.6-sol": {}, "jev": {}}
	cases := []struct {
		name       string
		body       string
		wantOK     bool
		wantStatus int
	}{
		{"valid", `{"name":" 常用 ","model_names":["gpt-5.6-sol","jev"]}`, true, http.StatusOK},
		{"empty collection", `{"name":"稍后添加","model_names":[]}`, true, http.StatusOK},
		{"unknown model", `{"name":"常用","model_names":["disabled-model"]}`, false, http.StatusBadRequest},
		{"duplicate model", `{"name":"常用","model_names":["jev","jev"]}`, false, http.StatusBadRequest},
		{"missing model names", `{"name":"常用"}`, false, http.StatusBadRequest},
		{"blank name", `{"name":"  ","model_names":[]}`, false, http.StatusBadRequest},
		{"control name", "{\"name\":\"bad\\nname\",\"model_names\":[]}", false, http.StatusBadRequest},
		{"too many models", `{"name":"常用","model_names":[` + strings.Repeat(`"jev",`, model.MaxUserModelGroupModels) + `"jev"]}`, false, http.StatusBadRequest},
		{"malformed", `{`, false, http.StatusBadRequest},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(response)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/user/self/model-groups", strings.NewReader(test.body))
			c.Request.Header.Set("Content-Type", "application/json")
			name, names, ok := bindUserModelGroupRequest(c, visible)
			require.Equal(t, test.wantOK, ok)
			if ok {
				require.NotEmpty(t, name)
				require.NotNil(t, names)
			} else {
				require.Equal(t, test.wantStatus, response.Code)
			}
		})
	}
}

func TestUserModelGroupResponseHidesUnavailableModels(t *testing.T) {
	group := &model.UserModelGroup{Id: 42, Name: "写代码", ModelNames: `["gpt-5.6-sol","disabled-model"]`}
	item, err := userModelGroupJSON(group, map[string]struct{}{"gpt-5.6-sol": {}})
	require.NoError(t, err)
	require.Equal(t, 42, item.ID)
	require.Equal(t, []string{"gpt-5.6-sol"}, item.ModelNames)
	group.ModelNames = "invalid-json"
	_, err = userModelGroupJSON(group, map[string]struct{}{})
	require.Error(t, err)
}
