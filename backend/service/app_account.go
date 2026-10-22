package service

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

var appPKCEVerifier = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)
var appPKCEChallenge = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

const AppNativeLoginMethod = "skivu_app:password"

func AppAccountBetaEnabled() bool { return os.Getenv("SKYMONI_APP_ACCOUNT_BETA_ENABLED") == "1" }

func IsAppNativeLoginMethod(method string) bool { return strings.HasPrefix(method, "skivu_app:") }

// The shared primary/MFA login pipeline owns the LoginMethod. A caller cannot
// convert an ordinary browser login flow by adding a request flag/header.
func RequireAppNativeLoginFlow(token string) error {
	flow, err := model.GetAuthFlow(token, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeLoginVerification})
	if err != nil {
		return err
	}
	var payload loginFlowPayload
	if common.UnmarshalJsonStr(flow.Payload, &payload) != nil || !IsAppNativeLoginMethod(payload.LoginMethod) {
		return model.ErrAuthFlowInvalid
	}
	return nil
}

// Convert only an already verified, counted native-origin login session. Its
// dashboard JWT/refresh secret stay server-side and are never returned or set
// as cookies. This preserves the site's complete primary/MFA/risk pipeline.
func BindAppNativeLogin(bundle *AuthBundle, user *model.User) (string, *model.AppAccountSession, error) {
	if bundle == nil || user == nil || !IsAppNativeLoginMethod(bundle.Session.LoginMethod) {
		return "", nil, model.ErrAuthFlowInvalid
	}
	identity, err := ParseAccessToken(bundle.AccessToken)
	if err != nil {
		return "", nil, err
	}
	token, err := AppBetaRandom(32)
	if err != nil {
		return "", nil, err
	}
	native := model.AppAccountSession{TokenHash: AppBetaHash(token), SID: identity.SessionID, UserID: identity.UserID, DeviceName: "Skivu Android", ExpiresAt: bundle.Session.ExpiresAt, CreatedAt: time.Now().Unix()}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		if err := model.ValidateAuthSessionWithTx(tx, identity); err != nil {
			return err
		}
		if identity.UserID != user.Id {
			return model.ErrAuthFlowInvalid
		}
		result := tx.Model(&model.UserSession{}).Where("sid = ? AND user_id = ? AND login_method = ?", identity.SessionID, identity.UserID, bundle.Session.LoginMethod).Update("login_method", "skivu_app")
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return model.ErrAuthFlowInvalid
		}
		return tx.Create(&native).Error
	})
	if err != nil {
		_, _ = model.RevokeUserSession(user.Id, identity.SessionID, "app_login_issue_failed")
		return "", nil, err
	}
	return token, &native, nil
}

func AppAccountChallenge(verifier string) (string, error) {
	if !appPKCEVerifier.MatchString(verifier) {
		return "", model.ErrAppGrantInvalid
	}
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:]), nil
}
func CreateAppAccountGrant(challenge, deviceName string) (string, string, error) {
	if !appPKCEChallenge.MatchString(challenge) {
		return "", "", model.ErrAppGrantInvalid
	}
	device, err := AppBetaRandom(32)
	if err != nil {
		return "", "", err
	}
	codeBytes, err := AppBetaRandom(12)
	if err != nil {
		return "", "", err
	}
	// Human-readable code is independent of the private polling device code.
	code := codeBytes
	now := time.Now().Unix()
	grant := model.AppAccountGrant{DeviceHash: AppBetaHash(device), CodeHash: AppBetaHash(code), Challenge: challenge, DeviceName: deviceName, State: "pending", CreatedAt: now, ExpiresAt: now + 600}
	err = model.DB.Create(&grant).Error
	return device, code, err
}
func ExchangeAppAccount(device, verifier, ip, userAgent string) (string, *model.AppAccountSession, error) {
	if len(device) != 43 {
		return "", nil, model.ErrAppGrantInvalid
	}
	challenge, err := AppAccountChallenge(verifier)
	if err != nil {
		return "", nil, err
	}
	token, err := AppBetaRandom(32)
	if err != nil {
		return "", nil, err
	}
	sid, err := AppBetaRandom(24)
	if err != nil {
		return "", nil, err
	}
	refresh, err := AppBetaRandom(32)
	if err != nil {
		return "", nil, err
	}
	now := time.Now().Unix()
	session := &model.UserSession{SID: sid, Version: 1, Status: model.UserSessionStatusActive, RefreshHash: hashRefreshSecret(refresh), IP: truncateAuthMetadata(ip, 64), UserAgent: truncateAuthMetadata("Skivu App: "+userAgent, 512), CreatedAt: now, LastActiveAt: now, ExpiresAt: now + int64(LoginSessionTTL/time.Second)}
	native, err := model.ExchangeAppAccountGrant(AppBetaHash(device), challenge, AppBetaHash(token), session)
	return token, native, err
}

func ValidateAppAccount(token string) (*model.AppAccountSession, *model.User, error) {
	if len(token) != 43 {
		return nil, nil, ErrLoginSessionInvalid
	}
	var native model.AppAccountSession
	if err := model.DB.First(&native, "token_hash = ? AND expires_at > ?", AppBetaHash(token), time.Now().Unix()).Error; err != nil {
		return nil, nil, ErrLoginSessionInvalid
	}
	session, err := model.GetUserSessionBySID(native.SID)
	if err != nil || session.UserID != native.UserID || session.LoginMethod != "skivu_app" || session.Status != model.UserSessionStatusActive || session.RevokedAt != 0 || session.ExpiresAt <= time.Now().Unix() {
		return nil, nil, ErrLoginSessionInvalid
	}
	user, err := model.GetUserById(native.UserID, false)
	if err != nil || user.Status != common.UserStatusEnabled || user.AuthVersion != session.UserAuthVersion {
		return nil, nil, ErrLoginSessionInvalid
	}
	return &native, user, nil
}

func AppAccountErrorCode(err error) (int, string) {
	switch {
	case errors.Is(err, model.ErrAppGrantPending):
		return 403, "AUTHORIZATION_PENDING"
	case errors.Is(err, model.ErrAppGrantDenied):
		return 403, "ACCESS_DENIED"
	case errors.Is(err, model.ErrAppGrantExpired):
		return 400, "EXPIRED_TOKEN"
	case errors.Is(err, model.ErrAppGrantSlow):
		return 429, "SLOW_DOWN"
	case errors.Is(err, model.ErrUserSessionLimit):
		return 429, "AUTH_SESSION_LIMIT"
	case errors.Is(err, model.ErrUserSessionIssuanceLimit):
		return 429, "AUTH_ISSUANCE_LIMIT"
	case errors.Is(err, model.ErrAppGrantInvalid):
		return 400, "INVALID_REQUEST"
	case errors.Is(err, model.ErrUserSessionInactive), errors.Is(err, ErrLoginSessionInvalid):
		return 401, "APP_SESSION_INVALID"
	default:
		return 503, "APP_SERVICE_UNAVAILABLE"
	}
}
