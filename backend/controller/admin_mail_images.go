package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"io"
	"net/http"
)

func AdminUploadMailImage(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, common.AdminMailImageMaxBytes+65536)
	if err := c.Request.ParseMultipartForm(common.AdminMailImageMaxBytes + 65536); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请选择 5 MiB 以内的图片"})
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": "请选择图片"})
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, common.AdminMailImageMaxBytes+1))
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": "图片读取失败"})
		return
	}
	name, err := common.SaveAdminMailImage(data)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	recordManageAudit(c, "mail.image.upload", map[string]any{"name": name, "bytes": len(data)})
	c.JSON(200, gin.H{"success": true, "data": gin.H{"name": name, "url": common.AdminMailImageURLPrefix + name, "html": "<div data-mail-image=\"" + name + "\"></div>"}})
}

func PublicAdminMailImage(c *gin.Context) {
	data, mime, err := common.ReadAdminMailImage(c.Param("name"))
	if err != nil {
		c.Status(404)
		return
	}
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(200, mime, data)
}
