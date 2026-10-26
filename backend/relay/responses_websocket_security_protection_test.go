package relay

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

const securityWSTestModel = "independent-security-ws-model"
const securityWSTestUID = 742
const securityWSTestIP = "8.8.8.8"

func setupResponsesWSSecurityProtection(t *testing.T) (*gorm.DB, *gin.Context) {
	t.Helper()
	require.NoError(t, i18n.Init())
	db := setupRelayChannelDB(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Model{}))
	require.NoError(t, model.InitSecurityProtection(db))
	require.NoError(t, db.Create(&model.User{Id: securityWSTestUID, Username: "independent-security-ws-user", Password: "synthetic-test-placeholder", AffCode: "independent-security-ws", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, CreatedAt: time.Now().Add(-48 * time.Hour).Unix(), Quota: 100000000}).Error)
	require.NoError(t, db.Create(&model.Model{ModelName: securityWSTestModel, Status: 1}).Error)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	c.Request.RemoteAddr = securityWSTestIP + ":54000"
	c.Set(common.RequestIdKey, "independent-ws-recheck")
	common.SetContextKey(c, constant.ContextKeyUserId, securityWSTestUID)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, "default")
	require.Nil(t, checkResponsesWSModelAccess(c, securityWSTestModel), "admitted before the later restriction")
	return db, c
}

// This exercises runCall itself with a pre-existing upstream socket and pinned
// model/channel. A restriction created after connection setup must win before
// channel restoration, PrepareRequestBilling, or any upstream socket write.
func TestResponsesWSSecurityProtectionEstablishedPinnedConnectionRejectsNewRestriction(t *testing.T) {
	for _, subject := range []string{"user", "ip"} {
		t.Run(subject, func(t *testing.T) {
			db, c := setupResponsesWSSecurityProtection(t)
			target, peer, cleanup := newTestWebSocketPair(t)
			defer cleanup()
			channel := &model.Channel{Name: "independent-security-established", Key: "synthetic-placeholder", Status: common.ChannelStatusEnabled, Type: constant.ChannelTypeOpenAI, Models: securityWSTestModel, Group: "default"}
			channel.SetSetting(dto.ChannelSettings{ResponsesWebSocketEnabled: true})
			require.NoError(t, db.Create(channel).Error)
			session := &responsesWSSession{ctx: context.Background(), target: target, lockedModel: securityWSTestModel, lockedChannelID: channel.Id, lockedGroup: "default", lockedKey: channel.Key}
			input := model.SecurityProtectionBanInput{SubjectType: subject, DurationSeconds: 60, Reason: "independent integration test"}
			if subject == "user" {
				input.UserID = securityWSTestUID
				input.Scope = "account"
			} else {
				input.IP = securityWSTestIP
				input.Scope = "ip"
			}
			_, err := model.CreateSecurityProtectionBan(input, 999, "9.9.9.9")
			require.NoError(t, err)
			apiErr := session.runCall(c, &responsesWSCallState{}, responsesWSCreateRequest{Request: dto.OpenAIResponsesRequest{Model: securityWSTestModel}})
			require.NotNil(t, apiErr)
			require.Equal(t, http.StatusForbidden, apiErr.StatusCode)
			require.Equal(t, types.ErrorCodeAccessDenied, apiErr.GetErrorCode())
			require.False(t, service.ShouldRetryRelayError(c, apiErr, 2), "security rejection must not retry another channel")
			require.NoError(t, peer.SetReadDeadline(time.Now().Add(80*time.Millisecond)))
			_, _, readErr := peer.ReadMessage()
			var timeout net.Error
			require.ErrorAs(t, readErr, &timeout)
			require.True(t, timeout.Timeout(), "no response.create was forwarded upstream")
			var after model.User
			require.NoError(t, db.First(&after, securityWSTestUID).Error)
			require.Equal(t, 100000000, after.Quota)
			require.Zero(t, after.UsedQuota)
			require.Zero(t, after.RequestCount)
			var events int64
			require.NoError(t, db.Model(&model.SecurityProtectionEvent{}).Where("user_id = ? AND request_id = ? AND scope = ? AND decision = ?", securityWSTestUID, "independent-ws-recheck", "account", "denied").Count(&events).Error)
			require.EqualValues(t, 1, events, "same-request audit survives denial")
		})
	}
}

