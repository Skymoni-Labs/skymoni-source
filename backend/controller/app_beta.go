package controller

import (
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func betaJSON(c *gin.Context, data any, err error) {
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, model.ErrBetaAccess) {
			status = http.StatusForbidden
		}
		if errors.Is(err, model.ErrBetaConflict) {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

func GetAppBetaSelf(c *gin.Context) {
	a, err := model.GetAppBetaAccount(c.GetInt("id"))
	if err != nil {
		betaJSON(c, nil, err)
		return
	}
	var devices []model.AppBetaDevice
	err = model.DB.Where("user_id = ? AND revoked = ? AND expires_at > ?", a.UserID, false, time.Now().Unix()).Order("created_at desc").Find(&devices).Error
	betaJSON(c, gin.H{"account": a, "devices": devices, "app_available": service.AppBetaEnabled(), "quota_per_unit": common.QuotaPerUnit}, err)
}
func ApplyAppBeta(c *gin.Context) {
	var body struct {
		Application string `json:"application"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len([]rune(body.Application)) > 1000 {
		betaJSON(c, nil, errors.New("申请说明不能超过 1000 字"))
		return
	}
	betaJSON(c, nil, model.ApplyAppBeta(c.GetInt("id"), strings.TrimSpace(body.Application)))
}
func PairAppBeta(c *gin.Context) {
	var body struct {
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		betaJSON(c, nil, errors.New("请输入 App 显示的配对码"))
		return
	}
	code := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(body.Code), "-", ""))
	if len(code) != 16 {
		betaJSON(c, nil, errors.New("配对码格式不正确"))
		return
	}
	betaJSON(c, nil, model.PairAppBeta(c.GetInt("id"), service.AppBetaHash(code)))
}
func RevokeAppBetaDevice(c *gin.Context) {
	result := model.DB.Model(&model.AppBetaDevice{}).Where("id = ? AND user_id = ?", c.Param("device"), c.GetInt("id")).Update("revoked", true)
	if result.Error != nil {
		betaJSON(c, nil, result.Error)
		return
	}
	if result.RowsAffected != 1 {
		betaJSON(c, nil, errors.New("设备不存在"))
		return
	}
	betaJSON(c, nil, nil)
}

func AdminListAppBeta(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	page = max(page, 1)
	status := c.Query("status")
	query := model.DB.Model(&model.AppBetaAccount{})
	switch status {
	case "pending", "approved", "rejected", "suspended":
		query = query.Where("app_beta_accounts.status = ?", status)
	case "":
	default:
		betaJSON(c, nil, errors.New("无效状态"))
		return
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		betaJSON(c, nil, err)
		return
	}
	var rows []struct {
		model.AppBetaAccount
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
	}
	err := query.Select("app_beta_accounts.*, users.username, users.display_name").Joins("LEFT JOIN users ON users.id = app_beta_accounts.user_id").Order("applied_at desc, user_id desc").Limit(25).Offset((page - 1) * 25).Scan(&rows).Error
	betaJSON(c, gin.H{"items": rows, "total": total, "quota_per_unit": common.QuotaPerUnit, "app_available": service.AppBetaEnabled()}, err)
}
func AdminGetAppBeta(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		betaJSON(c, nil, errors.New("无效用户"))
		return
	}
	a, err := model.GetAppBetaAccount(id)
	if err != nil {
		betaJSON(c, nil, err)
		return
	}
	var ledger []model.AppBetaLedger
	err = model.DB.Where("user_id = ?", id).Order("id desc").Limit(50).Find(&ledger).Error
	betaJSON(c, gin.H{"account": a, "ledger": ledger, "quota_per_unit": common.QuotaPerUnit}, err)
}
func AdminReviewAppBeta(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		betaJSON(c, nil, errors.New("无效用户"))
		return
	}
	var review model.AppBetaReview
	var input struct {
		model.AppBetaReview
		Amount *int64 `json:"amount"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.Amount == nil {
		betaJSON(c, nil, errors.New("请明确填写内测额度；不分配额度时填写 0"))
		return
	}
	review = input.AppBetaReview
	review.Amount = *input.Amount
	if len(review.OperationID) < 16 || len(review.OperationID) > 64 || len([]rune(review.Note)) > 500 || review.Version < 0 {
		betaJSON(c, nil, errors.New("无效审核参数"))
		return
	}
	// Match existing user management: non-root admins cannot change peers/superiors.
	user, err := model.GetUserById(id, false)
	if err != nil {
		betaJSON(c, nil, errors.New("用户不存在"))
		return
	}
	if c.GetInt("role") != common.RoleRootUser && user.Role >= c.GetInt("role") {
		betaJSON(c, nil, model.ErrBetaAccess)
		return
	}
	betaJSON(c, nil, model.ReviewAppBeta(id, c.GetInt("id"), review))
}

func AppBetaChallenge(c *gin.Context) {
	if !service.AppBetaEnabled() {
		c.JSON(503, gin.H{"success": false, "message": "App 内测接入尚未开放"})
		return
	}
	id, err := service.AppBetaRandom(24)
	if err != nil {
		betaJSON(c, nil, err)
		return
	}
	nonce, err := service.AppBetaRandom(32)
	if err != nil {
		betaJSON(c, nil, err)
		return
	}
	now := time.Now().Unix()
	// Bounded housekeeping; signed-request nonces can expire without allowing replays.
	model.DB.Where("expires_at < ?", now-120).Delete(&model.AppBetaNonce{})
	model.DB.Where("expires_at < ?", now).Delete(&model.AppBetaChallenge{})
	err = model.DB.Create(&model.AppBetaChallenge{ID: id, Challenge: nonce, ExpiresAt: now + 300}).Error
	betaJSON(c, gin.H{"id": id, "challenge": nonce}, err)
}
func AppBetaEnroll(c *gin.Context) {
	var body struct {
		ChallengeID string   `json:"challenge_id"`
		Chain       []string `json:"chain"`
		Label       string   `json:"label"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Label) > 100 {
		betaJSON(c, nil, errors.New("无效设备注册"))
		return
	}
	var challenge model.AppBetaChallenge
	if err := model.DB.First(&challenge, "id = ? AND expires_at > ?", body.ChallengeID, time.Now().Unix()).Error; err != nil {
		betaJSON(c, nil, errors.New("设备注册已过期，请重试"))
		return
	}
	key, serials, expires, err := service.VerifyAppBetaAttestation(body.Chain, challenge.Challenge)
	if err != nil {
		betaJSON(c, nil, err)
		return
	}
	token, err := service.AppBetaRandom(32)
	if err != nil {
		betaJSON(c, nil, err)
		return
	}
	id, err := service.AppBetaRandom(24)
	if err != nil {
		betaJSON(c, nil, err)
		return
	}
	codeBytes, err := service.AppBetaRandom(12)
	if err != nil {
		betaJSON(c, nil, err)
		return
	}
	// Hex alphabet, 64 bits of entropy. Code is visible only on the attested device.
	code := strings.ToUpper(service.AppBetaHash(codeBytes)[:16])
	device := model.AppBetaDevice{ID: id, TokenHash: service.AppBetaHash(token), PublicKey: key, Serials: serials, PairHash: service.AppBetaHash(code), PairExpires: time.Now().Unix() + 300, Label: body.Label, CreatedAt: time.Now().Unix(), ExpiresAt: expires}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("id = ? AND expires_at > ?", challenge.ID, time.Now().Unix()).Delete(&model.AppBetaChallenge{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("设备挑战已使用")
		}
		return tx.Create(&device).Error
	})
	betaJSON(c, gin.H{"device_token": token, "pair_code": code, "pair_expires": device.PairExpires}, err)
}
func AppBetaDeviceStatus(c *gin.Context) {
	device := c.MustGet("app_beta_device").(model.AppBetaDevice)
	if device.UserID == 0 {
		betaJSON(c, gin.H{"paired": false, "pair_expires": device.PairExpires}, nil)
		return
	}
	a, err := model.GetAppBetaAccount(device.UserID)
	models := []string{}
	protocols := map[string]string{}
	for name, route := range service.AppBetaModelRoutes(c.GetString("app_beta_user_group")) {
		models = append(models, name)
		protocols[name] = route.Protocol
	}
	slices.Sort(models)
	betaJSON(c, gin.H{"paired": true, "account": a, "models": models, "model_protocols": protocols, "quota_per_unit": common.QuotaPerUnit}, err)
}
func AppBetaRelay(c *gin.Context) {
	if c.GetBool("app_beta_responses") {
		Relay(c, types.RelayFormatOpenAIResponses)
		return
	}
	Relay(c, types.RelayFormatOpenAI)
}

// Enforce live browser sessions for applications/reviews; API/PAT credentials
// cannot approve accounts or pair a device via a copied bearer token.
func AppBetaBrowserSession(c *gin.Context) {
	if _, ok := middleware.GetSessionAuthIdentity(c); !ok {
		c.AbortWithStatusJSON(403, gin.H{"success": false, "message": "请使用网页登录会话"})
	}
}
