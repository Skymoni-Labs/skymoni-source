package conversationlog

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/stretchr/testify/require"
	"image"
	"image/color"
	"image/png"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func sampleImage(t *testing.T) string {
	t.Helper()
	m := image.NewRGBA(image.Rect(0, 0, 2, 2))
	m.Set(0, 0, color.RGBA{255, 0, 0, 255})
	var b bytes.Buffer
	require.NoError(t, png.Encode(&b, m))
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())
}
func TestPrivateImageExtractionAndRetention(t *testing.T) {
	data := sampleImage(t)
	request, _ := json.Marshal(map[string]any{"model": "test", "messages": []any{
		map[string]any{"role": "system", "content": []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": "https://example.com/system.png"}}}},
		map[string]any{"role": "user", "content": []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": "https://example.com/history.png"}}}},
		map[string]any{"role": "user", "content": []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": data}}}},
	}})
	record, ok := Extract(Job{UserID: 7, At: time.Unix(0, 0), Request: request, Response: []byte(`{"choices":[{"message":{"content":"picture received"}}]}`)})
	require.True(t, ok)
	require.Empty(t, record.Input)
	require.Len(t, record.Images, 1)
	archiveImages(&record)
	require.Equal(t, "saved", record.Images[0].Status)
	require.Equal(t, data, record.Images[0].Data)
	require.Empty(t, record.Images[0].Source)
	raw, _ := json.Marshal(record)
	require.NotContains(t, string(raw), "example.com")
	dir := t.TempDir()
	old := filepath.Join(dir, "00000000000000000001-deadbeef.jsonl")
	require.NoError(t, os.WriteFile(old, bytes.Repeat([]byte("x"), 100*1024), 0600))
	record.Output = string(bytes.Repeat([]byte("a"), 32*1024))
	r := Recorder{directory: dir, budget: 128 * 1024, instance: "aabbccdd"}
	require.NoError(t, r.appendRecord(record))
	_, err := os.Stat(old)
	require.True(t, os.IsNotExist(err))
}
func TestImageProtocolVariants(t *testing.T) {
	data := sampleImage(t)
	_, encoded, _ := bytes.Cut([]byte(data), []byte(","))
	for _, tc := range []struct {
		name      string
		req, resp any
	}{
		{"claude", map[string]any{"messages": []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "image", "source": map[string]any{"type": "base64", "media_type": "image/png", "data": string(encoded)}}}}}}, map[string]any{"content": []any{map[string]any{"type": "text", "text": "A"}}}},
		{"gemini", map[string]any{"contents": []any{map[string]any{"role": "user", "parts": []any{map[string]any{"text": "Q"}}}}}, map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{map[string]any{"inlineData": map[string]any{"mimeType": "image/png", "data": string(encoded)}}}}}}}},
		{"responses", map[string]any{"input": []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "input_image", "image_url": data}}}}}, map[string]any{"output_text": "A"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req, _ := json.Marshal(tc.req)
			resp, _ := json.Marshal(tc.resp)
			r, ok := Extract(Job{Request: req, Response: resp})
			require.True(t, ok)
			require.Len(t, r.Images, 1)
			archiveImages(&r)
			require.Equal(t, "saved", r.Images[0].Status)
		})
	}
	collector := newImageCollector()
	collector.text("output", "![a](https://example.com/a.png) ![a](https://example.com/a.png)")
	require.Len(t, collector.images, 1)
}
func TestImageFetchSecurityAndLimits(t *testing.T) {
	for _, addr := range []string{"127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.100.100.200", "0.0.0.0", "::1", "fc00::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "2001:db8::1"} {
		require.False(t, publicImageIP(netip.MustParseAddr(addr)), addr)
	}
	require.True(t, publicImageIP(netip.MustParseAddr("1.1.1.1")))
	for _, source := range []string{"http://example.com/a.png", "https://user:pass@example.com/a.png", "https://example.com:8080/a.png", "file:///etc/passwd"} {
		u, _ := url.Parse(source)
		require.False(t, validImageURL(u))
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err := fetchImage(ctx, "https://127.0.0.1/a.png")
	require.Error(t, err)
	_, err = imageMIME([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>evil()</script></svg>`))
	require.Error(t, err)
	_, err = fetchImage(ctx, "data:image/png;base64,"+string(bytes.Repeat([]byte("A"), imageLimit*2)))
	require.Error(t, err)
	r := Record{Images: []Image{{Side: "input", Source: "data:image/svg+xml;base64,PHN2Zy8+"}}}
	archiveImages(&r)
	require.Empty(t, r.Images[0].Data)
	require.Empty(t, r.Images[0].Source)
}
