package common

import (
	"bytes"
	_ "embed"
	"encoding/base64"
	"fmt"
	"mime/multipart"
	"mime/quotedprintable"
	"net/textproto"
	"regexp"
	"strings"
)

// This is fixed application artwork; mail input cannot choose an attachment.
//
//go:embed assets/mail-star-banner.gif
var mailStarBanner []byte

//go:embed assets/mail-star-sky.gif
var mailStarSky []byte

const MailStarBannerURL = "https://skymoni.com/static/mail/skymoni-mail-banner-20261011-d262de163a08.gif"
const mailStarBannerCID = "skymoni-star-banner-d262de163a08@skymoni.com"

// Preview uses a responsive background box because the console disallows img.
// SMTP replaces this exact server-owned fragment with a regular inline image.
const MailStarBannerPreviewHTML = `<div style="margin:0 0 12px;border-radius:10px;overflow:hidden"><div style="height:0;padding-top:16.77419355%;background:#0c1527;background-image:url('` + MailStarBannerURL + `');background-size:100% 100%;background-repeat:no-repeat"></div></div>`

const mailStarBannerImageHTML = `<div style="margin:0 0 12px;border-radius:10px;overflow:hidden"><img src="cid:` + mailStarBannerCID + `" width="620" height="104" alt="skymoni 星空" style="display:block;width:100%;height:auto;border:0" /></div>`

const MailStarSkyURL = "https://skymoni.com/static/mail/skymoni-mail-sky-20261011-c0d61da29c35.gif"
const mailStarSkyCID = "skymoni-star-sky-c0d61da29c35@skymoni.com"

// One background-bearing cell wraps the brand, all sections and the footer.
// Both the legacy background attribute and CSS refer to the fixed artwork.
const MailStarSkyPreviewCell = `<td background="` + MailStarSkyURL + `" bgcolor="#0c1527" style="padding:16px;word-break:break-word;background-color:#0c1527;background-image:url('` + MailStarSkyURL + `');background-size:100% auto;background-position:center top;background-repeat:repeat-y;border-radius:16px">`

var mailStarSkyCIDCell = strings.ReplaceAll(MailStarSkyPreviewCell, MailStarSkyURL, "cid:"+mailStarSkyCID)

func encodedHTMLBody(content string) ([]byte, error) {
	var body bytes.Buffer
	w := quotedprintable.NewWriter(&body)
	if _, err := w.Write([]byte(content)); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return body.Bytes(), nil
}

func buildEmailMIMEBody(content string) (headers string, body []byte, err error) {
	var assets []mailInlineImage
	if strings.Contains(content, MailStarBannerPreviewHTML) {
		content = strings.ReplaceAll(content, MailStarBannerPreviewHTML, mailStarBannerImageHTML)
		assets = append(assets, mailInlineImage{mailStarBannerCID, "skymoni-stars.gif", mailStarBanner, "image/gif"})
	}
	if strings.Contains(content, MailStarSkyPreviewCell) {
		content = strings.ReplaceAll(content, MailStarSkyPreviewCell, mailStarSkyCIDCell)
		assets = append(assets, mailInlineImage{mailStarSkyCID, "skymoni-star-sky.gif", mailStarSky, "image/gif"})
	}
	var imageErr error
	seen := map[string]bool{}
	pattern := regexp.MustCompile(`src="https://skymoni\.com/api/admin-mail-images/([a-f0-9]{64}\.(?:png|jpg|gif))"`)
	content = pattern.ReplaceAllStringFunc(content, func(match string) string {
		name := pattern.FindStringSubmatch(match)[1]
		data, mime, err := ReadAdminMailImage(name)
		if err != nil {
			imageErr = err
			return match
		}
		cid := "mail-image-" + name + "@skymoni.com"
		if !seen[name] {
			if len(seen) >= 4 {
				imageErr = fmt.Errorf("too many mail images")
				return match
			}
			seen[name] = true
			assets = append(assets, mailInlineImage{cid, name, data, mime})
		}
		return `src="cid:` + cid + `"`
	})
	if imageErr != nil {
		return "", nil, imageErr
	}
	if len(assets) == 0 {
		encoded, err := encodedHTMLBody(content)
		return "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n", encoded, err
	}
	var message bytes.Buffer
	writer := multipart.NewWriter(&message)
	htmlHeader := textproto.MIMEHeader{"Content-Type": {"text/html; charset=UTF-8"}, "Content-Transfer-Encoding": {"quoted-printable"}}
	part, err := writer.CreatePart(htmlHeader)
	if err != nil {
		return "", nil, err
	}
	encoded, err := encodedHTMLBody(content)
	if err != nil {
		return "", nil, err
	}
	if _, err := part.Write(encoded); err != nil {
		return "", nil, err
	}
	for _, asset := range assets {
		imageHeader := textproto.MIMEHeader{
			"Content-Type":              {asset.mime + "; name=" + asset.name},
			"Content-ID":                {"<" + asset.cid + ">"},
			"Content-Disposition":       {"inline; filename=" + asset.name},
			"Content-Transfer-Encoding": {"base64"},
		}
		part, err = writer.CreatePart(imageHeader)
		if err != nil {
			return "", nil, err
		}
		data := base64.StdEncoding.EncodeToString(asset.data)
		for len(data) > 0 {
			size := min(76, len(data))
			if _, err := part.Write([]byte(data[:size] + "\r\n")); err != nil {
				return "", nil, err
			}
			data = data[size:]
		}
	}
	if err := writer.Close(); err != nil {
		return "", nil, err
	}
	return `Content-Type: multipart/related; boundary="` + writer.Boundary() + `"` + "\r\n", message.Bytes(), nil
}

type mailInlineImage struct {
	cid, name string
	data      []byte
	mime      string
}
