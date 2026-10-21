package controller

import (
	"errors"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func shopError(c *gin.Context, err error) {
	status, message := http.StatusInternalServerError, "商城操作失败，请稍后重试"
	switch {
	case errors.Is(err, model.ErrShopInvalid):
		status, message = 400, err.Error()
	case errors.Is(err, model.ErrShopConflict), errors.Is(err, model.ErrShopBalance):
		status, message = 409, err.Error()
	case errors.Is(err, model.ErrShopRefundNeedsReview):
		status, message = 409, err.Error()
	case errors.Is(err, model.ErrBenefitStock), errors.Is(err, model.ErrBenefitUnavailable):
		status, message = 409, err.Error()
	case errors.Is(err, model.ErrBenefitKey):
		status, message = 503, "库存加密配置不可用，请联系管理员"
	case errors.Is(err, gorm.ErrRecordNotFound):
		status, message = 404, "商品或订单不存在"
	}
	c.JSON(status, gin.H{"success": false, "message": message})
}

func ListShopProducts(c *gin.Context) {
	listShopProducts(c, false)
}

// ListPublicShopProducts exposes only on-sale display content, never account or delivery data.
func ListPublicShopProducts(c *gin.Context) {
	listShopProducts(c, true)
}

func listShopProducts(c *gin.Context, public bool) {
	offset, size, ok := benefitPage(c)
	if !ok {
		return
	}
	private := !public && c.Query("admin") == "1" && c.GetInt("role") >= common.RoleRootUser
	query := model.DB.Model(&model.ShopProduct{})
	if !private {
		query = query.Where("on_sale = ?", true)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		shopError(c, err)
		return
	}
	var rows []model.ShopProduct
	if err := query.Order("id").Offset(offset).Limit(size).Find(&rows).Error; err != nil {
		shopError(c, err)
		return
	}
	items := make([]model.ShopConfig, 0, len(rows))
	for _, row := range rows {
		item, err := model.ShopProductView(row, private)
		if err != nil {
			shopError(c, err)
			return
		}
		if public {
			for key, stock := range item.StockByPackage {
				if stock > 0 {
					item.StockByPackage[key] = 1
				}
			}
		}
		items = append(items, item)
	}
	if public {
		c.JSON(200, gin.H{"success": true, "data": gin.H{"items": items, "total": total}})
		return
	}
	var quota int
	if err := model.DB.Model(&model.User{}).Where("id = ?", c.GetInt("id")).Select("quota").Scan(&quota).Error; err != nil {
		shopError(c, err)
		return
	}
	cents := decimal.NewFromInt(int64(quota)).Div(decimal.NewFromFloat(common.QuotaPerUnit)).Mul(decimal.NewFromInt(100)).Floor().IntPart()
	c.JSON(200, gin.H{"success": true, "data": gin.H{"items": items, "total": total, "balanceCents": max(cents, 0)}})
}

func AdminSaveShopProduct(c *gin.Context) {
	id := 0
	if c.Param("id") != "" {
		var ok bool
		id, ok = benefitID(c)
		if !ok {
			return
		}
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 260000)
	var config model.ShopConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		shopError(c, model.ErrShopInvalid)
		return
	}
	saved, err := model.SaveShopProduct(id, config)
	if err != nil {
		if errors.Is(err, model.ErrBenefitKey) || errors.Is(err, gorm.ErrRecordNotFound) {
			shopError(c, err)
		} else {
			c.JSON(400, gin.H{"success": false, "message": err.Error()})
		}
		return
	}
	recordManageAudit(c, "shop.product.save", map[string]any{"product_id": saved.ID, "on_sale": saved.OnSale})
	c.JSON(200, gin.H{"success": true, "data": saved})
}

