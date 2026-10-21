package controller

import (
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const dripProxyPrefix = "/drip-api/account/"
const dripProxyMaxRequest = 256 * 1024
const dripProxyMaxResponse = 512 * 1024

var dripProxyActions = map[string]string{
	"entitlement": "GET", "managed-nodes": "GET", "me": "GET",
	"devices": "GET", "sync": "GET,POST", "register": "POST",
	"login": "POST", "skymoni-login": "POST",
	"logout": "POST", "refresh": "POST", "revoke": "POST",
	"profile": "POST", "avatar": "POST", "password": "POST",
	"usage": "POST", "redeem": "POST",
}

var dripAccountHTTPClient = &http.Client{
	Timeout: 25 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

func ProxyDripAccount(c *gin.Context) {
	proxyDripAccountWithClient(c, dripAccountHTTPClient, os.Getenv("DRIP_ACCOUNT_ORIGIN"))
}

func proxyDripAccountWithClient(c *gin.Context, client *http.Client, rawOrigin string) {
	c.Header("Cache-Control", "no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	action := strings.TrimPrefix(c.Request.URL.Path, dripProxyPrefix)
	methods, allowed := dripProxyActions[action]
	if !allowed || !strings.Contains(","+methods+",", ","+c.Request.Method+",") {
		c.JSON(http.StatusNotFound, gin.H{"ok": false, "error": "账号接口不存在"})
		return
	}
	origin, err := url.Parse(rawOrigin)
	if err != nil || origin == nil || origin.Scheme != "https" || origin.Host == "" || origin.User != nil || origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ok": false, "error": "账号通道未配置"})
		return
	}
	var body io.Reader
	if c.Request.Method == http.MethodPost {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, dripProxyMaxRequest)
		data, readErr := io.ReadAll(c.Request.Body)
		if readErr != nil {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"ok": false, "error": "请求内容过大"})
			return
		}
		body = strings.NewReader(string(data))
	}
	target := *origin
	target.Path = "/api/account/" + action
	target.RawQuery = c.Request.URL.RawQuery
	request, err := http.NewRequestWithContext(c.Request.Context(), c.Request.Method, target.String(), body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"ok": false, "error": "账号通道不可用"})
		return
	}
	request.Header.Set("Accept", "application/json")
	if authorization := c.GetHeader("Authorization"); strings.HasPrefix(authorization, "Bearer ") {
		request.Header.Set("Authorization", authorization)
	}
	if c.Request.Method == http.MethodPost {
		request.Header.Set("Content-Type", "application/json; charset=utf-8")
	}
	clientIP := c.GetHeader("X-Real-IP")
	if net.ParseIP(clientIP) == nil {
		clientIP = c.ClientIP()
	}
	request.Header.Set("X-Forwarded-For", clientIP)
	request.Header.Set("X-Forwarded-Proto", "https")
	response, err := client.Do(request)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"ok": false, "error": "账号通道暂时不可用"})
		return
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 500 || (response.StatusCode >= 300 && response.StatusCode < 400) {
		c.JSON(http.StatusBadGateway, gin.H{"ok": false, "error": "账号通道响应异常"})
		return
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, dripProxyMaxResponse+1))
	if err != nil || len(data) > dripProxyMaxResponse {
		c.JSON(http.StatusBadGateway, gin.H{"ok": false, "error": "账号通道响应过大"})
		return
	}
	c.Data(response.StatusCode, "application/json; charset=utf-8", data)
}
