package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestSecurityProtectionControllerRootDefense(t *testing.T) {
	for _, h := range []gin.HandlerFunc{GetSecurityProtectionConfig, UpdateSecurityProtectionConfig, GetSecurityProtectionOverview, GetSecurityProtectionEvents, GetSecurityProtectionBans, CreateSecurityProtectionBan, RevokeSecurityProtectionBan} {
		for _, role := range []int{0, common.RoleCommonUser, common.RoleAdminUser} {
			r := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(r)
			c.Request = httptest.NewRequest(http.MethodGet, "/api/security-protection/config", nil)
			c.Set("role", role)
			h(c)
			require.Equal(t, http.StatusForbidden, r.Code)
		}
	}
}

func TestSecurityProtectionControllerConflictValidationAndStorageError(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "controller-security.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	prior := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = prior; conn, _ := db.DB(); _ = conn.Close() })
	require.NoError(t, model.InitSecurityProtection(db))
	v, err := model.GetSecurityProtectionConfig()
	require.NoError(t, err)
	request := func(revision int64, config any) *httptest.ResponseRecorder {
		body, err := json.Marshal(map[string]any{"expected_revision": revision, "config": config})
		require.NoError(t, err)
		r := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(r)
		c.Request = httptest.NewRequest(http.MethodPut, "/api/security-protection/config", bytes.NewReader(body))
		c.Request.Header.Set("Content-Type", "application/json")
		c.Set("role", common.RoleRootUser)
		c.Set("id", 999)
		UpdateSecurityProtectionConfig(c)
		return r
	}
	r := request(v.Revision+5, v.Config)
	require.Equal(t, http.StatusConflict, r.Code)
	require.Contains(t, r.Body.String(), "security_revision_conflict")
	invalid := v.Config
	invalid.Mode = "invalid"
	r = request(v.Revision, invalid)
	require.Equal(t, http.StatusBadRequest, r.Code)
	require.NoError(t, db.Migrator().DropTable(&model.SecurityProtectionPolicy{}))
	r = request(v.Revision, v.Config)
	require.Equal(t, http.StatusServiceUnavailable, r.Code)
	require.NotContains(t, r.Body.String(), "no such table")
	require.NotContains(t, r.Body.String(), "security_protection_policies")
}
