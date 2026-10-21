package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type popupNoticeRequest struct {
	BenefitCodeID int    `json:"benefit_code_id"`
	Title         string `json:"title"`
	Content       string `json:"content"`
	Format        string `json:"format"`
	Audience      string `json:"audience"`
	TargetUserId  int    `json:"target_user_id"`
	Status        string `json:"status"`
	Frequency     string `json:"frequency"`
	DurationDays  *int   `json:"duration_days"`
	StartAt       int64  `json:"start_at"`
	EndAt         int64  `json:"end_at"`
	Revision      int64  `json:"revision"`
	Priority      int    `json:"priority"`
}

type popupNoticeDelivery struct {
	BenefitCodeID int                      `json:"benefit_code_id"`
	Id            int                      `json:"id"`
	Title         string                   `json:"title"`
	Content       model.PopupNoticeContent `json:"content"`
	Format        string                   `json:"format"`
	Frequency     string                   `json:"frequency"`
	Revision      int64                    `json:"revision"`
	Priority      int                      `json:"priority"`
	StartAt       int64                    `json:"start_at"`
	EndAt         int64                    `json:"end_at"`
	PublishedAt   int64                    `json:"published_at"`
}

func popupNoticeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrPopupNoticeNotFound):
		c.JSON(http.StatusNotFound, gin.H{"success": false, "code": "POPUP_NOT_FOUND", "message": "弹窗不存在或当前不可查看"})
	case errors.Is(err, model.ErrPopupNoticeConflict):
		c.JSON(http.StatusConflict, gin.H{"success": false, "code": "POPUP_REVISION_CONFLICT", "message": "弹窗已更新，请重新加载"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "弹窗操作失败"})
	}
}

func popupNoticeID(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "弹窗 ID 无效"})
		return 0, false
	}
	return id, true
}

func bindPopupNotice(c *gin.Context) (model.PopupNotice, bool) {
	// JSON escaping may require six bytes per authored byte.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, model.MaxPopupNoticeContentBytes*6+16384)
	var request popupNoticeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "弹窗数据无效或过大"})
		return model.PopupNotice{}, false
	}
	if request.Format == "" {
		request.Format = "auto"
	}
	if request.Audience == "" {
		request.Audience = "all_users"
	}
	if request.Status == "" {
		request.Status = "draft"
	}
	if request.Frequency == "" {
		request.Frequency = "once"
	}
	item := model.PopupNotice{Title: request.Title, Content: model.PopupNoticeContent(request.Content), Format: request.Format, Audience: request.Audience, TargetUserId: request.TargetUserId, Status: request.Status, Frequency: request.Frequency, StartAt: request.StartAt, EndAt: request.EndAt, Revision: request.Revision, Priority: request.Priority, BenefitCodeID: request.BenefitCodeID}
	if request.DurationDays != nil {
		item.DurationDays, item.DurationDaysSet = *request.DurationDays, true
		item.StartAt, item.EndAt = 0, 0
	}
	if err := model.ValidatePopupNotice(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return item, false
	}
	if item.Audience == "user" {
		if _, err := model.GetUserById(item.TargetUserId, false); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "指定用户不存在"})
			return item, false
		}
	}
	if item.BenefitCodeID < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "福利卡密无效"})
		return item, false
	}
	if err := model.ValidatePopupBenefit(item.BenefitCodeID, item.Audience, item.TargetUserId); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return item, false
	}
	return item, true
}

func AdminListPopupNotices(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("p", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 || page > 1000000 || size < 1 || size > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "分页参数无效"})
		return
	}
	items, total, err := model.ListPopupNotices(c.Query("status"), c.Query("audience"), strings.TrimSpace(c.Query("keyword")), (page-1)*size, size)
	if err != nil {
		popupNoticeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total}})
}

func AdminGetPopupNotice(c *gin.Context) {
	id, ok := popupNoticeID(c)
	if !ok {
		return
	}
	item, err := model.GetPopupNotice(id)
	if err != nil {
		popupNoticeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": item})
}

func AdminCreatePopupNotice(c *gin.Context) {
	item, ok := bindPopupNotice(c)
	if !ok {
		return
	}
	if err := model.CreatePopupNotice(&item, c.GetInt("id")); err != nil {
		popupNoticeError(c, err)
		return
	}
	recordManageAudit(c, "popup.create", map[string]any{"id": item.Id, "audience": item.Audience, "status": item.Status})
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": item})
}

func AdminUpdatePopupNotice(c *gin.Context) {
	id, ok := popupNoticeID(c)
	if !ok {
		return
	}
	request, ok := bindPopupNotice(c)
	if !ok {
		return
	}
	if request.Revision < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "弹窗版本无效"})
		return
	}
	item, err := model.UpdatePopupNotice(id, request)
	if err != nil {
		popupNoticeError(c, err)
		return
	}
	recordManageAudit(c, "popup.update", map[string]any{"id": id, "revision": item.Revision, "status": item.Status})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": item})
}

