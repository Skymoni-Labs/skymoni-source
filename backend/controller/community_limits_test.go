package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestCommunitySessionLimitIsolation(t *testing.T) {
	user, _ := setupSecurityEnrollmentTest(t)
	communityTestSchema(t)
	oldActive, oldIssue := common.UserSessionActiveLimit, common.UserSessionIssuanceLimit
	t.Cleanup(func() { common.UserSessionActiveLimit = oldActive; common.UserSessionIssuanceLimit = oldIssue })
	common.UserSessionActiveLimit = 1
	common.UserSessionIssuanceLimit = 100
	community, err := service.CreateLoginSession(user.Id, "community:relay-authorization", "127.0.0.1", "community")
	require.NoError(t, err)
	_, err = service.CreateLoginSession(user.Id, "community:password", "127.0.0.1", "another")
	require.ErrorIs(t, err, model.ErrUserSessionLimit)
	_, err = service.CreateLoginSession(user.Id, "password", "127.0.0.1", "relay")
	require.ErrorIs(t, err, model.ErrUserSessionLimit)
	_, err = model.RevokeUserSession(user.Id, community.Session.SID, "test")
	require.NoError(t, err)
	common.UserSessionActiveLimit = 10
	common.UserSessionIssuanceLimit = 1
	_, err = service.CreateLoginSession(user.Id, "community:password", "127.0.0.1", "community")
	require.ErrorIs(t, err, model.ErrUserSessionIssuanceLimit)
}
func TestCommunityVerifiedLoginLimitIsolation(t *testing.T) {
	user, _ := setupSecurityEnrollmentTest(t)
	communityTestSchema(t)
	oldActive, oldIssue := common.UserSessionActiveLimit, common.UserSessionIssuanceLimit
	t.Cleanup(func() { common.UserSessionActiveLimit = oldActive; common.UserSessionIssuanceLimit = oldIssue })
	common.UserSessionActiveLimit = 1
	common.UserSessionIssuanceLimit = 100
	require.NoError(t, model.AdmitCommunity(user.Id, ""))
	factor := &model.TwoFA{UserId: user.Id, Secret: "JBSWY3DPEHPK3PXP", IsEnabled: true}
	require.NoError(t, model.DB.Create(factor).Error)
	challenge, err := service.StartLoginVerification(user, "community:password", nil)
	require.NoError(t, err)
	require.NotNil(t, challenge)
	code, err := totp.GenerateCode(factor.Secret, time.Now())
	require.NoError(t, err)
	bundle, _, err := service.VerifyLoginCode(challenge.FlowToken, code, "127.0.0.1", "community-twofa")
	require.NoError(t, err)
	require.Equal(t, "community:password", bundle.Session.LoginMethod)
	active, err := model.CountActiveUserSessionsInScope(user.Id, time.Now().Unix(), "password")
	require.NoError(t, err)
	require.EqualValues(t, 1, active)
	active, err = model.CountActiveUserSessionsInScope(user.Id, time.Now().Unix(), "community:password")
	require.NoError(t, err)
	require.EqualValues(t, 1, active)
}
