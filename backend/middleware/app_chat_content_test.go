package middleware

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"strings"
	"testing"
)

func TestAppInlineImageContent(t *testing.T) {
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 2, 2))); err != nil {
		t.Fatal(err)
	}
	uri := "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())
	chat := `[{"type":"text","text":"照片"},{"type":"image_url","image_url":{"url":"` + uri + `"}}]`
	responses := `[{"type":"input_text","text":"照片"},{"type":"input_image","image_url":"` + uri + `"}]`
	for _, tc := range []struct {
		name, content, role     string
		responses, images, want bool
	}{
		{"legacy text", `"你好"`, "user", false, false, true},
		{"account chat image", chat, "user", false, true, true},
		{"account responses image", responses, "user", true, true, true},
		{"legacy device rejects image", chat, "user", false, false, false},
		{"assistant image", chat, "assistant", false, true, false},
		{"wrong protocol", chat, "user", true, true, false},
		{"external URL", strings.Replace(chat, uri, "https://127.0.0.1/internal", 1), "user", false, true, false},
		{"mismatched MIME", strings.Replace(chat, "image/png", "image/jpeg", 1), "user", false, true, false},
		{"tool block", `[{"type":"tool_call","name":"anything"}]`, "user", false, true, false},
		{"extra part fields", `[{"type":"text","text":"hi","billing":"x"}]`, "user", false, true, false},
		{"null", `null`, "user", false, true, false},
		{"empty parts", `[]`, "user", false, true, false},
		{"invalid image", `[{"type":"image_url","image_url":{"url":"data:image/png;base64,YWJj"}}]`, "user", false, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := validAppChatContent(json.RawMessage(tc.content), tc.role, tc.responses, tc.images); got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
	if validAppInlineImage("data:image/png;base64," + strings.Repeat("A", 210000)) {
		t.Fatal("unbounded image accepted")
	}
}
