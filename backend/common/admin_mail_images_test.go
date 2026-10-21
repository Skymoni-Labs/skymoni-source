package common

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"strings"
	"testing"
)

func TestUploadedMailImageValidationAndMIME(t *testing.T) {
	t.Setenv("ADMIN_MAIL_IMAGE_DIR", t.TempDir())
	for _, bad := range [][]byte{[]byte(`<svg onload="alert(1)"></svg>`), []byte("not an image"), make([]byte, AdminMailImageMaxBytes+1)} {
		if _, err := SaveAdminMailImage(bad); err == nil {
			t.Fatal("accepted invalid image")
		}
	}
	var input bytes.Buffer
	_ = png.Encode(&input, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	name, err := SaveAdminMailImage(input.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := ReadAdminMailImage("../../secret"); err == nil {
		t.Fatal("accepted traversal")
	}
	headers, body, err := buildEmailMIMEBody(`<p>Hello</p><img src="` + AdminMailImageURLPrefix + name + `"><img src="` + AdminMailImageURLPrefix + name + `">`)
	if err != nil {
		t.Fatal(err)
	}
	_, params, err := mime.ParseMediaType(strings.TrimSpace(strings.TrimPrefix(headers, "Content-Type: ")))
	if err != nil {
		t.Fatal(err)
	}
	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	part, err := reader.NextPart()
	if err != nil {
		t.Fatal(err)
	}
	html, err := io.ReadAll(quotedprintable.NewReader(part))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(html), `src="cid:mail-image-`) != 2 {
		t.Fatalf("missing CID images: %s", html)
	}
	part, err = reader.NextPart()
	if err != nil {
		t.Fatal(err)
	}
	if part.Header.Get("Content-Type") != "image/png; name="+name {
		t.Fatal(part.Header)
	}
	data, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, part))
	if err != nil || !bytes.Equal(data, input.Bytes()) {
		t.Fatal("attachment changed")
	}
	if _, err = reader.NextPart(); err != io.EOF {
		t.Fatal("duplicate attachment")
	}
}
