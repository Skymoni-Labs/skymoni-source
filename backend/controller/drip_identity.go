package controller

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const dripClientID = "drip-desktop"

var dripChallengePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
var dripVerifierPattern = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)

type dripAuthorizationPayload struct {
	Challenge       string `json:"challenge"`
	RedirectURI     string `json:"redirect_uri"`
	UserAuthVersion int64  `json:"auth_version"`
	SessionVersion  int64  `json:"session_version"`
}

func validDripRedirect(raw string) bool {
	uri, err := url.Parse(raw)
	if err != nil || uri.Scheme != "http" || uri.Hostname() != "127.0.0.1" || uri.Path != "/callback" || uri.User != nil || uri.RawQuery != "" || uri.Fragment != "" {
		return false
	}
	port, err := strconv.Atoi(uri.Port())
	return err == nil && port > 0 && port <= 65535
}

func StartDripAuthorization(c *gin.Context) {
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "请使用中转站网页会话登录"})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2048)
	var request struct {
		ClientID      string `json:"client_id"`
		RedirectURI   string `json:"redirect_uri"`
		CodeChallenge string `json:"code_challenge"`
		Method        string `json:"code_challenge_method"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.ClientID != dripClientID || !validDripRedirect(request.RedirectURI) ||
		request.Method != "S256" || !dripChallengePattern.MatchString(request.CodeChallenge) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Drip 授权参数无效"})
		return
	}
	payload, err := json.Marshal(dripAuthorizationPayload{
		Challenge: request.CodeChallenge, RedirectURI: request.RedirectURI,
		UserAuthVersion: identity.UserAuthVersion, SessionVersion: identity.SessionVersion,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "授权暂时不可用"})
		return
	}
	code, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose: model.AuthFlowPurposeDripAuthorization, Provider: dripClientID,
		UserId: identity.UserID, SessionId: identity.SessionID,
		Payload: string(payload), ExpiresAt: time.Now().Add(90 * time.Second),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "授权暂时不可用"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"code": code, "redirect_uri": request.RedirectURI}})
}

func ExchangeDripAuthorization(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2048)
	var request struct {
		ClientID    string `json:"client_id"`
		Code        string `json:"code"`
		Verifier    string `json:"code_verifier"`
		RedirectURI string `json:"redirect_uri"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.ClientID != dripClientID || !dripChallengePattern.MatchString(request.Code) ||
		!dripVerifierPattern.MatchString(request.Verifier) || !validDripRedirect(request.RedirectURI) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "授权码无效或已失效"})
		return
	}
	digest := sha256.Sum256([]byte(request.Verifier))
	challenge := base64.RawURLEncoding.EncodeToString(digest[:])
	var subject int
	var username string
	var avatar string
	_, err := model.ConsumeAuthFlowWithAction(request.Code, model.AuthFlowMatch{
		Purpose: model.AuthFlowPurposeDripAuthorization, Provider: dripClientID,
	}, func(tx *gorm.DB, flow *model.AuthFlow) error {
		var payload dripAuthorizationPayload
		if json.Unmarshal([]byte(flow.Payload), &payload) != nil || payload.RedirectURI != request.RedirectURI ||
			subtle.ConstantTimeCompare([]byte(payload.Challenge), []byte(challenge)) != 1 {
			return model.ErrAuthFlowInvalid
		}
		identity := model.AuthSessionIdentity{
			UserID: flow.UserId, SessionID: flow.SessionId,
			UserAuthVersion: payload.UserAuthVersion, SessionVersion: payload.SessionVersion,
		}
		if err := model.ValidateAuthSessionWithTx(tx, identity); err != nil {
			return err
		}
		var user model.User
		if err := tx.First(&user, flow.UserId).Error; err != nil {
			return err
		}
		subject, username = user.Id, user.Username
		candidate := user.GetSetting().Avatar
		if len(candidate) <= 180000 && strings.HasPrefix(candidate, "data:image/jpeg;base64,") {
			avatar = candidate
		}
		return nil
	})
	if err != nil {
		status := http.StatusBadRequest
		if !errors.Is(err, model.ErrAuthFlowInvalid) && !errors.Is(err, model.ErrAuthFlowExpired) && !errors.Is(err, model.ErrAuthFlowConsumed) && !errors.Is(err, model.ErrUserSessionInactive) && !errors.Is(err, gorm.ErrRecordNotFound) {
			status = http.StatusInternalServerError
		}
		c.JSON(status, gin.H{"success": false, "message": "授权码无效或已失效"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"sub": strconv.Itoa(subject), "username": username, "avatar": avatar}})
}
