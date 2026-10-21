package controller

import (
	"encoding/base64"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func PublicCreatorHome(c *gin.Context) {
	var data any
	var err error
	if c.Query("view") == "cards" {
		data, err = service.PublicCreatorHomepage()
	} else {
		data, err = service.PublicCreatorHome()
	}
	if err != nil {
		creatorError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}
func PublicCreatorHomePoster(c *gin.Context) {
	value, err := service.CreatorHomePoster(c.Param("id"))
	if err != nil {
		creatorError(c, err)
		return
	}
	parts := strings.SplitN(value, ",", 2)
	if len(parts) != 2 {
		creatorError(c, service.ErrCreatorInvalid)
		return
	}
	raw, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		creatorError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(200, strings.TrimPrefix(strings.Split(parts[0], ";")[0], "data:"), raw)
}
func CreatorHomeMe(c *gin.Context) {
	data, err := service.CreatorHomeSnapshot(c.GetInt("id"), false)
	if err != nil {
		creatorError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}
func AdminCreatorHome(c *gin.Context) {
	data, err := service.CreatorHomeSnapshot(0, true)
	if err != nil {
		creatorError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}
func CreatorHomeSubmit(c *gin.Context) {
	var body struct {
		Image    string `json:"image"`
		Revision string `json:"revision"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if err := service.SubmitCreatorHomeCard(c.GetInt("id"), c.Param("id"), body.Image, body.Revision); err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.home.submit", map[string]any{"work_id": c.Param("id")})
	CreatorHomeMe(c)
}
func CreatorHomeDisplay(c *gin.Context) {
	var body struct {
		Paused   *bool  `json:"paused"`
		Revision string `json:"revision"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if body.Paused == nil {
		creatorError(c, model.ErrCreatorHomeInvalid)
		return
	}
	if err := service.SetCreatorHomePaused(c.GetInt("id"), c.Param("id"), body.Revision, *body.Paused); err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.home.display", map[string]any{"work_id": c.Param("id"), "paused": *body.Paused})
	CreatorHomeMe(c)
}
func CreatorHomePurchase(c *gin.Context) {
	var body struct {
		Plan       string `json:"plan"`
		CheckoutID string `json:"checkoutId"`
		Revision   string `json:"revision"`
		Confirm    bool   `json:"confirm"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if !body.Confirm {
		creatorError(c, model.ErrCreatorHomeInvalid)
		return
	}
	order, err := service.BuyCreatorHome(c.GetInt("id"), c.Param("id"), body.Plan, body.CheckoutID, body.Revision)
	if err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.home.purchase", map[string]any{"order_id": order.ID, "work_id": order.WorkID, "plan": order.Plan, "credits": order.Credits})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": order})
}
func AdminCreatorHomeConfig(c *gin.Context) {
	var cfg model.CreatorHomeConfig
	if !creatorDecode(c, &cfg) {
		return
	}
	if err := service.SaveCreatorHomeConfig(cfg); err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.home.config", map[string]any{"gallery": cfg.GalleryEnabled, "marquee": cfg.MarqueeEnabled, "auto_add": cfg.AutoAddCreators})
	AdminCreatorHome(c)
}
func AdminCreatorHomeReview(c *gin.Context) {
	var body struct {
		Revision string `json:"revision"`
		Decision string `json:"decision"`
		Note     string `json:"note"`
		Hidden   bool   `json:"hidden"`
		Position int    `json:"position"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if err := service.ReviewCreatorHome(c.Param("id"), body.Revision, body.Decision, body.Note, body.Hidden, body.Position); err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.home.review", map[string]any{"work_id": c.Param("id"), "decision": body.Decision, "hidden": body.Hidden, "position": body.Position})
	AdminCreatorHome(c)
}
func AdminCreatorHomeShowcase(c *gin.Context) {
	var body service.CreatorHomeShowcase
	if !creatorDecode(c, &body) {
		return
	}
	if err := service.SaveCreatorHomeShowcase(body); err != nil {
		creatorError(c, err)
		return
	}
	enabled := 0
	for _, item := range body.Works {
		if item.Enabled {
			enabled++
		}
	}
	recordManageAudit(c, "creator.home.showcase", map[string]any{"enabled_works": enabled, "auto_add_works": body.AutoAddWorks})
	AdminCreatorHome(c)
}
func AdminCreatorHomeExample(c *gin.Context) {
	var body struct {
		Revision string `json:"revision"`
		Hidden   bool   `json:"hidden"`
		Position int    `json:"position"`
	}
	if !creatorDecode(c, &body) {
		return
	}
	if err := service.SaveCreatorHomeExample(c.Param("id"), body.Revision, body.Hidden, body.Position); err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.home.example", map[string]any{"example_id": c.Param("id"), "hidden": body.Hidden, "position": body.Position})
	AdminCreatorHome(c)
}
func CreatorHomeAvatar(c *gin.Context) {
	var body model.CreatorHomeAuthor
	if !creatorDecode(c, &body) {
		return
	}
	if err := service.SaveCreatorHomeAuthor(c.GetInt("id"), body, false); err != nil {
		creatorError(c, err)
		return
	}
	CreatorHomeMe(c)
}
func AdminCreatorHomeAuthor(c *gin.Context) {
	uid, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		creatorError(c, model.ErrCreatorHomeInvalid)
		return
	}
	var body model.CreatorHomeAuthor
	if !creatorDecode(c, &body) {
		return
	}
	if err := service.SaveCreatorHomeAuthor(uid, body, true); err != nil {
		creatorError(c, err)
		return
	}
	recordManageAudit(c, "creator.home.author", map[string]any{"user_id": uid, "visible": body.Visible, "position": body.Position})
	AdminCreatorHome(c)
}
