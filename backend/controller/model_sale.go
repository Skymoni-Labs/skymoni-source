package controller

import (
	"errors"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func modelSaleError(c *gin.Context, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, gorm.ErrRecordNotFound) {
		status = http.StatusNotFound
	}
	if errors.Is(err, model.ErrModelSaleConflict) {
		status = http.StatusConflict
	}
	c.JSON(status, gin.H{"success": false, "message": err.Error()})
}
func ModelSaleCountdownGIF(c *gin.Context) {
	var sale model.ModelSale
	if err := model.DB.First(&sale, "id = ?", c.Param("id")).Error; err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	now := time.Now()
	if model.ModelSalePublicationState(sale, now) == "published" {
		offers, _, err := model.CurrentModelSaleOffers(now)
		if err != nil {
			c.AbortWithStatus(http.StatusServiceUnavailable)
			return
		}
		found := false
		for _, offer := range offers {
			if offer.ID == sale.ID {
				found = true
				break
			}
		}
		if !found {
			sale.AnnouncementManaged = true
			sale.AnnouncementEnabled = false
		}
	}
	data, err := service.RenderModelSaleCountdownGIF(sale, now)
	if err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, "image/gif", data)
}
func ListModelSales(c *gin.Context) {
	var items []model.ModelSale
	if err := model.DB.Order("created_at DESC").Limit(100).Find(&items).Error; err != nil {
		modelSaleError(c, err)
		return
	}
	now := time.Now()
	for i := range items {
		items[i].TimePrices = model.ModelSaleTimePriceDisplay(items[i], now)
	}
	common.ApiSuccess(c, gin.H{"items": items, "default_policy": model.DefaultModelSalePolicy(), "server_time": now.Unix()})
}
func PublicModelSales(c *gin.Context) {
	now := time.Now()
	items, _, err := model.CurrentModelSaleOffers(now)
	if err != nil {
		c.JSON(503, gin.H{"success": false, "message": "活动暂时无法读取"})
		return
	}
	common.ApiSuccess(c, gin.H{"items": items, "server_time": now.Unix()})
}
func CheckSavedModelSale(c *gin.Context) {
	sale, quotes, err := model.CheckSavedModelSale(c.Param("id"), time.Now())
	if err != nil {
		modelSaleError(c, err)
		return
	}
	sale.TimePrices = model.ModelSaleTimePriceDisplay(*sale, time.Now())
	common.ApiSuccess(c, gin.H{"sale": sale, "quotes": quotes, "server_time": time.Now().Unix()})
}
func ModelSaleMailDraft(c *gin.Context) {
	var in service.ModelSaleMailDraftInput
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	if err := c.ShouldBindJSON(&in); err != nil {
		modelSaleError(c, err)
		return
	}
	campaign, err := service.CreateModelSaleMailDraft(c.Param("id"), in, c.GetInt("id"))
	if err != nil {
		modelSaleError(c, err)
		return
	}
	recordManageAudit(c, "model.sale.mail_draft", map[string]any{"id": c.Param("id"), "mail_id": campaign.Id})
	common.ApiSuccess(c, campaign)
}
func ModelSaleQuotes(c *gin.Context) {
	var in struct {
		Policy        model.ModelSalePolicy `json:"policy"`
		Discount      float64               `json:"discount_percent"`
		Multipliers   map[string]float64    `json:"model_multipliers"`
		Basis         string                `json:"pricing_basis"`
		RequestPrices map[string]float64    `json:"request_prices_cny"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	if err := c.ShouldBindJSON(&in); err != nil {
		modelSaleError(c, err)
		return
	}
	var quotes []model.ModelSaleQuote
	var err error
	if in.Basis == "official" {
		quotes, err = model.ModelSaleOfficialQuotes(model.ModelSaleConfig{Basis: "official", Policy: in.Policy, Multipliers: in.Multipliers, RequestPrices: in.RequestPrices}, time.Now())
	} else {
		quotes, err = model.ModelSaleQuotesWithMultipliers(in.Policy, in.Discount, in.Multipliers, time.Now())
	}
	if err != nil {
		modelSaleError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"quotes": quotes, "server_time": time.Now().Unix()})
}
func SaveModelSale(c *gin.Context) {
	var in model.ModelSaleInput
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 65536)
	if err := c.ShouldBindJSON(&in); err != nil {
		modelSaleError(c, err)
		return
	}
	var sale *model.ModelSale
	var err error
	if c.Param("id") == "" {
		sale, err = model.CreateModelSale(in, time.Now())
	} else {
		sale, err = model.UpdateModelSale(c.Param("id"), in, time.Now())
	}
	if err != nil {
		modelSaleError(c, err)
		return
	}
	recordManageAudit(c, "model.sale.save", map[string]any{"id": sale.ID, "models": sale.Config.Models})
	common.ApiSuccess(c, sale)
}
func ChangeModelSale(c *gin.Context) {
	var in struct {
		Revision  int   `json:"revision"`
		PublishAt int64 `json:"publish_at"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	if err := c.ShouldBindJSON(&in); err != nil {
		modelSaleError(c, err)
		return
	}
	var sale *model.ModelSale
	var err error
	if c.Param("action") == "enable" {
		sale, err = model.EnableModelSale(c.Param("id"), in.Revision, time.Now())
	} else if c.Param("action") == "disable" {
		sale, err = model.DisableModelSale(c.Param("id"), in.Revision, time.Now())
	} else if c.Param("action") == "publish" {
		sale, err = model.ScheduleModelSaleAnnouncement(c.Param("id"), in.Revision, in.PublishAt, time.Now())
	} else if c.Param("action") == "unpublish" {
		sale, err = model.CancelModelSaleAnnouncement(c.Param("id"), in.Revision, time.Now())
	} else {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if err != nil {
		modelSaleError(c, err)
		return
	}
	recordManageAudit(c, "model.sale."+c.Param("action"), map[string]any{"id": sale.ID, "status": sale.Status})
	common.ApiSuccess(c, sale)
}
func PublicModelSale(c *gin.Context) {
	var sale model.ModelSale
	if err := model.DB.First(&sale, "id = ?", c.Param("id")).Error; err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "no-store")
	now := time.Now()
	offers, _, err := model.CurrentModelSaleOffers(now)
	if err != nil {
		modelSaleError(c, err)
		return
	}
	for _, offer := range offers {
		if offer.ID == sale.ID {
			common.ApiSuccess(c, gin.H{"id": offer.ID, "title": offer.Title, "status": offer.Status, "start_at": offer.StartAt, "end_at": offer.EndAt, "countdown_mode": offer.CountdownMode, "models": offer.Models, "model_multipliers": offer.Multipliers, "discount_percent": offer.Discount, "announcement_only": offer.AnnouncementOnly, "announcement_at": offer.AnnouncementAt, "time_prices": model.ModelSaleTimePriceDisplay(sale, now), "server_time": now.Unix()})
			return
		}
	}
	status := sale.Status
	if now.Unix() >= sale.EndAt {
		status = "ended"
	}
	// A hidden, stale or not-yet-published offer must not advertise prices through
	// its detail URL even when the billing activity itself has been enabled.
	if status == "active" || status == "scheduled" {
		status = "unpublished"
	}
	common.ApiSuccess(c, gin.H{"id": sale.ID, "title": sale.Title, "status": status, "start_at": sale.StartAt, "end_at": sale.EndAt, "countdown_mode": sale.Config.CountdownMode, "models": []string{}, "discount_percent": 0, "server_time": now.Unix()})
}
