package conversationlog

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	_ "golang.org/x/image/webp"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const imageLimit = 1024 * 1024
const imagesPerRecord = 4

// Source is transient and is never marshalled to logs or sent to the reader.
type Image struct {
	Side   string `json:"side"`
	MIME   string `json:"mime,omitempty"`
	Data   string `json:"data,omitempty"`
	Status string `json:"status"`
	Source string `json:"-"`
}

type imageCollector struct {
	images []Image
	seen   map[string]bool
}

func newImageCollector() *imageCollector { return &imageCollector{seen: map[string]bool{}} }
func (c *imageCollector) hasSide(side string) bool {
	for _, im := range c.images {
		if im.Side == side {
			return true
		}
	}
	return false
}
func (c *imageCollector) add(side, source string) {
	if source == "" || len(source) > CaptureLimit || len(c.images) >= imagesPerRecord {
		return
	}
	if !strings.HasPrefix(source, "data:image/") && !strings.HasPrefix(source, "https://") {
		return
	}
	sum := sha256.Sum256([]byte(source))
	key := side + hex.EncodeToString(sum[:])
	if c.seen[key] {
		return
	}
	c.seen[key] = true
	c.images = append(c.images, Image{Side: side, Source: source, Status: "pending"})
}

func latestUserContent(body map[string]any) any {
	for _, key := range []string{"messages", "input", "contents"} {
		if list, ok := body[key].([]any); ok {
			for i := len(list) - 1; i >= 0; i-- {
				m, ok := list[i].(map[string]any)
				if !ok {
					continue
				}
				if m["role"] == "user" || (m["role"] == nil && (key == "contents" || m["type"] == "message")) {
					if key == "contents" {
						return m["parts"]
					}
					return m["content"]
				}
			}
			return nil
		}
	}
	return nil
}
func (c *imageCollector) walk(side string, value any, depth int) {
	if depth > 8 || len(c.images) >= imagesPerRecord {
		return
	}
	switch v := value.(type) {
	case []any:
		for _, p := range v {
			c.walk(side, p, depth+1)
		}
	case map[string]any:
		kind, _ := v["type"].(string)
		if kind == "image_url" || kind == "input_image" || kind == "output_image" {
			switch src := v["image_url"].(type) {
			case string:
				c.add(side, src)
			case map[string]any:
				s, _ := src["url"].(string)
				c.add(side, s)
			}
			if s, ok := v["url"].(string); ok {
				c.add(side, s)
			}
		}
		if kind == "image" {
			if src, ok := v["source"].(map[string]any); ok {
				if src["type"] == "base64" {
					mime, _ := src["media_type"].(string)
					data, _ := src["data"].(string)
					c.add(side, "data:"+mime+";base64,"+data)
				}
				if s, ok := src["url"].(string); ok {
					c.add(side, s)
				}
			}
		}
		for _, key := range []string{"inlineData", "inline_data"} {
			if src, ok := v[key].(map[string]any); ok {
				mime, _ := src["mimeType"].(string)
				if mime == "" {
					mime, _ = src["mime_type"].(string)
				}
				data, _ := src["data"].(string)
				c.add(side, "data:"+mime+";base64,"+data)
			}
		}
		if kind == "image_generation_call" {
			if data, ok := v["result"].(string); ok {
				c.add(side, "data:image/png;base64,"+data)
			}
		}
		// Only content nodes are traversed; tools, history and credentials are excluded.
		if kind == "" || kind == "message" || kind == "text" || kind == "input_text" || kind == "output_text" {
			for _, key := range []string{"content", "parts", "images"} {
				c.walk(side, v[key], depth+1)
			}
			if s, ok := v["text"].(string); ok {
				c.text(side, s)
			}
		}
	case string:
		c.text(side, v)
	}
}

var markdownImage = regexp.MustCompile(`!\[[^\]\r\n]*\]\(\s*<?(https://[^\s<>)]+|data:image/[^\s)]+)>?(?:\s+[^)]*)?\)`)

