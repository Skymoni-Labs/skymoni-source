package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

type popupTemplateRequest struct {
	Name     string                   `json:"name"`
	Title    string                   `json:"title"`
	Content  model.PopupNoticeContent `json:"content"`
	Format   string                   `json:"format"`
	Revision int64                    `json:"revision"`
}

func popupTemplateError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrPopupTemplateNotFound):
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "模板不存在"})
	case errors.Is(err, model.ErrPopupTemplateConflict):
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "模板已更新或已删除，请刷新模板库后重试"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "模板操作失败"})
	}
}

func AdminListPopupTemplates(c *gin.Context) {
	page, err := strconv.Atoi(c.DefaultQuery("p", "1"))
	size, sizeErr := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	if err != nil || sizeErr != nil || page < 1 || page > 1000000 || size < 1 || size > 100 || utf8.RuneCountInString(keyword) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "模板分页或搜索参数无效"})
		return
	}
	items, total, err := model.ListPopupTemplates(keyword, (page-1)*size, size)
	if err != nil {
		popupTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": items, "total": total}})
}

func AdminSavePopupTemplate(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, model.MaxPopupNoticeContentBytes*6+16384)
	var request popupTemplateRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "模板数据无效或过大"})
		return
	}
	item := model.PopupTemplate{Name: request.Name, Title: request.Title, Content: request.Content, Format: request.Format, Revision: request.Revision}
	if err := model.ValidatePopupTemplate(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if c.Request.Method == http.MethodPost {
		if err := model.CreatePopupTemplate(&item, c.GetInt("id")); err != nil {
			popupTemplateError(c, err)
			return
		}
	} else {
		id, ok := popupNoticeID(c)
		if !ok {
			return
		}
		updated, err := model.UpdatePopupTemplate(id, item)
		if err != nil {
			popupTemplateError(c, err)
			return
		}
		item = *updated
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": item})
}

func AdminDeletePopupTemplate(c *gin.Context) {
	id, ok := popupNoticeID(c)
	if !ok {
		return
	}
	var request struct {
		Revision int64 `json:"revision"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	if err := c.ShouldBindJSON(&request); err != nil || request.Revision < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "模板版本无效"})
		return
	}
	if err := model.DeletePopupTemplate(id, request.Revision); err != nil {
		popupTemplateError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
