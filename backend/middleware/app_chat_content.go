package middleware

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"strings"

	_ "golang.org/x/image/webp"
)

type appChatMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
}

// Only account chat accepts bounded, inline user images. Legacy device chat
// remains text-only; no external URL fetching, tools or billing overrides.
func validAppChatContent(raw json.RawMessage, role string, responses, images bool) bool {
	var text string
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return false
	}
	if json.Unmarshal(raw, &text) == nil {
		return true
	}
	if !images {
		return false
	}
	var parts []json.RawMessage
	if json.Unmarshal(raw, &parts) != nil || len(parts) == 0 || len(parts) > 16 {
		return false
	}
	imageCount := 0
	for _, part := range parts {
		var p struct {
			Type     string          `json:"type"`
			Text     *string         `json:"text,omitempty"`
			ImageURL json.RawMessage `json:"image_url,omitempty"`
		}
		d := json.NewDecoder(bytes.NewReader(part))
		d.DisallowUnknownFields()
		if d.Decode(&p) != nil || d.Decode(new(any)) != io.EOF {
			return false
		}
		textType, imageType := "text", "image_url"
		if responses {
			textType, imageType = "input_text", "input_image"
		}
		if p.Type == textType {
			if p.Text == nil || p.ImageURL != nil {
				return false
			}
			continue
		}
		if p.Type != imageType || p.Text != nil || role != "user" {
			return false
		}
		imageCount++
		if imageCount > 1 {
			return false
		}
		var url string
		if responses {
			if json.Unmarshal(p.ImageURL, &url) != nil {
				return false
			}
		} else {
			var value struct {
				URL string `json:"url"`
			}
			d := json.NewDecoder(bytes.NewReader(p.ImageURL))
			d.DisallowUnknownFields()
			if d.Decode(&value) != nil {
				return false
			}
			url = value.URL
		}
		if !validAppInlineImage(url) {
			return false
		}
	}
	return true
}

func validAppInlineImage(url string) bool {
	if len(url) > 210000 {
		return false
	}
	header, encoded, ok := strings.Cut(url, ",")
	if !ok {
		return false
	}
	formats := map[string]string{"data:image/png;base64": "png", "data:image/jpeg;base64": "jpeg", "data:image/webp;base64": "webp"}
	want, ok := formats[header]
	if !ok {
		return false
	}
	data, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil || len(data) == 0 || len(data) > 144*1024 {
		return false
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	return err == nil && format == want && config.Width > 0 && config.Height > 0 && config.Width <= 4096 && config.Height <= 4096
}
