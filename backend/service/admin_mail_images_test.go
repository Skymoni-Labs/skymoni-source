package service

import (
	"bytes"
	"github.com/QuantumNous/new-api/common"
	"image"
	"image/png"
	"strings"
	"testing"
)

func TestAdminMailUploadedImageRendering(t *testing.T) {
	t.Setenv("ADMIN_MAIL_IMAGE_DIR", t.TempDir())
	var input bytes.Buffer
	_ = png.Encode(&input, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	name, err := common.SaveAdminMailImage(input.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	block := `<div data-mail-image="` + name + `"></div>`
	for _, template := range []string{"", `<div data-mail-template="starry-compact-static">`} {
		body := template + `<p>Survey</p>` + block + `<img src="https://tracker.invalid/x" onerror="alert(1)"><script>alert(1)</script>`
		if template != "" {
			body += "</div>"
		}
		rendered, err := RenderAdminMail("Survey", body, "html")
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(rendered, `src="`+common.AdminMailImageURLPrefix+name+`"`) {
			t.Fatal("uploaded image missing")
		}
		if strings.Contains(rendered, "tracker.invalid") || strings.Contains(rendered, "onerror") || strings.Contains(rendered, "<script") {
			t.Fatal("unsafe content survived")
		}
		if !strings.Contains(rendered, "<body") || !strings.Contains(rendered, "<html") {
			t.Fatal("document layout lost")
		}
	}
	if _, err := RenderAdminMail("Survey", "<p>Hi</p>"+strings.Repeat(block, 5), "html"); err == nil {
		t.Fatal("image count not limited")
	}
	missing := `<div data-mail-image="` + strings.Repeat("f", 64) + `.png"></div>`
	if _, err := RenderAdminMail("Survey", "<p>Hi</p>"+missing, "html"); err == nil {
		t.Fatal("missing image accepted")
	}
}