func AdminSetShopSale(c *gin.Context) {
	id, ok := benefitID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	var request struct {
		OnSale *bool `json:"on_sale"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.OnSale == nil {
		shopError(c, model.ErrShopInvalid)
		return
	}
	result := model.DB.Model(&model.ShopProduct{}).Where("id = ?", id).Updates(map[string]any{"on_sale": *request.OnSale, "updated_at": time.Now().Unix()})
	if result.Error != nil {
		shopError(c, result.Error)
		return
	}
	if result.RowsAffected != 1 {
		shopError(c, gorm.ErrRecordNotFound)
		return
	}
	recordManageAudit(c, "shop.product.sale", map[string]any{"product_id": id, "on_sale": *request.OnSale})
	c.JSON(200, gin.H{"success": true})
}

func AdminSetDripSaleQuantity(c *gin.Context) {
	id, ok := benefitID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	var request struct {
		Remaining map[string]int64 `json:"remaining"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		shopError(c, model.ErrShopInvalid)
		return
	}
	if err := model.SetShopGeneratedStock(id, request.Remaining); err != nil {
		shopError(c, err)
		return
	}
	recordManageAudit(c, "shop.drip.quantity.set", map[string]any{"product_id": id, "remaining": request.Remaining})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func PurchaseShopProduct(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2048)
	var request struct {
		ProductID  int    `json:"product_id"`
		PackageID  string `json:"package_id"`
		CheckoutID string `json:"checkout_id"`
		PriceCents int64  `json:"price_cents"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		shopError(c, model.ErrShopInvalid)
		return
	}
	order, err := model.PurchaseShop(c.GetInt("id"), request.ProductID, request.PackageID, request.CheckoutID, request.PriceCents)
	if err != nil {
		shopError(c, err)
		return
	}
	if order.ProvisionState == "pending" {
		if err := provisionDripShopOrder(c.Request.Context(), order.ID); err == nil {
			order.ProvisionState = "ready"
		} else if errors.Is(err, errShopVoucherUsed) {
			if markErr := model.MarkShopOrderProvisionReview(order.ID); markErr == nil {
				order.ProvisionState = "needs_review"
			}
		}
	}
	recordManageAudit(c, "shop.purchase", map[string]any{"order_id": order.ID, "product_id": order.ProductID, "quota": order.Quota, "status": order.Status})
	c.JSON(200, gin.H{"success": true, "data": order})
}

func ListShopOrders(c *gin.Context) {
	offset, size, ok := benefitPage(c)
	if !ok {
		return
	}
	query := model.DB.Model(&model.ShopOrder{})
	private := c.Query("admin") == "1" && c.GetInt("role") >= common.RoleRootUser
	if !private {
		query = query.Where("user_id = ?", c.GetInt("id"))
	} else {
		status := c.Query("status")
		if status != "" && status != "all" && status != "pending" && status != "delivered" && status != "refunded" {
			shopError(c, model.ErrShopInvalid)
			return
		}
		if status != "" && status != "all" {
			query = query.Where("status = ?", status)
		}
		keyword := strings.TrimSpace(c.Query("q"))
		if len(keyword) > 80 {
			shopError(c, model.ErrShopInvalid)
			return
		}
		if keyword != "" {
			if id, err := strconv.Atoi(strings.TrimPrefix(keyword, "#")); err == nil && id > 0 {
				query = query.Where("id = ? OR user_id = ?", id, id)
			} else {
				query = query.Where("LOWER(name) LIKE ?", "%"+strings.ToLower(keyword)+"%")
			}
		}
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		shopError(c, err)
		return
	}
	var orders []model.ShopOrder
	if err := query.Omit("encrypted").Order("id DESC").Offset(offset).Limit(size).Find(&orders).Error; err != nil {
		shopError(c, err)
		return
	}
	if private {
		if err := model.LoadShopRefundDetails(orders); err != nil {
			shopError(c, err)
			return
		}
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"items": orders, "total": total}})
}

func AdminSettleShopOrder(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		shopError(c, model.ErrShopInvalid)
		return
	}
	if c.Param("action") != "refund" && c.Param("action") != "deliver" {
		shopError(c, model.ErrShopInvalid)
		return
	}
	if c.Param("action") == "refund" {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2048)
		var request struct {
			Reason string `json:"reason"`
		}
		if err := c.ShouldBindJSON(&request); err != nil || strings.TrimSpace(request.Reason) == "" {
			shopError(c, model.ErrShopInvalid)
			return
		}
		prepared, hash, err := model.PrepareShopRefund(id)
		if err != nil {
			shopError(c, err)
			return
		}
		refundQuota, refundCents := prepared.Quota, prepared.PriceCents
		if prepared.Status == "delivered" {
			quote, err := dripShopRefund(c.Request.Context(), id, hash, prepared.DripGenerated, true)
			if err != nil {
				shopRefundGatewayError(c, err)
				return
			}
			amount, err := dripShopRefundAmount(int64(prepared.Quota), quote)
			if err == nil {
				refundCents, err = dripShopRefundAmount(prepared.PriceCents, quote)
			}
			if err != nil {
				shopRefundGatewayError(c, err)
				return
			}
			refundQuota = int(amount)
		}
		order, changed, err := model.RefundShopOrderWithAmount(id, c.GetInt("id"), request.Reason, hash, refundQuota, refundCents)
		if err != nil {
			shopError(c, err)
			return
		}
		if changed {
			recordManageAudit(c, "shop.order.refund", map[string]any{"order_id": id, "user_id": order.UserID, "refund_quota": refundQuota})
		}
		c.JSON(200, gin.H{"success": true, "data": order})
		return
	}
	order, err := model.SettleShopOrder(id, false)
	if err != nil {
		shopError(c, err)
		return
	}
	recordManageAudit(c, "shop.order."+c.Param("action"), map[string]any{"order_id": id, "user_id": order.UserID, "quota": order.Quota})
	c.JSON(200, gin.H{"success": true, "data": order})
}