func (c *imageCollector) text(side, text string) {
	for _, m := range markdownImage.FindAllStringSubmatch(text, imagesPerRecord) {
		c.add(side, m[1])
	}
}
func (c *imageCollector) response(body map[string]any) {
	if list, ok := body["choices"].([]any); ok && len(list) > 0 {
		if choice, ok := list[0].(map[string]any); ok {
			for _, key := range []string{"message", "delta"} {
				c.walk("output", choice[key], 0)
			}
		}
	}
	for _, key := range []string{"output", "content", "content_block"} {
		c.walk("output", body[key], 0)
	}
	if list, ok := body["candidates"].([]any); ok && len(list) > 0 {
		if candidate, ok := list[0].(map[string]any); ok {
			c.walk("output", candidate["content"], 0)
		}
	}
	if body["type"] == "response.completed" {
		if response, ok := body["response"].(map[string]any); ok {
			c.response(response)
		}
	}
	if body["type"] == "response.output_item.done" {
		c.walk("output", body["item"], 0)
	}
}

var blockedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"), netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"), netip.MustParsePrefix("198.51.100.0/24"), netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"), netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("64:ff9b::/96"), netip.MustParsePrefix("64:ff9b:1::/48"), netip.MustParsePrefix("2002::/16"),
}

func publicImageIP(addr netip.Addr) bool {
	addr = addr.Unmap()
	if !addr.IsGlobalUnicast() || addr.IsPrivate() || addr.IsLoopback() || addr.IsLinkLocalUnicast() {
		return false
	}
	for _, p := range blockedPrefixes {
		if p.Contains(addr) {
			return false
		}
	}
	return true
}
func validImageURL(u *url.URL) bool {
	return u.Scheme == "https" && u.Hostname() != "" && u.User == nil && (u.Port() == "" || u.Port() == "443") && len(u.String()) <= 8192
}
func imageTransport() *http.Transport {
	return &http.Transport{DisableKeepAlives: true, MaxResponseHeaderBytes: 16384, TLSHandshakeTimeout: time.Second,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil || port != "443" {
				return nil, errors.New("blocked")
			}
			addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
			if err != nil || len(addresses) == 0 {
				return nil, errors.New("unavailable")
			}
			for _, a := range addresses {
				if !publicImageIP(a) {
					return nil, errors.New("blocked")
				}
			}
			dialer := net.Dialer{Timeout: time.Second}
			return dialer.DialContext(ctx, network, net.JoinHostPort(addresses[0].String(), port))
		}}
}
func fetchImage(ctx context.Context, source string) ([]byte, error) {
	if strings.HasPrefix(source, "data:image/") {
		header, encoded, ok := strings.Cut(source, ",")
		if !ok || !strings.HasSuffix(header, ";base64") || len(encoded) > base64.StdEncoding.EncodedLen(imageLimit) {
			return nil, errors.New("too_large_or_invalid")
		}
		return base64.StdEncoding.DecodeString(encoded)
	}
	parsed, err := url.Parse(source)
	if err != nil || !validImageURL(parsed) {
		return nil, errors.New("blocked")
	}
	transport := imageTransport()
	defer transport.CloseIdleConnections()
	client := http.Client{Transport: transport, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 2 || !validImageURL(req.URL) {
			return errors.New("blocked")
		}
		return nil
	}}
	request, err := http.NewRequestWithContext(ctx, "GET", parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "image/png,image/jpeg,image/webp,image/gif")
	response, err := client.Do(request)
	if err != nil {
		return nil, errors.New("unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != 200 || response.ContentLength > imageLimit {
		return nil, errors.New("too_large_or_unavailable")
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, imageLimit+1))
	if err != nil || len(body) > imageLimit {
		return nil, errors.New("too_large_or_unavailable")
	}
	return body, nil
}
func imageMIME(raw []byte) (string, error) {
	config, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || config.Width <= 0 || config.Height <= 0 || config.Width > 8192 || config.Height > 8192 || int64(config.Width)*int64(config.Height) > 20000000 {
		return "", errors.New("invalid_or_oversized_dimensions")
	}
	mime := map[string]string{"png": "image/png", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}[format]
	if mime == "" {
		return "", errors.New("unsupported")
	}
	return mime, nil
}
func archiveImages(record *Record) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	total := 0
	for i := range record.Images {
		im := &record.Images[i]
		source := im.Source
		im.Source = ""
		if total >= imageLimit {
			im.Status = "record_image_limit"
			continue
		}
		raw, err := fetchImage(ctx, source)
		if err != nil {
			im.Status = "unavailable_or_over_limit"
			continue
		}
		mime, err := imageMIME(raw)
		if err != nil {
			im.Status = "unsupported_or_invalid"
			continue
		}
		if total+len(raw) > imageLimit {
			im.Status = "record_image_limit"
			continue
		}
		total += len(raw)
		im.MIME = mime
		im.Data = "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw)
		im.Status = "saved"
	}
}
