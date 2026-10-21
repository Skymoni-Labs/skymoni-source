package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func benefitError(c *gin.Context, err error) {
	status, message := http.StatusInternalServerError, "资源操作失败，请稍后重试"
	switch {
	case errors.Is(err, model.ErrBenefitKey):
		status, message = http.StatusServiceUnavailable, err.Error()
	case errors.Is(err, model.ErrBenefitClaimed):
		status, message = http.StatusConflict, err.Error()
	case errors.Is(err, model.ErrInventoryConflict), errors.Is(err, model.ErrInventoryDuplicate):
		status, message = http.StatusConflict, err.Error()
	case errors.Is(err, model.ErrInventoryInvalid):
		status, message = http.StatusBadRequest, err.Error()
	case errors.Is(err, model.ErrBenefitUnavailable), errors.Is(err, model.ErrBenefitStock):
		status, message = http.StatusConflict, err.Error()
	case errors.Is(err, gorm.ErrRecordNotFound):
		status, message = http.StatusNotFound, "资源记录不存在或无权查看"
	}
	c.JSON(status, gin.H{"success": false, "message": message})
}

func benefitID(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "资源 ID 无效"})
		return 0, false
	}
	return id, true
}

func benefitPage(c *gin.Context) (int, int, bool) {
	page, _ := strconv.Atoi(c.DefaultQuery("p", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	if page < 1 || page > 1000000 || size < 1 || size > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "分页参数无效"})
		return 0, 0, false
	}
	return (page - 1) * size, size, true
}

func ListBenefitWarehouse(c *gin.Context) {
	offset, size, ok := benefitPage(c)
	if !ok {
		return
	}
	query := model.DB.Model(&model.BenefitReceipt{}).Where("user_id = ?", c.GetInt("id"))
	if c.Query("admin") == "1" && c.GetInt("role") >= common.RoleRootUser {
		query = model.DB.Model(&model.BenefitReceipt{})
	}
	var available, expired int64
	now := time.Now().Unix()
	if err := query.Session(&gorm.Session{}).Where("expires_at = 0 OR expires_at > ?", now).Count(&available).Error; err != nil {
		benefitError(c, err)
		return
	}
	if err := query.Session(&gorm.Session{}).Where("expires_at > 0 AND expires_at <= ?", now).Count(&expired).Error; err != nil {
		benefitError(c, err)
		return
	}
	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		query = query.Where("name LIKE ? OR summary LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}
	if c.Query("status") == "active" {
		query = query.Where("expires_at = 0 OR expires_at > ?", now)
	}
	if c.Query("status") == "expired" {
		query = query.Where("expires_at > 0 AND expires_at <= ?", now)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		benefitError(c, err)
		return
	}
	var rows []model.BenefitReceipt
	if err := query.Omit("encrypted").Order("id DESC").Offset(offset).Limit(size).Find(&rows).Error; err != nil {
		benefitError(c, err)
		return
	}
	items := make([]model.BenefitWarehouseItem, 0, len(rows))
	for _, row := range rows {
		item, err := model.BenefitWarehouseView(row, false)
		if err != nil {
			benefitError(c, err)
			return
		}
		if c.Query("admin") == "1" && c.GetInt("role") >= common.RoleRootUser {
			item.UserID = row.UserID
		}
		items = append(items, item)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total, "counts": gin.H{"all": available + expired, "active": available, "expired": expired}}})
}

