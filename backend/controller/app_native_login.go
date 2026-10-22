package controller

import (
	"bytes"
	"io"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func AppNativeLoginOptions(c *gin.Context) {
	encryption := gin.H{"enabled": common.PasswordLoginEncryptionEnabled}
	if common.PasswordLoginEncryptionEnabled {
		kid, key := common.PasswordEncryptionPublicKey()
		if kid == "" || key == "" {
			appAccountJSON(c, nil, model.ErrDatabase)
			return
		}
		encryption["kid"] = kid
		encryption["public_key"] = key
		encryption["algorithm"] = "RSA-OAEP-SHA256"
		encryption["mgf1_hash"] = "SHA256"
	}
	appAccountJSON(c, gin.H{"password_login_enabled": common.PasswordLoginEnabled, "encryption": encryption, "captcha": gin.H{"required": common.TurnstileCheckEnabled, "site_key": common.TurnstileSiteKey}, "browser_fallback_supported": true}, nil)
}
func AppNativeLogin(c *gin.Context) {
	c.Request.Header.Del(service.CommunityScopeHeader)
	c.Set("community_scope", false)
	c.Set("login_method", service.AppNativeLoginMethod)
	Login(c)
}
func AppNativeVerifyLogin(c *gin.Context) {
	c.Request.Header.Del(service.CommunityScopeHeader)
	c.Set("community_scope", false)
	var body struct {
		FlowToken string `json:"flow_token"`
		Method    string `json:"method"`
		Code      string `json:"code"`
	}
	if c.ShouldBindJSON(&body) != nil || service.RequireAppNativeLoginFlow(body.FlowToken) != nil {
		appAccountJSON(c, nil, model.ErrAppGrantInvalid)
		return
	}
	data, err := common.Marshal(body)
	if err != nil {
		appAccountJSON(c, nil, err)
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(data))
	c.Request.ContentLength = int64(len(data))
	VerifyLogin(c)
}
