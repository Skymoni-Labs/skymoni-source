package controller

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestCreateCustomRedemptionKey(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	defer sqlDB.Close()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	defer func() { model.DB, model.LOG_DB = previousDB, previousLogDB }()
	previousRedis, previousGift := common.RedisEnabled, common.QuotaForNewUser
	common.RedisEnabled, common.QuotaForNewUser = false, 0
	defer func() { common.RedisEnabled, common.QuotaForNewUser = previousRedis, previousGift }()
	require.NoError(t, db.AutoMigrate(&model.Redemption{}, &model.RedemptionClaim{}, &model.User{}, &model.Log{}, &model.AuditLog{}))
	payment := operation_setting.GetPaymentSetting()
	previousPayment := *payment
	defer func() { *payment = previousPayment }()
	payment.ComplianceConfirmed = true
	payment.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	router := gin.New()
	router.POST("/", func(c *gin.Context) { c.Set("id", 1) }, AddRedemption)
	create := func(key string, count int, reusable bool) map[string]any {
		body, err := json.Marshal(map[string]any{"name": "custom test", "key": key, "count": count, "quota": 100, "reusable": reusable, "max_claims": 2})
		require.NoError(t, err)
		if !reusable {
			body, _ = json.Marshal(map[string]any{"name": "custom test", "key": key, "count": count, "quota": 100})
		}
		response := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(response, req)
		var result map[string]any
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &result))
		return result
	}
	key := "彩蛋-SKY_2026"
	first := create("  "+key+"  ", 1, false)
	require.Equal(t, true, first["success"])
	require.Equal(t, []any{key}, first["data"])
	duplicate := create(key, 1, false)
	require.Equal(t, false, duplicate["success"])
	require.Equal(t, model.ErrRedemptionKeyExists.Error(), duplicate["message"])
	var code model.Redemption
	require.NoError(t, db.Where(map[string]any{"key": key}).First(&code).Error)
	require.NoError(t, db.Delete(&code).Error)
	require.Equal(t, false, create(key, 1, false)["success"], "soft-deleted keys remain reserved")
	for _, invalid := range []string{strings.Repeat("x", 33), "contains space", "a\nb", "a\u200bb"} {
		require.Equal(t, false, create(invalid, 1, false)["success"], invalid)
	}
	require.Equal(t, false, create("batch-key", 2, false)["success"])
	random := create("", 2, false)
	require.Equal(t, true, random["success"])
	randomKeys := random["data"].([]any)
	require.Len(t, randomKeys, 2)
	require.NotEqual(t, randomKeys[0], randomKeys[1])
	for _, k := range randomKeys {
		require.Len(t, k.(string), 32)
	}

	// A multibyte custom key remains redeemable through registration and wallet claims.
	sharedKey := strings.Repeat("福", 32)
	require.Equal(t, true, create(sharedKey, 1, true)["success"])
	user := model.User{Username: "custom-registration", Password: "test-password-123", Role: common.RoleCommonUser}
	require.NoError(t, user.InsertWithRedemption(0, sharedKey))
	_, err = model.Redeem(sharedKey, user.Id)
	require.ErrorIs(t, err, model.ErrRedemptionAlreadyClaimed)
	second := model.User{Username: "custom-wallet", Password: "unused", Role: common.RoleCommonUser}
	require.NoError(t, db.Create(&second).Error)
	quota, err := model.Redeem(sharedKey, second.Id)
	require.NoError(t, err)
	require.Equal(t, 100, quota)
}
