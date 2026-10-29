package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"io"
	"net/http"
	"strconv"
)

var runtimeDownloadSlots = make(chan struct{}, 2)
var runtimeHTTPClient = service.AppReleaseHTTPClient()

func GetAppRuntime(c *gin.Context) {
	pkg, abi := c.Query("package"), c.Query("abi")
	if !service.ValidRuntimePackage(pkg) || (abi != "arm64-v8a" && abi != "x86_64") {
		c.JSON(400, gin.H{"success": false, "code": "INVALID_REQUEST", "message": "运行组件或设备架构无效"})
		return
	}
	releases, err := service.LoadRuntimeReleases()
	if err != nil {
		c.JSON(503, gin.H{"success": false, "code": "RUNTIME_UNAVAILABLE", "message": "运行组件服务暂不可用"})
		return
	}
	var latest *service.RuntimeRelease
	for _, r := range releases {
		if r.PackageName == pkg && r.ABI == abi && (latest == nil || r.VersionCode > latest.VersionCode) {
			copy := r
			latest = &copy
		}
	}
	if latest == nil {
		c.JSON(404, gin.H{"success": false, "code": "RUNTIME_NOT_FOUND", "message": "暂无适配此设备的运行组件"})
		return
	}
	r := latest
	c.JSON(200, gin.H{"success": true, "data": gin.H{"id": r.ID, "version": r.Version, "version_code": r.VersionCode, "package_name": r.PackageName, "component": r.Component, "signer_sha256": r.SignerSHA256, "min_sdk": r.MinSDK, "abi": r.ABI, "sha256": r.SHA256, "size": r.Size, "notes": r.Notes, "download_url": "https://skymoni.com/api/app-runtime/download/" + r.PackageName + "/" + r.ID + "/" + r.ABI}})
}

func DownloadAppRuntime(c *gin.Context) {
	pkg, id, abi := c.Param("package"), c.Param("release"), c.Param("abi")
	releases, err := service.LoadRuntimeReleases()
	if err != nil {
		c.AbortWithStatus(503)
		return
	}
	var release *service.RuntimeRelease
	for _, r := range releases {
		if r.PackageName == pkg && r.ID == id && r.ABI == abi {
			copy := r
			release = &copy
			break
		}
	}
	if release == nil {
		c.AbortWithStatus(404)
		return
	}
	if c.GetHeader("Range") != "" {
		c.Header("Accept-Ranges", "none")
		c.AbortWithStatus(416)
		return
	}
	select {
	case runtimeDownloadSlots <- struct{}{}:
		defer func() { <-runtimeDownloadSlots }()
	default:
		c.Header("Retry-After", "30")
		c.AbortWithStatus(503)
		return
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), c.Request.Method, release.Upstream, nil)
	if err != nil {
		c.AbortWithStatus(502)
		return
	}
	req.Header.Set("User-Agent", "Skymoni-Local-Runtime/1.0")
	response, err := runtimeHTTPClient.Do(req)
	if err != nil {
		c.AbortWithStatus(502)
		return
	}
	defer response.Body.Close()
	if response.StatusCode != 200 || (response.ContentLength >= 0 && response.ContentLength != release.Size) {
		c.AbortWithStatus(502)
		return
	}
	c.Header("Content-Type", "application/vnd.android.package-archive")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="runtime-%s-%s.apk"`, release.Version, abi))
	c.Header("Content-Length", strconv.FormatInt(release.Size, 10))
	c.Header("X-Content-SHA256", release.SHA256)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "no-store, no-transform")
	c.Header("Accept-Ranges", "none")
	c.Header("X-Accel-Buffering", "no")
	if c.Request.Method == http.MethodHead {
		c.Status(200)
		return
	}
	digest := sha256.New()
	written, err := io.CopyN(io.MultiWriter(c.Writer, digest), response.Body, release.Size)
	if err != nil || written != release.Size || hex.EncodeToString(digest.Sum(nil)) != release.SHA256 {
		c.Error(fmt.Errorf("runtime upstream verification failed for %s", release.ID))
	}
}
