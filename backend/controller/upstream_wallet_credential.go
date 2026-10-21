package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func walletCredentialHeaders(c *gin.Context) bool {
	c.Header("Cache-Control", "no-store, private")
	c.Header("Pragma", "no-cache")
	if c.GetInt("role") != common.RoleRootUser || c.GetInt("id") <= 0 {
		c.AbortWithStatusJSON(403, gin.H{"success": false, "message": "仅超级管理员可以查看账号密码"})
		return false
	}
	return true
}

// Wallet-secret transport remains available when encrypted account login is
// disabled. It does not change or enable the site's existing login protocol.
func GetUpstreamWalletEncryptionKey(c *gin.Context) {
	if !walletCredentialHeaders(c) {
		return
	}
	kid, public := common.PasswordEncryptionPublicKey()
	if kid == "" || public == "" {
		if model.InitPasswordEncryption() != nil {
			c.JSON(503, gin.H{"success": false, "message": "密码库加密暂时不可用"})
			return
		}
		kid, public = common.PasswordEncryptionPublicKey()
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"kid": kid, "public_key": public}})
}

func GetUpstreamWalletCredentialStatus(c *gin.Context) {
	if !walletCredentialHeaders(c) {
		return
	}
	id, _ := strconv.Atoi(c.Param("id"))
	var row model.UpstreamWalletCredential
	var count int64
	if id <= 0 || model.DB.Model(&model.UpstreamWallet{}).Where("id = ?", id).Count(&count).Error != nil || count != 1 {
		c.JSON(404, gin.H{"success": false, "message": "账户不存在"})
		return
	}
	if model.DB.Select("wallet_id, updated_at").Find(&row, "wallet_id = ?", id).Error != nil {
		c.JSON(503, gin.H{"success": false, "message": "密码记录暂时不可用"})
		return
	}
	var configured int64
	if model.DB.Model(&model.UpstreamWalletVault{}).Where("slot = ?", "active").Count(&configured).Error != nil {
		c.JSON(503, gin.H{"success": false, "message": "密码库暂时不可用"})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"configured": configured == 1, "exists": row.WalletID > 0, "updated_at": row.UpdatedAt}})
}

type walletCredentialRequest struct {
	UnlockEncrypted   string `json:"unlock_key_encrypted"`
	EncryptionKeyID   string `json:"encryption_key_id"`
	Username          string `json:"username"`
	PasswordEncrypted string `json:"password_encrypted"`
	LoginURL          string `json:"login_url"`
	Note              string `json:"note"`
}

func recordWalletCredentialAudit(c *gin.Context, walletID int, action string, status int, success bool) {
	model.RecordOperationAuditLog(c.GetInt("id"), c.GetInt("role"), action, c.ClientIP(), action,
		map[string]any{"wallet_id": walletID, "success": success}, auditOperatorInfo(c),
		&model.AuditRequestInfo{Method: c.Request.Method, Route: c.FullPath(), Path: c.FullPath(), Status: status, Success: success}, c)
	markAuditLogged(c)
}

func validateWalletUnlock(c *gin.Context, request walletCredentialRequest) bool {
	key, err := common.DecryptPassword(request.UnlockEncrypted, request.EncryptionKeyID)
	if err == nil {
		err = model.VerifyUpstreamWalletUnlock(c.GetInt("id"), key)
	}
	key = ""
	if err != nil {
		status := http.StatusForbidden
		message := "查看密钥不正确或已失效"
		if errors.Is(err, model.ErrWalletUnlockLocked) {
			status = http.StatusTooManyRequests
			message = err.Error()
		}
		if errors.Is(err, model.ErrWalletVaultUnavailable) {
			status = http.StatusServiceUnavailable
			message = err.Error()
		}
		id, _ := strconv.Atoi(c.Param("id"))
		recordWalletCredentialAudit(c, id, "upstream_wallet.credential_denied", status, false)
		c.JSON(status, gin.H{"success": false, "message": message})
		return false
	}
	return true
}

func RevealUpstreamWalletCredential(c *gin.Context) {
	if !walletCredentialHeaders(c) {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	id, _ := strconv.Atoi(c.Param("id"))
	var request walletCredentialRequest
	if id <= 0 || c.ShouldBindJSON(&request) != nil {
		c.JSON(400, gin.H{"success": false, "message": "查看请求无效"})
		return
	}
	if !validateWalletUnlock(c, request) {
		return
	}
	login, err := model.ReadUpstreamWalletCredential(id)
	if err != nil {
		c.JSON(404, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordWalletCredentialAudit(c, id, "upstream_wallet.credential_view", 200, true)
	c.JSON(200, gin.H{"success": true, "data": login})
	login.Password = ""
}

func UpdateUpstreamWalletCredential(c *gin.Context) {
	if !walletCredentialHeaders(c) {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	id, _ := strconv.Atoi(c.Param("id"))
	var request walletCredentialRequest
	if id <= 0 || c.ShouldBindJSON(&request) != nil {
		c.JSON(400, gin.H{"success": false, "message": "保存请求无效"})
		return
	}
	if !validateWalletUnlock(c, request) {
		return
	}
	password, err := common.DecryptPassword(request.PasswordEncrypted, request.EncryptionKeyID)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": "密码传输已失效，请重试"})
		return
	}
	err = model.SaveUpstreamWalletCredential(id, model.UpstreamWalletLogin{Username: request.Username, Password: password, LoginURL: request.LoginURL, Note: request.Note})
	password = ""
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordWalletCredentialAudit(c, id, "upstream_wallet.credential_save", 200, true)
	c.JSON(200, gin.H{"success": true})
}
