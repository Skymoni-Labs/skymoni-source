package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strconv"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

var appDownloadSlots = make(chan struct{}, 4)
var appUpdateHTTPClient = service.AppReleaseHTTPClient()

func GetAppUpdate(c *gin.Context) {
	abi := c.Query("abi")
	platform := c.DefaultQuery("platform", "android")
	installed, err := strconv.ParseInt(c.DefaultQuery("version_code", "0"), 10, 64)
	if err != nil || installed < 0 || platform != "android" || !service.ValidAppABI(abi) {
		c.JSON(400, gin.H{"success": false, "code": "INVALID_REQUEST", "message": "更新平台或版本参数无效"})
		return
	}
	releases, err := service.LoadAppReleases()
	if err != nil {
		c.JSON(503, gin.H{"success": false, "code": "UPDATE_UNAVAILABLE", "message": "更新服务暂不可用"})
		return
	}
	var latest *service.AppRelease
	for _, r := range releases {
		if slices.Contains(r.ABIs, abi) && (latest == nil || r.VersionCode > latest.VersionCode) {
			copy := r
			latest = &copy
		}
	}
	if latest == nil {
		c.JSON(200, gin.H{"success": true, "data": gin.H{"available": false}})
		return
	}
	r := latest
	c.JSON(200, gin.H{"success": true, "data": gin.H{"available": r.VersionCode > installed, "version": r.Version, "version_code": r.VersionCode, "min_sdk": r.MinSDK, "abi": abi, "download_url": "https://skymoni.com/api/app-update/download/" + r.ID + "/" + abi, "sha256": r.SHA256, "size": r.Size, "notes": r.Notes, "published_at": r.PublishedAt, "package_name": r.PackageName, "signer_sha256": r.SignerSHA256}})
}

// This is a fixed metadata lookup, never a client-supplied URL proxy. No APK
// is persistently stored. Clients verify advertised size/hash/package/signer
// before asking Android's package installer to install the download.
func DownloadAppUpdate(c *gin.Context) {
	abi := c.Param("abi")
	id := c.Param("release")
	if !service.ValidAppABI(abi) {
		c.AbortWithStatus(404)
		return
	}
	releases, err := service.LoadAppReleases()
	if err != nil {
		c.AbortWithStatus(503)
		return
	}
	var release *service.AppRelease
	for _, r := range releases {
		if r.ID == id && slices.Contains(r.ABIs, abi) {
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
		c.AbortWithStatus(http.StatusRequestedRangeNotSatisfiable)
		return
	}
	select {
	case appDownloadSlots <- struct{}{}:
		defer func() { <-appDownloadSlots }()
	default:
		c.Header("Retry-After", "30")
		c.AbortWithStatus(503)
		return
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, release.Upstream, nil)
	if err != nil {
		c.AbortWithStatus(502)
		return
	}
	req.Header.Set("User-Agent", "Skymoni-Skivu-Update/1.0")
	upstream, err := appUpdateHTTPClient.Do(req)
	if err != nil {
		c.AbortWithStatus(502)
		return
	}
	defer upstream.Body.Close()
	if upstream.StatusCode != 200 || (upstream.ContentLength >= 0 && upstream.ContentLength != release.Size) {
		c.AbortWithStatus(502)
		return
	}
	c.Header("Content-Type", "application/vnd.android.package-archive")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="Skivu-%s-%s.apk"`, release.Version, abi))
	c.Header("Content-Length", strconv.FormatInt(release.Size, 10))
	c.Header("X-Content-SHA256", release.SHA256)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "public, max-age=3600, no-transform")
	c.Header("Accept-Ranges", "none")
	c.Header("X-Accel-Buffering", "no")
	if c.Request.Method == http.MethodHead {
		c.Status(200)
		return
	}
	hash := sha256.New()
	written, err := io.CopyN(io.MultiWriter(c.Writer, hash), upstream.Body, release.Size)
	if err != nil || written != release.Size || hex.EncodeToString(hash.Sum(nil)) != release.SHA256 {
		// Content has already streamed. A failed client hash must reject it;
		// never signal a different checksum or cache a corrupt partial file.
		c.Error(fmt.Errorf("APK upstream verification failed for release %s", release.ID))
	}
}