func GetBenefitWarehouseDetail(c *gin.Context) {
	id, ok := benefitID(c)
	if !ok {
		return
	}
	item, err := model.GetBenefitWarehouseDetail(id, c.GetInt("id"))
	if err != nil {
		benefitError(c, err)
		return
	}
	if strings.HasPrefix(item.SourceCode, "shop:") && len(item.Fields) == 1 && strings.HasPrefix(item.Fields[0].Value, "DRIP-") {
		orderID, _ := strconv.Atoi(strings.TrimPrefix(item.SourceCode, "shop:"))
		var order model.ShopOrder
		err := model.DB.Select("provision_state", "drip_generated").Where("id = ? AND user_id = ? AND receipt_id = ?", orderID, c.GetInt("id"), id).First(&order).Error
		if err == nil && order.DripGenerated && order.ProvisionState != "ready" {
			item.Fields = item.Fields[:0]
		}
		if err == nil && order.ProvisionState == "pending" {
			item.Fields = append(item.Fields, model.BenefitField{ID: "subscription-status", Label: "订阅状态", Kind: "text", Value: "自动开通中，请稍后刷新查看订阅地址"})
		} else if err == nil && order.ProvisionState == "needs_review" {
			message := "开通需要人工核验，请联系管理员；兑换码仍可在仓库查看"
			if order.DripGenerated {
				message = "开通需要人工核验，请联系管理员；完成后显示兑换码和订阅地址"
			}
			item.Fields = append(item.Fields, model.BenefitField{ID: "subscription-status", Label: "订阅状态", Kind: "text", Value: message})
		} else if err == nil && order.ProvisionState == "ready" {
			clash, universal, linkErr := model.ShopSubscriptionLinksForOrder(c.GetInt("id"), orderID)
			if linkErr != nil || clash == "" {
				benefitError(c, model.ErrBenefitUnavailable)
				return
			}
			item.Fields = append(item.Fields,
				model.BenefitField{ID: "clash-subscription", Label: "Clash 订阅地址", Kind: "secret", Value: clash},
				model.BenefitField{ID: "universal-subscription", Label: "通用订阅地址", Kind: "secret", Value: universal})
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": item})
}

func RedeemBenefit(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	var request struct {
		Code     string `json:"code"`
		Revision int64  `json:"revision"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "兑换数据无效"})
		return
	}
	var receipt model.BenefitReceipt
	var err error
	if c.Param("id") != "" {
		id, ok := benefitID(c)
		if !ok {
			return
		}
		receipt, err = model.RedeemPopupBenefit(c.GetInt("id"), id, request.Revision)
	} else {
		receipt, err = model.RedeemBenefit(c.GetInt("id"), request.Code)
	}
	if err != nil {
		benefitError(c, err)
		return
	}
	item, _ := model.BenefitWarehouseView(receipt, false)
	recordManageAudit(c, "benefit.redeem", map[string]any{"receipt_id": receipt.ID, "benefit_id": receipt.BenefitID, "code_id": receipt.CodeID})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": item})
}

func AdminListBenefits(c *gin.Context) {
	offset, size, ok := benefitPage(c)
	if !ok {
		return
	}
	query := model.DB.Model(&model.Benefit{})
	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		query = query.Where("name LIKE ?", "%"+keyword+"%")
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		benefitError(c, err)
		return
	}
	var rows []model.Benefit
	if err := query.Order("id DESC").Offset(offset).Limit(size).Find(&rows).Error; err != nil {
		benefitError(c, err)
		return
	}
	items := make([]model.BenefitConfig, 0, len(rows))
	for _, row := range rows {
		config, err := model.GetBenefitConfig(row.ID)
		if err != nil {
			benefitError(c, err)
			return
		}
		for i := range config.Fields {
			config.Fields[i].Value = ""
		}
		if row.StockMode == "individual" {
			var available int64
			if err := model.DB.Model(&model.BenefitInventory{}).Where("benefit_id = ? AND claimed = ? AND disabled = ? AND removed = ?", row.ID, false, false, false).Count(&available).Error; err != nil {
				benefitError(c, err)
				return
			}
			config.AvailableInventory = &available
		}
		items = append(items, config)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total}})
}

func AdminGetBenefit(c *gin.Context) {
	id, ok := benefitID(c)
	if !ok {
		return
	}
	config, err := model.GetBenefitConfig(id)
	if err != nil {
		benefitError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": config})
}

func AdminSaveBenefit(c *gin.Context) {
	id := 0
	if c.Param("id") != "" {
		var ok bool
		id, ok = benefitID(c)
		if !ok {
			return
		}
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 260000)
	var config model.BenefitConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "资源配置无效或过大"})
		return
	}
	if err := model.ValidateBenefit(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	result, err := model.SaveBenefit(id, config)
	if err != nil {
		if errors.Is(err, model.ErrBenefitKey) || errors.Is(err, gorm.ErrRecordNotFound) {
			benefitError(c, err)
		} else {
			c.JSON(http.StatusConflict, gin.H{"success": false, "message": "保存失败，请检查字段、库存兼容性并重试"})
		}
		return
	}
	recordManageAudit(c, "benefit.save", map[string]any{"benefit_id": result.ID, "enabled": result.Enabled})
	for i := range result.Fields {
		result.Fields[i].Value = ""
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

func AdminSetBenefitState(c *gin.Context) {
	id, ok := benefitID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	var request struct {
		Enabled *bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.Enabled == nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "状态无效"})
		return
	}
	result := model.DB.Model(&model.Benefit{}).Where("id = ?", id).Updates(map[string]any{"enabled": *request.Enabled, "updated_at": time.Now().Unix()})
	if result.Error != nil {
		benefitError(c, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		benefitError(c, gorm.ErrRecordNotFound)
		return
	}
	recordManageAudit(c, "benefit.state", map[string]any{"benefit_id": id, "enabled": *request.Enabled})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminImportBenefitInventory(c *gin.Context) {
	id, ok := benefitID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<20)
	var request struct {
		Items [][]model.BenefitField `json:"items"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "库存内容无效或过大"})
		return
	}
	if err := model.ImportBenefitInventory(id, request.Items); err != nil {
		if errors.Is(err, model.ErrBenefitKey) || errors.Is(err, model.ErrInventoryDuplicate) {
			benefitError(c, err)
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "导入失败，请核对库存字段、内容长度和网址"})
		}
		return
	}
	recordManageAudit(c, "benefit.stock.import", map[string]any{"benefit_id": id, "count": len(request.Items)})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminListBenefitInventory(c *gin.Context) {
	offset, size, ok := benefitPage(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.DefaultQuery("benefit_id", "0"))
	if err != nil || id < 0 {
		benefitError(c, model.ErrInventoryInvalid)
		return
	}
	page, err := model.ListBenefitInventory(id, c.DefaultQuery("status", "all"), c.Query("keyword"), offset, size)
	if err != nil {
		benefitError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": page})
}

func AdminGetBenefitInventory(c *gin.Context) {
	id, ok := benefitID(c)
	if !ok {
		return
	}
	var row model.BenefitInventory
	if err := model.DB.First(&row, id).Error; err != nil {
		benefitError(c, err)
		return
	}
	view, err := model.BenefitInventoryView(row, true)
	if err != nil {
		benefitError(c, err)
		return
	}
	recordManageAudit(c, "benefit.stock.view", map[string]any{"inventory_id": id, "benefit_id": row.BenefitID})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": view})
}

func AdminEditBenefitInventory(c *gin.Context) {
	id, ok := benefitID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
	var request model.InventoryEditRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		benefitError(c, model.ErrInventoryInvalid)
		return
	}
	if err := model.EditBenefitInventory(id, c.GetInt("id"), request); err != nil {
		benefitError(c, err)
		return
	}
	recordManageAudit(c, "benefit.stock.edit", map[string]any{"inventory_id": id, "synced_delivery": request.SyncDelivered})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminManageBenefitInventory(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10)
	var request model.InventoryActionRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		benefitError(c, model.ErrInventoryInvalid)
		return
	}
	if err := model.ManageBenefitInventory(c.GetInt("id"), request); err != nil {
		benefitError(c, err)
		return
	}
	recordManageAudit(c, "benefit.stock.manage", map[string]any{"items": request.Items, "action": request.Action})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminListBenefitCodes(c *gin.Context) {
	offset, size, ok := benefitPage(c)
	if !ok {
		return
	}
	query := model.DB.Model(&model.BenefitCode{})
	var total int64
	if err := query.Count(&total).Error; err != nil {
		benefitError(c, err)
		return
	}
	var rows []model.BenefitCode
	if err := query.Order("id DESC").Offset(offset).Limit(size).Find(&rows).Error; err != nil {
		benefitError(c, err)
		return
	}
	items := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		value, err := model.BenefitCodeValue(row)
		if err != nil {
			benefitError(c, err)
			return
		}
		expires := ""
		if row.ExpiresAt > 0 {
			expires = time.Unix(row.ExpiresAt, 0).UTC().Format(time.RFC3339)
		}
		target := "all"
		if row.TargetUserID > 0 {
			target = "user"
		}
		items = append(items, gin.H{"id": strconv.Itoa(row.ID), "benefitId": strconv.Itoa(row.BenefitID), "code": value, "mode": row.Mode, "limit": row.Limit, "claimed": row.Claimed, "target": target, "targetUserId": row.TargetUserID, "expires": expires, "enabled": row.Enabled})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total}})
}

func AdminGenerateBenefitCodes(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2048)
	var request model.BenefitCodeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "卡密配置无效"})
		return
	}
	rows, err := model.GenerateBenefitCodes(request)
	if err != nil {
		if errors.Is(err, model.ErrBenefitKey) {
			benefitError(c, err)
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请核对资源、指定用户、数量和有效期"})
		}
		return
	}
	recordManageAudit(c, "benefit.codes.generate", map[string]any{"benefit_id": request.BenefitID, "count": len(rows), "target_user_id": request.TargetUserID})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"count": len(rows)}})
}

func AdminSetBenefitCodeState(c *gin.Context) {
	id, ok := benefitID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	var request struct {
		Enabled *bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.Enabled == nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "状态无效"})
		return
	}
	result := model.DB.Model(&model.BenefitCode{}).Where("id = ?", id).Update("enabled", *request.Enabled)
	if result.Error != nil {
		benefitError(c, result.Error)
		return
	}
	if result.RowsAffected == 0 {
		benefitError(c, gorm.ErrRecordNotFound)
		return
	}
	recordManageAudit(c, "benefit.code.state", map[string]any{"code_id": id, "enabled": *request.Enabled})
	c.JSON(http.StatusOK, gin.H{"success": true})
}
