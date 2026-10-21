package controller

import (
	"errors"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func docsError(c *gin.Context, err error) {
	status, message := 500, "文档操作失败，请稍后重试"
	if errors.Is(err, service.ErrDocsInvalid) {
		status, message = 400, "请检查文档标题、内容长度和图片地址"
	}
	if errors.Is(err, service.ErrDocsConflict) {
		status, message = 409, "文档已被其他编辑更新，请先保留当前内容并重新加载"
	}
	if errors.Is(err, os.ErrNotExist) {
		status, message = 404, "文档不存在或尚未发布"
	}
	if errors.Is(err, service.ErrSoftwareStorageFull) {
		status, message = 413, "文档或图片存储空间不足"
	}
	c.JSON(status, gin.H{"success": false, "message": message})
}
func PublicDocsIndex(c *gin.Context) {
	pages, err := service.PublicDocs("")
	if err != nil {
		docsError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": pages})
}
func PublicDocsPage(c *gin.Context) {
	pages, err := service.PublicDocs(c.Param("id"))
	if err != nil {
		docsError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": pages[0]})
}
func AdminDocsCatalog(c *gin.Context) {
	err := service.WithDocsCatalog(false, func(data *service.DocsCatalog) error {
		c.JSON(200, gin.H{"success": true, "data": data.Entries})
		return nil
	})
	if err != nil {
		docsError(c, err)
	}
}
func AdminSaveDocs(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024*1024)
	var body struct {
		Revision string           `json:"revision"`
		Action   string           `json:"action"`
		Draft    service.DocsPage `json:"draft"`
	}
	if err := common.DecodeJson(c.Request.Body, &body); err != nil {
		docsError(c, service.ErrDocsInvalid)
		return
	}
	result, err := service.SaveDocs(c.Param("id"), body.Revision, body.Action, body.Draft)
	if err != nil {
		docsError(c, err)
		return
	}
	recordManageAudit(c, "docs."+body.Action, map[string]any{"document_id": c.Param("id")})
	c.JSON(200, gin.H{"success": true, "data": result})
}
func AdminUploadDocsImage(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.DocsImageLimit+64*1024)
	reader, err := c.Request.MultipartReader()
	if err != nil {
		docsError(c, service.ErrDocsInvalid)
		return
	}
	part, err := reader.NextPart()
	if err != nil || part.FormName() != "file" {
		docsError(c, service.ErrDocsInvalid)
		return
	}
	defer part.Close()
	raw, err := io.ReadAll(io.LimitReader(part, service.DocsImageLimit+1))
	if err != nil || int64(len(raw)) > service.DocsImageLimit || len(raw) == 0 {
		docsError(c, service.ErrDocsInvalid)
		return
	}
	mime := http.DetectContentType(raw)
	if mime != "image/png" && mime != "image/jpeg" && mime != "image/gif" && mime != "image/webp" {
		docsError(c, service.ErrDocsInvalid)
		return
	}
	if _, err = reader.NextPart(); err != io.EOF {
		docsError(c, service.ErrDocsInvalid)
		return
	}
	id, err := service.StoreDocsImage(raw)
	if err != nil {
		docsError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"url": "/api/docs/images/" + id}})
}
func DocsImage(c *gin.Context) {
	file, err := service.OpenDocsImage(c.Param("id"), c.GetInt("role") >= common.RoleRootUser)
	if err != nil {
		docsError(c, err)
		return
	}
	if closer, ok := file.(io.Closer); ok {
		defer closer.Close()
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "sandbox")
	c.Header("Cache-Control", "private, no-store")
	http.ServeContent(c.Writer, c.Request, "image", time.Time{}, file)
}
