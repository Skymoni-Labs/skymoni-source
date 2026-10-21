package controller

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	_ "golang.org/x/image/webp"
)

func shopImageDirectory() string {
	if directory := os.Getenv("SHOP_IMAGE_DIR"); directory != "" {
		return directory
	}
	return "/data/shop-images"
}

func AdminUploadShopImage(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 5*1024*1024+64*1024)
	if err := c.Request.ParseMultipartForm(5 * 1024 * 1024); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片"})
		return
	}
	defer c.Request.MultipartForm.RemoveAll()
	file, _, err := c.Request.FormFile("image")
	if err != nil {
		shopError(c, model.ErrShopInvalid)
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 5*1024*1024+1))
	if err != nil || len(data) == 0 || len(data) > 5*1024*1024 {
		shopError(c, model.ErrShopInvalid)
		return
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "jpeg" && format != "png" && format != "webp") || config.Width < 1 || config.Height < 1 || config.Width > 4096 || config.Height > 4096 || config.Width*config.Height > 16*1024*1024 {
		c.JSON(400, gin.H{"success": false, "message": "图片格式无效或尺寸过大，请缩小图片后重试"})
		return
	}
	decoded, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		shopError(c, model.ErrShopInvalid)
		return
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, decoded, &jpeg.Options{Quality: 85}); err != nil || encoded.Len() > 2*1024*1024 {
		c.JSON(400, gin.H{"success": false, "message": "图片过大，请缩小图片后重试"})
		return
	}
	name := fmt.Sprintf("%x.jpg", sha256.Sum256(encoded.Bytes()))
	directory := shopImageDirectory()
	if err := os.MkdirAll(directory, 0755); err != nil {
		shopError(c, err)
		return
	}
	// Write atomically: readers must never see a partially uploaded image.
	temporary, err := os.CreateTemp(directory, ".upload-*")
	if err != nil {
		shopError(c, err)
		return
	}
	defer os.Remove(temporary.Name())
	_, writeErr := temporary.Write(encoded.Bytes())
	closeErr := temporary.Close()
	if writeErr != nil || closeErr != nil {
		shopError(c, fmt.Errorf("unable to store product image"))
		return
	}
	if err := os.Chmod(temporary.Name(), 0644); err != nil {
		shopError(c, err)
		return
	}
	if err := os.Rename(temporary.Name(), filepath.Join(directory, name)); err != nil {
		shopError(c, err)
		return
	}
	recordManageAudit(c, "shop.image.upload", map[string]any{"bytes": encoded.Len()})
	c.JSON(200, gin.H{"success": true, "data": gin.H{"url": "/api/shop/images/" + name}})
}

func GetShopImage(c *gin.Context) {
	name := c.Param("name")
	if !model.IsShopImageURL("/api/shop/images/" + name) {
		c.Status(http.StatusNotFound)
		return
	}
	path := filepath.Join(shopImageDirectory(), name)
	if _, err := os.Stat(path); err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Content-Type", "image/jpeg")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.File(path)
}
