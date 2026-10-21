package service

import (
	"bytes"
	"errors"
	"fmt"
	"html"
	"net"
	"net/textproto"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

var adminMailHTMLPolicy = bluemonday.NewPolicy().
	AllowElements("p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "del", "ul", "ol", "li", "blockquote", "pre", "code", "hr", "table", "thead", "tbody", "tr", "th", "td", "a", "div", "span").
	AllowAttrs("href").OnElements("a").
	AllowAttrs("data-mail-image").Matching(common.AdminMailImageName).OnElements("div").
	AllowAttrs("data-model-sale").Matching(regexp.MustCompile(`^[a-f0-9]{32}$`)).OnElements("div").
	AllowAttrs("data-model-sale-layout").Matching(regexp.MustCompile(`^compact$`)).OnElements("div").
	AllowAttrs("data-mail-template").Matching(regexp.MustCompile(`^(starry|starry-motion|starry-compact|starry-compact-sky|starry-compact-static|starry-mini-static)$`)).OnElements("div").
	AllowAttrs("data-mail-block").Matching(regexp.MustCompile(`^(hero|feature|card|eyebrow|intro|signoff|columns|column-app|column-checkin|column|app-card|checkin-card|app-icon|checkin-icon|section|spotlight|guide|actions|resource|traffic|app-launch-card|daily-reward-card|app-kicker|reward-kicker|feature-metric|feature-note|feature-action|pocket-card|supply-card|pocket-mascot|supply-orbit|capsule-title|capsule-note|capsule-action)$`)).OnElements("div", "p", "span").
	AllowAttrs("data-mail-button").Matching(regexp.MustCompile(`^(primary|secondary|app-launch|daily-reward|pocket|supply)$`)).OnElements("a").
	AllowURLSchemes("http", "https", "mailto").
	RequireParseableURLs(true).
	RequireNoFollowOnLinks(true).
	RequireNoReferrerOnLinks(true)

func AdminMailSMTPReady() bool {
	return common.SMTPServer != "" && (common.SMTPFrom != "" || common.SMTPAccount != "")
}

// Preview and delivery use the same server-rendered, sanitized snapshot.
func RenderAdminMail(subject, content, format string) (string, error) {
	var body string
	switch format {
	case "text":
		body = "<p>" + strings.ReplaceAll(html.EscapeString(content), "\n", "<br>") + "</p>"
	case "markdown":
		var rendered bytes.Buffer
		if err := goldmark.New(goldmark.WithExtensions(extension.GFM)).Convert([]byte(content), &rendered); err != nil {
			return "", err
		}
		body = adminMailHTMLPolicy.Sanitize(rendered.String())
	case "html":
		body = adminMailHTMLPolicy.Sanitize(content)
	default:
		return "", errors.New("invalid email format")
	}
	if strings.TrimSpace(bluemonday.StrictPolicy().Sanitize(body)) == "" {
		return "", errors.New("email content has no readable text after sanitization")
	}
	if format == "html" {
		if rendered, matched, err := renderStarryAdminMail(subject, body); matched || err != nil {
			if err != nil {
				return "", err
			}
			return renderAdminMailWithImages(rendered)
		}
	}
	body, err := formatAdminMailBody(body)
	if err != nil {
		return "", err
	}
	rendered := fmt.Sprintf(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f8fb;font-family:Arial,'Microsoft YaHei',sans-serif;color:#294b61"><table role="presentation" width="100%%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #deedf5;border-radius:18px"><tr><td style="padding:28px;word-break:break-word"><p style="margin:0 0 20px;color:#329bc9;font-size:23px;font-weight:bold">☁ %s</p><h1 style="font-size:23px;margin:0 0 20px">%s</h1><div style="font-size:15px;line-height:1.8">%s</div><div style="border-top:1px solid #e7eff4;margin-top:24px;padding-top:16px;font-size:12px;color:#6b8291">此邮件由 %s 管理员发送。请通过站内客服入口联系管理员。</div></td></tr></table></td></tr></table></body></html>`, html.EscapeString(common.SystemName), html.EscapeString(subject), body, html.EscapeString(common.SystemName))
	return renderAdminMailWithImages(rendered)
}

// Inline formatting remains readable in email clients and in the site preview.
// Only server-owned styles are added, after all submitted styles are removed.
func formatAdminMailBody(body string) (string, error) {
	nodes, err := nethtml.ParseFragment(strings.NewReader(body), &nethtml.Node{Type: nethtml.ElementNode, Data: "div", DataAtom: atom.Div})
	if err != nil {
		return "", err
	}
	styles := map[string]string{
		"p":          "margin:0 0 14px",
		"h1":         "font-size:24px;font-weight:bold;margin:20px 0 12px",
		"h2":         "font-size:21px;font-weight:bold;margin:20px 0 12px",
		"h3":         "font-size:18px;font-weight:bold;margin:18px 0 10px",
		"h4":         "font-size:16px;font-weight:bold;margin:16px 0 8px",
		"h5":         "font-size:15px;font-weight:bold;margin:16px 0 8px",
		"h6":         "font-size:14px;font-weight:bold;margin:16px 0 8px",
		"ul":         "list-style-type:disc;margin:0 0 14px;padding-left:24px",
		"ol":         "list-style-type:decimal;margin:0 0 14px;padding-left:24px",
		"li":         "display:list-item;margin-bottom:4px",
		"blockquote": "border-left:3px solid #acd8ec;padding-left:14px;margin:14px 0;color:#637b8a",
		"pre":        "white-space:pre-wrap;padding:12px;background:#f3f8fb;border-radius:8px;margin:14px 0;font-family:monospace",
		"code":       "font-family:monospace;background:#f3f8fb",
		"a":          "color:#1984b5;text-decoration:underline",
		"table":      "border-collapse:collapse;width:100%;margin:14px 0",
		"th":         "border:1px solid #deedf5;padding:8px;text-align:left;background:#f3f8fb;font-weight:bold",
		"td":         "border:1px solid #deedf5;padding:8px;text-align:left",
		"hr":         "border:0;border-top:1px solid #deedf5;margin:18px 0",
	}
	var format func(*nethtml.Node)
	format = func(node *nethtml.Node) {
		if node.Type == nethtml.ElementNode {
			if style := styles[node.Data]; style != "" {
				node.Attr = append(node.Attr, nethtml.Attribute{Key: "style", Val: style})
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			format(child)
		}
	}
	var rendered bytes.Buffer
	for _, node := range nodes {
		format(node)
		if err := nethtml.Render(&rendered, node); err != nil {
			return "", err
		}
	}
	return rendered.String(), nil
}

// Sending is deliberately separate from claiming so the SMTP boundary can be
// exercised without sending to real users. Each recipient gets its own email.
func DeliverAdminMail(delivery *model.AdminMailDelivery, campaign *model.AdminMailCampaign, send func(string, string, string) error) error {
	if campaign.Audience == "emails" {
		if !model.ValidAdminMailAddress(delivery.Email) {
			return model.FinishAdminMailDelivery(delivery.Id, "skipped", "recipient_changed")
		}
	} else {
		user, err := model.GetUserById(delivery.UserId, false)
		if err != nil || user.Status != common.UserStatusEnabled || model.NormalizeEmail(user.Email) != delivery.Email {
			return model.FinishAdminMailDelivery(delivery.Id, "skipped", "recipient_changed")
		}
	}
	err := send(campaign.Subject, delivery.Email, string(campaign.Html))
	if err == nil {
		return model.FinishAdminMailDelivery(delivery.Id, "sent", "smtp_accepted")
	}
	var uncertain *common.EmailDeliveryUncertain
	if errors.As(err, &uncertain) {
		return model.FinishAdminMailDelivery(delivery.Id, "uncertain", "delivery_unknown")
	}
	result := adminMailFailureResult(err)
	common.SysError("admin mail delivery failed: " + result)
	return model.FinishAdminMailDelivery(delivery.Id, "failed", result)
}

func adminMailFailureResult(err error) string {
	var deliveryError *common.SMTPDeliveryError
	if !errors.As(err, &deliveryError) {
		return "smtp_failed"
	}
	result := "smtp_" + deliveryError.Stage
	var response *textproto.Error
	if errors.As(err, &response) {
		return fmt.Sprintf("%s_%d", result, response.Code)
	}
	var dnsError *net.DNSError
	if errors.As(err, &dnsError) {
		return result + "_dns"
	}
	var networkError net.Error
	if errors.As(err, &networkError) && networkError.Timeout() {
		return result + "_timeout"
	}
	return result
}
