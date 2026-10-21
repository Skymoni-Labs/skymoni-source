package controller

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func softwareError(c *gin.Context, err error) {
	status, message := 500, "软件中心操作失败，请重试"
	switch {
	case errors.Is(err, service.ErrSoftwareInvalid):
		status, message = 400, "请检查名称、链接和安装包格式"
	case errors.Is(err, service.ErrSoftwareConflict):
		status, message = 409, "内容已更新或文件仍被使用，请刷新后重试"
	case errors.Is(err, service.ErrSoftwareStorageFull):
		status, message = 413, "安装包超过大小限制或上传空间不足，请清理未使用的安装包"
	case errors.Is(err, os.ErrNotExist):
		status, message = 404, "文件不存在"
	}
	c.JSON(status, gin.H{"success": false, "message": message})
}

func PublicSoftwareCatalog(c *gin.Context) {
	catalog, err := service.LoadSoftwareCatalog()
	if err != nil {
		softwareError(c, err)
		return
	}
	items := []service.SoftwareEntry{}
	for _, item := range catalog.Items {
		if item.Published {
			items = append(items, item)
		}
	}
	data := gin.H{"items": items}
	if catalog.Featured != nil {
		published := make(map[string]bool, len(items))
		for _, item := range items {
			published[item.ID] = true
		}
		featured := service.SoftwareFeaturedConfig{Carousel: []string{}, Tiles: []string{}}
		for _, id := range catalog.Featured.Carousel {
			if published[id] {
				featured.Carousel = append(featured.Carousel, id)
			}
		}
		for _, id := range catalog.Featured.Tiles {
			if published[id] {
				featured.Tiles = append(featured.Tiles, id)
			}
		}
		data["featured"] = featured
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}

func AdminSoftwareCatalog(c *gin.Context) {
	catalog, err := service.LoadSoftwareCatalog()
	if err != nil {
		softwareError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": catalog})
}

func AdminSaveSoftwareCatalog(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024*1024)
	var catalog service.SoftwareCatalog
	if err := common.DecodeJson(c.Request.Body, &catalog); err != nil {
		softwareError(c, service.ErrSoftwareInvalid)
		return
	}
	// Copied links are absolute; canonical references preserve publication and
	// unused-file checks when the installer is reused by another entry.
	for i := range catalog.Items {
		parsed, err := url.Parse(catalog.Items[i].DownloadURL)
		if err == nil && parsed.Scheme == "https" && strings.EqualFold(parsed.Host, c.Request.Host) && strings.HasPrefix(parsed.Path, "/api/software/files/") {
			catalog.Items[i].DownloadURL = parsed.EscapedPath()
		}
	}
	if err := service.SaveSoftwareCatalog(catalog); err != nil {
		softwareError(c, err)
		return
	}
	recordManageAudit(c, "software.catalog.save", map[string]any{"items": len(catalog.Items)})
	AdminSoftwareCatalog(c)
}

func AdminUploadSoftware(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.SoftwareUploadLimit+64*1024)
	reader, err := c.Request.MultipartReader()
	if err != nil {
		softwareError(c, service.ErrSoftwareInvalid)
		return
	}
	part, err := reader.NextPart()
	if err != nil || part.FormName() != "file" || part.FileName() == "" {
		softwareError(c, service.ErrSoftwareInvalid)
		return
	}
	defer part.Close()
	// Use the original header filename for traversal checks; FileName() strips paths.
	_, params, err := mime.ParseMediaType(part.Header.Get("Content-Disposition"))
	if err != nil {
		softwareError(c, service.ErrSoftwareInvalid)
		return
	}
	file, err := service.StoreSoftwareInstaller(params["filename"], part, service.SoftwareUploadLimit)
	if err != nil {
		softwareError(c, err)
		return
	}
	if _, err = reader.NextPart(); err != io.EOF {
		_ = service.DeleteSoftwareFile(file.ID)
		softwareError(c, service.ErrSoftwareInvalid)
		return
	}
	recordManageAudit(c, "software.file.upload", map[string]any{"bytes": file.Bytes, "sha256": file.SHA256})
	c.JSON(200, gin.H{"success": true, "data": file})
}

func AdminSoftwareFiles(c *gin.Context) {
	files, err := service.ListSoftwareFiles()
	if err != nil {
		softwareError(c, err)
		return
	}
	var used int64
	for _, file := range files {
		used += file.Bytes
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"items": files, "usedBytes": used, "limitBytes": service.SoftwareStorageLimit, "uploadLimitBytes": service.SoftwareUploadLimit}})
}

func AdminDeleteSoftwareFile(c *gin.Context) {
	if err := service.DeleteSoftwareFile(c.Param("id")); err != nil {
		softwareError(c, err)
		return
	}
	recordManageAudit(c, "software.file.delete", map[string]any{"id": c.Param("id")})
	c.JSON(200, gin.H{"success": true})
}

func DownloadSoftwareFile(c *gin.Context) {
	file, err := service.LoadSoftwareFile(c.Param("id"))
	if err != nil || file.Filename != c.Param("name") {
		c.Status(404)
		return
	}
	catalog, err := service.LoadSoftwareCatalog()
	if err != nil {
		c.Status(503)
		return
	}
	if !slices.ContainsFunc(catalog.Items, func(item service.SoftwareEntry) bool { return item.Published && item.DownloadURL == file.URL }) {
		c.Status(404)
		return
	}
	path := filepath.Join(service.SoftwareDirectory(), "files", file.ID)
	if _, err = os.Stat(path); err != nil {
		c.Status(404)
		return
	}
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": file.Filename}))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "no-store")
	c.Header("ETag", `"`+file.SHA256+`"`)
	c.File(path)
}