func TestResponsesWSSecurityProtectionCheckinRestrictionStaysNarrowAndNativeStatusStillWins(t *testing.T) {
	db, c := setupResponsesWSSecurityProtection(t)
	_, err := model.CreateSecurityProtectionBan(model.SecurityProtectionBanInput{SubjectType: "user", UserID: securityWSTestUID, Scope: "checkin", DurationSeconds: 60, Reason: "only reward abuse review"}, 999, "9.9.9.9")
	require.NoError(t, err)
	require.Nil(t, checkResponsesWSModelAccess(c, securityWSTestModel), "reward restriction must preserve normal model access")
	require.NoError(t, db.Model(&model.User{}).Where("id = ?", securityWSTestUID).Update("status", common.UserStatusDisabled).Error)
	apiErr := checkResponsesWSModelAccess(c, securityWSTestModel)
	require.NotNil(t, apiErr)
	require.Equal(t, http.StatusForbidden, apiErr.StatusCode)
	require.Equal(t, types.ErrorCodeAccessDenied, apiErr.GetErrorCode())
}

func TestResponsesWSSecurityProtectionRevocationDoesNotBypassModelPublication(t *testing.T) {
	db, c := setupResponsesWSSecurityProtection(t)
	ban, err := model.CreateSecurityProtectionBan(model.SecurityProtectionBanInput{SubjectType: "user", UserID: securityWSTestUID, Scope: "account", DurationSeconds: 60, Reason: "temporary security review"}, 999, "9.9.9.9")
	require.NoError(t, err)
	require.NotNil(t, checkResponsesWSModelAccess(c, securityWSTestModel))
	_, err = model.RevokeSecurityProtectionBan(ban.ID, "review finished", 999)
	require.NoError(t, err)
	require.Nil(t, checkResponsesWSModelAccess(c, securityWSTestModel))
	require.NoError(t, db.Model(&model.Model{}).Where("model_name = ?", securityWSTestModel).Update("status", 0).Error)
	apiErr := checkResponsesWSModelAccess(c, securityWSTestModel)
	require.NotNil(t, apiErr)
	require.Equal(t, http.StatusNotFound, apiErr.StatusCode)
	require.Equal(t, types.ErrorCodeModelUnavailable, apiErr.GetErrorCode())
	require.False(t, service.ShouldRetryRelayError(c, apiErr, 2))
}

func TestResponsesWSSecurityProtectionAutomaticExpiryAndFallbackUID(t *testing.T) {
	db, c := setupResponsesWSSecurityProtection(t)
	view, err := model.GetSecurityProtectionConfig()
	require.NoError(t, err)
	config := view.Config
	config.Enabled = true
	config.Mode = "enforce"
	_, err = model.UpdateSecurityProtectionConfig(view.Revision, config, 999)
	require.NoError(t, err)
	now := time.Now().Unix()
	ban := &model.SecurityProtectionBan{SubjectType: "user", UserID: securityWSTestUID, Scope: "account", Source: "automatic", Rule: "synthetic_automatic", CreatedAt: now, ExpiresAt: now + 60}
	require.NoError(t, db.Create(ban).Error)
	// App-style contexts can have only id instead of ContextKeyUserId.
	delete(c.Keys, string(constant.ContextKeyUserId))
	c.Set("id", securityWSTestUID)
	apiErr := checkResponsesWSModelAccess(c, securityWSTestModel)
	require.NotNil(t, apiErr)
	require.Equal(t, http.StatusForbidden, apiErr.StatusCode)
	require.NoError(t, db.Model(ban).Update("expires_at", now-1).Error)
	require.Nil(t, checkResponsesWSModelAccess(c, securityWSTestModel), "TTL expiration must work without cleanup")
	require.NoError(t, db.Model(ban).Update("expires_at", now+60).Error)
	view, err = model.GetSecurityProtectionConfig()
	require.NoError(t, err)
	config = view.Config
	config.Mode = "observe"
	_, err = model.UpdateSecurityProtectionConfig(view.Revision, config, 999)
	require.NoError(t, err)
	require.Nil(t, checkResponsesWSModelAccess(c, securityWSTestModel), "observe ignores existing automatic actions")
}
