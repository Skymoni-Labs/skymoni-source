package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func securityProtectionRoot(c *gin.Context) bool {
	if c.GetInt("role") < common.RoleRootUser {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "code": "security_root_required", "message": "仅根管理员可管理安全防护"})
		return false
	}
	return true
}
func securityProtectionFailure(c *gin.Context, err error, write bool) {
	status := http.StatusServiceUnavailable
	code := "security_protection_unavailable"
	message := "防护存储暂不可用，请稍后重试"
	if errors.Is(err, model.ErrSecurityProtectionRevision) {
		status = http.StatusConflict
		code = "security_revision_conflict"
		message = err.Error()
	} else if errors.Is(err, gorm.ErrRecordNotFound) {
		status = http.StatusNotFound
		code = "security_not_found"
		message = "记录不存在"
	} else if invalid := (*model.SecurityProtectionValidationError)(nil); write && errors.As(err, &invalid) {
		status = http.StatusBadRequest
		code = "security_invalid_request"
		message = err.Error()
	}
	c.JSON(status, gin.H{"success": false, "code": code, "message": message})
}
func GetSecurityProtectionConfig(c *gin.Context) {
	if !securityProtectionRoot(c) {
		return
	}
	v, err := model.GetSecurityProtectionConfig()
	if err != nil {
		securityProtectionFailure(c, err, false)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": v})
}
func UpdateSecurityProtectionConfig(c *gin.Context) {
	if !securityProtectionRoot(c) {
		return
	}
	var in struct {
		ExpectedRevision int64                                      `json:"expected_revision"`
		Config           operation_setting.SecurityProtectionConfig `json:"config"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.ExpectedRevision < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "security_invalid_request", "message": "请提供完整配置与有效expected_revision"})
		return
	}
	v, err := model.UpdateSecurityProtectionConfig(in.ExpectedRevision, in.Config, c.GetInt("id"))
	if err != nil {
		securityProtectionFailure(c, err, true)
		return
	}
	recordManageAudit(c, "security_protection.config.update", map[string]any{"revision": v.Revision, "enabled": v.Config.Enabled, "mode": v.Config.Mode})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": v})
}
func GetSecurityProtectionOverview(c *gin.Context) {
	if !securityProtectionRoot(c) {
		return
	}
	v, err := model.GetSecurityProtectionOverview()
	if err != nil {
		securityProtectionFailure(c, err, false)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": v})
}
func securityProtectionPagination(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if page > 100000 {
		page = 100000
	}
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	return page, size
}
func GetSecurityProtectionEvents(c *gin.Context) {
	if !securityProtectionRoot(c) {
		return
	}
	page, size := securityProtectionPagination(c)
	uid, _ := strconv.Atoi(c.Query("user_id"))
	items, total, err := model.ListSecurityProtectionEvents(page, size, c.Query("decision"), c.Query("kind"), uid, c.Query("ip"), c.Query("request_id"))
	if err != nil {
		securityProtectionFailure(c, err, false)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total, "page": page, "page_size": size}})
}
func GetSecurityProtectionBans(c *gin.Context) {
	if !securityProtectionRoot(c) {
		return
	}
	page, size := securityProtectionPagination(c)
	items, total, err := model.ListSecurityProtectionBans(page, size, c.Query("active") == "true")
	if err != nil {
		securityProtectionFailure(c, err, false)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total, "page": page, "page_size": size}})
}
func CreateSecurityProtectionBan(c *gin.Context) {
	if !securityProtectionRoot(c) {
		return
	}
	var in model.SecurityProtectionBanInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "security_invalid_request", "message": "无效的限制参数"})
		return
	}
	b, err := model.CreateSecurityProtectionBan(in, c.GetInt("id"), c.ClientIP(), c.GetString(common.RequestIdKey))
	if err != nil {
		securityProtectionFailure(c, err, true)
		return
	}
	recordManageAudit(c, "security_protection.ban.create", map[string]any{"ban_id": b.ID, "subject_type": b.SubjectType, "user_id": b.UserID, "ip": b.IP, "scope": b.Scope, "expires_at": b.ExpiresAt, "reason": b.Reason})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": b})
}
func RevokeSecurityProtectionBan(c *gin.Context) {
	if !securityProtectionRoot(c) {
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var in struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "security_invalid_request", "message": "请提供解除原因"})
		return
	}
	b, err := model.RevokeSecurityProtectionBan(id, in.Reason, c.GetInt("id"), c.GetString(common.RequestIdKey))
	if err != nil {
		securityProtectionFailure(c, err, true)
		return
	}
	recordManageAudit(c, "security_protection.ban.revoke", map[string]any{"ban_id": b.ID, "subject_type": b.SubjectType, "user_id": b.UserID, "ip": b.IP, "scope": b.Scope, "reason": b.RevokeReason})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": b})
}