func AdminSetPopupNoticeState(c *gin.Context) {
	id, ok := popupNoticeID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	var request struct {
		Status string `json:"status"`
		Resend bool   `json:"resend"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || (request.Status != "draft" && request.Status != "published" && request.Status != "disabled") || (request.Resend && request.Status != "published") {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "发布状态无效；重新发送需选择发布"})
		return
	}
	item, err := model.SetPopupNoticeState(id, request.Status, request.Resend)
	if err != nil {
		popupNoticeError(c, err)
		return
	}
	recordManageAudit(c, "popup.state", map[string]any{"id": id, "status": item.Status, "resend": request.Resend, "revision": item.Revision})
	c.JSON(http.StatusOK, gin.H{"success": true, "data": item})
}

func AdminDeletePopupNotice(c *gin.Context) {
	id, ok := popupNoticeID(c)
	if !ok {
		return
	}
	if err := model.DeletePopupNotice(id); err != nil {
		popupNoticeError(c, err)
		return
	}
	recordManageAudit(c, "popup.delete", map[string]any{"id": id})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func GetGuestPopupNotices(c *gin.Context) {
	deliverPopupNotices(c, 0)
}

func GetSelfPopupNotices(c *gin.Context) {
	deliverPopupNotices(c, c.GetInt("id"))
}

func GetSelfPopupNoticeHistory(c *gin.Context) {
	var cursor *model.PopupNoticeHistoryCursor
	if c.Query("after_id") != "" || c.Query("after_read_at") != "" {
		afterID, idErr := strconv.Atoi(c.Query("after_id"))
		afterReadAt, readErr := strconv.ParseInt(c.Query("after_read_at"), 10, 64)
		if idErr != nil || readErr != nil || afterID < 1 || afterReadAt < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "弹窗历史游标无效"})
			return
		}
		cursor = &model.PopupNoticeHistoryCursor{AfterID: afterID, AfterReadAt: afterReadAt}
	}
	items, err := model.ListPopupNoticeHistory(c.GetInt("id"), cursor)
	if err != nil {
		popupNoticeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": items})
}

func GetSelfPopupNoticeHistoryDetail(c *gin.Context) {
	id, ok := popupNoticeID(c)
	if !ok {
		return
	}
	item, err := model.GetPopupNoticeHistory(c.GetInt("id"), id)
	if err != nil {
		popupNoticeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": item})
}

func deliverPopupNotices(c *gin.Context, userID int) {
	page, err := strconv.Atoi(c.DefaultQuery("p", "1"))
	if err != nil || page < 1 || page > 1000000 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "分页参数无效"})
		return
	}
	var cursor *model.PopupNoticeCursor
	if c.Query("after_id") != "" || c.Query("after_priority") != "" {
		afterID, idErr := strconv.Atoi(c.Query("after_id"))
		afterPriority, priorityErr := strconv.Atoi(c.Query("after_priority"))
		if idErr != nil || priorityErr != nil || afterID < 1 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "弹窗游标无效"})
			return
		}
		cursor = &model.PopupNoticeCursor{AfterID: afterID, AfterPriority: afterPriority}
	}
	items, err := model.GetEligiblePopupNotices(userID, time.Now().Unix(), page, cursor)
	if err != nil {
		popupNoticeError(c, err)
		return
	}
	data := make([]popupNoticeDelivery, 0, len(items))
	for _, item := range items {
		data = append(data, popupNoticeDelivery{Id: item.Id, Title: item.Title, Content: item.Content, Format: item.Format, Frequency: item.Frequency, Revision: item.Revision, Priority: item.Priority, StartAt: item.StartAt, EndAt: item.EndAt, PublishedAt: item.PublishedAt, BenefitCodeID: item.BenefitCodeID})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

func ReadPopupNotice(c *gin.Context) {
	id, ok := popupNoticeID(c)
	if !ok {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	var request struct {
		Revision       int64 `json:"revision"`
		ExpectedUserID int   `json:"expected_user_id"`
	}
	if err := c.ShouldBindJSON(&request); err != nil || request.Revision < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "弹窗版本无效"})
		return
	}
	if request.ExpectedUserID != 0 && request.ExpectedUserID != c.GetInt("id") {
		c.JSON(http.StatusConflict, gin.H{"success": false, "code": "POPUP_IDENTITY_CHANGED", "message": "登录账号已变化，请重新打开弹窗"})
		return
	}
	if err := model.ReadPopupNotice(c.GetInt("id"), id, request.Revision, time.Now().Unix()); err != nil {
		popupNoticeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
