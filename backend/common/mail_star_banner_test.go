package common

import (
	"bytes"
	"encoding/base64"
	"image/gif"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func verifyStarBannerMessage(t *testing.T, raw string) {
	t.Helper()
	message, err := mail.ReadMessage(strings.NewReader(raw))
	require.NoError(t, err)
	mediaType, params, err := mime.ParseMediaType(message.Header.Get("Content-Type"))
	require.NoError(t, err)
	require.Equal(t, "multipart/related", mediaType)
	reader := multipart.NewReader(message.Body, params["boundary"])
	htmlPart, err := reader.NextPart()
	require.NoError(t, err)
	htmlBody, err := io.ReadAll(htmlPart)
	require.NoError(t, err)
	require.Contains(t, string(htmlBody), `src="cid:`+mailStarBannerCID+`"`)
	require.Contains(t, string(htmlBody), "正文 $1–$3")
	require.NotContains(t, string(htmlBody), MailStarBannerURL)
	part, err := reader.NextPart()
	require.NoError(t, err)
	require.Equal(t, "<"+mailStarBannerCID+">", part.Header.Get("Content-ID"))
	require.Equal(t, "base64", part.Header.Get("Content-Transfer-Encoding"))
	data, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, part))
	require.NoError(t, err)
	require.Equal(t, mailStarBanner, data)
	animation, err := gif.DecodeAll(bytes.NewReader(data))
	require.NoError(t, err)
	require.Len(t, animation.Image, 64)
	require.Equal(t, 0, animation.LoopCount)
	require.NotEqual(t, animation.Image[0].Pix, animation.Image[21].Pix)
	_, err = reader.NextPart()
	require.ErrorIs(t, err, io.EOF)
}

func TestEmailMIMEStarBanner(t *testing.T) {
	headers, body, err := buildEmailMIMEBody("<p>正文 $1–$3</p>" + MailStarBannerPreviewHTML)
	require.NoError(t, err)
	verifyStarBannerMessage(t, "MIME-Version: 1.0\r\n"+headers+"\r\n"+string(body))
}

func verifyStarSkyMessage(t *testing.T, raw string) {
	t.Helper()
	message, err := mail.ReadMessage(strings.NewReader(raw))
	require.NoError(t, err)
	mediaType, params, err := mime.ParseMediaType(message.Header.Get("Content-Type"))
	require.NoError(t, err)
	require.Equal(t, "multipart/related", mediaType)
	reader := multipart.NewReader(message.Body, params["boundary"])
	part, err := reader.NextPart()
	require.NoError(t, err)
	htmlBody, err := io.ReadAll(part)
	require.NoError(t, err)
	require.Contains(t, string(htmlBody), `background="cid:`+mailStarSkyCID+`"`)
	require.Contains(t, string(htmlBody), `background-image:url('cid:`+mailStarSkyCID+`')`)
	require.Contains(t, string(htmlBody), "正文 $1–$3")
	require.NotContains(t, string(htmlBody), MailStarSkyURL)
	require.NotContains(t, string(htmlBody), "<img")
	part, err = reader.NextPart()
	require.NoError(t, err)
	require.Equal(t, "<"+mailStarSkyCID+">", part.Header.Get("Content-ID"))
	data, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, part))
	require.NoError(t, err)
	require.Equal(t, mailStarSky, data)
	animation, err := gif.DecodeAll(bytes.NewReader(data))
	require.NoError(t, err)
	require.Len(t, animation.Image, 64)
	require.Equal(t, 620, animation.Config.Width)
	require.Equal(t, 840, animation.Config.Height)
	require.Equal(t, 0, animation.LoopCount)
	require.NotEqual(t, animation.Image[0].Pix, animation.Image[21].Pix)
	_, err = reader.NextPart()
	require.ErrorIs(t, err, io.EOF)
}

func TestSendEmailStarSkySMTP(t *testing.T) {
	withSMTPSettings(t)
	server := newFakeSMTPServerWithSTARTTLSAdvertisement(t, false)
	defer server.close()
	SMTPServer, SMTPPort, SMTPAccount, SMTPToken, SMTPFrom, SMTPSSLEnabled = server.host, server.port, "sender@example.com", "token", "sender@example.com", false
	require.NoError(t, SendEmail("整体星空", "recipient@example.com", `<table><tr>`+MailStarSkyPreviewCell+"<p>正文 $1–$3</p></td></tr></table>"))
	select {
	case raw := <-server.messages:
		verifyStarSkyMessage(t, raw)
	case <-time.After(3 * time.Second):
		t.Fatal("SMTP did not receive message")
	}
}

func TestStaticSkyMIMEKeepsPublicPNGBackground(t *testing.T) {
	content := `<table><tr>` + MailStaticSkyPreviewCell + "<p>站内额度 $1–$3</p></td></tr></table>"
	headers, body, err := buildEmailMIMEBody(content)
	require.NoError(t, err)
	require.Contains(t, headers, "Content-Type: text/html; charset=UTF-8")
	require.NotContains(t, headers, "multipart")
	decoded, err := io.ReadAll(quotedprintable.NewReader(bytes.NewReader(body)))
	require.NoError(t, err)
	require.Equal(t, content, string(decoded))
	require.NotContains(t, string(decoded), "cid:")
	require.Contains(t, string(decoded), `background="`+MailStaticSkyURL+`"`)
	require.Contains(t, string(decoded), "radial-gradient(")
	require.NotContains(t, mailStaticSkyCSS, "url(")
}

func TestEmailMIMEDefaultDoesNotAttachSubmittedImages(t *testing.T) {
	for _, content := range []string{"<p>普通邮件</p>", `<div style="background-image:url('https://tracker.invalid/x.gif')">Hello</div>`} {
		headers, body, err := buildEmailMIMEBody(content)
		require.NoError(t, err)
		require.Contains(t, headers, "Content-Type: text/html; charset=UTF-8")
		require.Contains(t, headers, "quoted-printable")
		require.NotContains(t, headers, "multipart")
		require.NotContains(t, string(body), "Content-ID")
	}
}

func TestSendEmailStarBannerSMTP(t *testing.T) {
	withSMTPSettings(t)
	server := newFakeSMTPServerWithSTARTTLSAdvertisement(t, false)
	defer server.close()
	SMTPServer, SMTPPort, SMTPAccount, SMTPToken, SMTPFrom, SMTPSSLEnabled = server.host, server.port, "sender@example.com", "token", "sender@example.com", false
	require.NoError(t, SendEmail("星空测试", "recipient@example.com", "<p>正文 $1–$3</p>"+MailStarBannerPreviewHTML))
	select {
	case raw := <-server.messages:
		verifyStarBannerMessage(t, raw)
	case <-time.After(3 * time.Second):
		t.Fatal("SMTP did not receive message")
	}
}
