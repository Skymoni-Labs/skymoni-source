package service

import (
	"bytes"
	"fmt"
	"html"
	"strings"

	"github.com/QuantumNous/new-api/common"
	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// Fixed layout tokens select server-owned presentation, never submitted CSS.
// The preset is opt-in for HTML messages and leaves existing mail snapshots alone.
func renderStarryAdminMail(subject, body string) (string, bool, error) {
	nodes, err := nethtml.ParseFragment(strings.NewReader(body), &nethtml.Node{Type: nethtml.ElementNode, Data: "div", DataAtom: atom.Div})
	if err != nil {
		return "", false, err
	}
	var root *nethtml.Node
	for _, node := range nodes {
		if node.Type == nethtml.TextNode && strings.TrimSpace(node.Data) == "" {
			continue
		}
		if root != nil || node.Type != nethtml.ElementNode || node.Data != "div" || (adminMailAttr(node, "data-mail-template") != "starry" && adminMailAttr(node, "data-mail-template") != "starry-motion" && adminMailAttr(node, "data-mail-template") != "starry-compact" && adminMailAttr(node, "data-mail-template") != "starry-compact-sky" && adminMailAttr(node, "data-mail-template") != "starry-compact-static" && adminMailAttr(node, "data-mail-template") != "starry-mini-static") {
			return "", false, nil
		}
		root = node
	}
	if root == nil {
		return "", false, nil
	}
	fullSky := adminMailAttr(root, "data-mail-template") == "starry-compact-sky"
	mini := adminMailAttr(root, "data-mail-template") == "starry-mini-static"
	fullStatic := adminMailAttr(root, "data-mail-template") == "starry-compact-static" || mini
	compact := adminMailAttr(root, "data-mail-template") == "starry-compact" || fullSky || fullStatic
	styles := map[string]string{
		"p":          "margin:0 0 14px;color:#c1cde0",
		"h1":         "font-size:28px;line-height:1.4;font-weight:700;letter-spacing:-0.5px;margin:12px 0 18px;color:#f4f7ff",
		"h2":         "font-size:22px;line-height:1.45;font-weight:700;margin:0 0 12px;color:#f4f7ff",
		"h3":         "font-size:18px;line-height:1.5;font-weight:700;margin:0 0 8px;color:#f4f7ff",
		"h4":         "font-size:16px;line-height:1.5;margin:0 0 8px;color:#f4f7ff",
		"h5":         "font-size:15px;margin:0 0 8px;color:#f4f7ff",
		"h6":         "font-size:14px;margin:0 0 8px;color:#f4f7ff",
		"a":          "color:#70c5ff;text-decoration:none;font-weight:600;overflow-wrap:anywhere",
		"ul":         "margin:0 0 14px;padding-left:22px;list-style-type:disc",
		"ol":         "margin:0 0 14px;padding-left:22px;list-style-type:decimal",
		"li":         "margin:0 0 6px;display:list-item",
		"blockquote": "margin:14px 0;padding-left:14px;border-left:3px solid #37aaff;color:#c1cde0",
		"pre":        "white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:#101e33;border:1px solid #29405f;border-radius:8px;margin:14px 0;font-family:monospace",
		"code":       "font-family:monospace;background:#101e33;color:#c1cde0",
		"table":      "width:100%;border-collapse:collapse;margin:14px 0",
		"td":         "border:1px solid #29405f;padding:8px;text-align:left;color:#c1cde0",
		"th":         "border:1px solid #29405f;padding:8px;text-align:left;background:#101e33;color:#f4f7ff;font-weight:bold",
		"hr":         "border:0;border-top:1px solid #29405f;margin:22px 0",
	}
	blocks := map[string]string{
		"hero":           "text-align:center;padding:4px 0 26px;margin:0",
		"feature":        "background:#101e33;border:1px solid #29405f;border-radius:16px;padding:22px;margin:0 0 16px",
		"card":           "padding:20px 0;border-bottom:1px solid #243650;margin:0",
		"eyebrow":        "font-size:12px;line-height:1.6;letter-spacing:1.2px;font-weight:700;color:#83caff;margin:0 0 10px",
		"intro":          "font-size:15px;line-height:1.85;color:#c1cde0;margin:0",
		"signoff":        "text-align:center;padding:26px 0 4px;color:#c1cde0",
		"columns":        "font-size:0;line-height:0;text-align:center;margin:0 -2px",
		"column-app":     "display:inline-block;vertical-align:top;width:100%;max-width:281px;box-sizing:border-box;padding:6px;font-size:15px;line-height:1.8;text-align:left",
		"column-checkin": "display:inline-block;vertical-align:top;width:100%;max-width:281px;box-sizing:border-box;padding:6px;font-size:15px;line-height:1.8;text-align:left",
		"column":         "display:inline-block;vertical-align:top;width:100%;max-width:281px;box-sizing:border-box;padding:6px;font-size:15px;line-height:1.8;text-align:left",
		"app-card":       "text-align:center;background:#122b48;background-image:linear-gradient(145deg,#163b61,#101e34);border:1px solid #345a83;border-radius:16px;padding:22px 16px;min-height:268px;box-sizing:border-box",
		"checkin-card":   "text-align:center;background:#211d3d;background-image:linear-gradient(145deg,#30264f,#141b32);border:1px solid #51416e;border-radius:16px;padding:22px 16px;min-height:268px;box-sizing:border-box",
		"app-icon":       "display:block;width:54px;height:44px;line-height:44px;text-align:center;margin:0 auto 16px;background:#1d5680;border:1px solid #478abd;border-radius:13px;color:#d6f2ff;font-size:14px;letter-spacing:1px;font-weight:700",
		"checkin-icon":   "display:block;width:54px;height:44px;line-height:44px;text-align:center;margin:0 auto 16px;background:#46345e;border:1px solid #76609a;border-radius:13px;color:#e6d5ff;font-size:28px;font-weight:700",
		"section":        "text-align:center;padding:32px 4px 2px;margin:0",
		"spotlight":      "background:#101c30;border:1px solid #293d58;border-radius:16px;padding:22px;margin:18px 4px 0;text-align:left",
		"guide":          "border-top:1px solid #293d58;padding:20px 0 0;margin:20px 0 0",
		"actions":        "text-align:right;margin:16px 0 0;font-size:14px;line-height:1.8",
		"resource":       "border-left:2px solid #355879;padding:6px 0 6px 16px;margin:18px 0 8px;text-align:left",
		"traffic":        "text-align:center;background:#151e34;border:1px solid #34405b;border-radius:14px;padding:20px;margin:28px 4px 0",
	}
	if compact {
		styles["p"] = "font-size:14px;line-height:1.65;margin:0 0 8px;color:#c1cde0"
		styles["h1"] = "font-size:24px;line-height:1.35;font-weight:700;margin:6px 0 10px;color:#f4f7ff"
		styles["h2"] = "font-size:18px;line-height:1.4;font-weight:700;margin:0 0 6px;color:#f4f7ff"
		styles["h3"] = "font-size:16px;line-height:1.4;font-weight:700;margin:0 0 5px;color:#f4f7ff"
		blocks["hero"] = "text-align:center;padding:0 0 10px;margin:0"
		blocks["intro"] = "font-size:14px;line-height:1.65;color:#c1cde0;margin:0"
		blocks["eyebrow"] = "font-size:11px;line-height:1.5;letter-spacing:.6px;font-weight:700;color:#83caff;margin:0 0 6px"
		blocks["columns"] = "font-size:0;line-height:0;text-align:center;margin:0 -4px"
		for _, key := range []string{"column", "column-app", "column-checkin"} {
			blocks[key] = "display:inline-block;vertical-align:top;width:50%;box-sizing:border-box;padding:4px;font-size:14px;line-height:1.65;text-align:left"
		}
		blocks["app-card"] = "text-align:center;background:#122b48;border:1px solid #345a83;border-radius:12px;padding:14px 8px;box-sizing:border-box"
		blocks["checkin-card"] = "text-align:center;background:#211d3d;border:1px solid #51416e;border-radius:12px;padding:14px 8px;box-sizing:border-box"
		blocks["section"] = "text-align:center;padding:14px 0 0;margin:0"
		blocks["spotlight"] = "background:#101c30;border:1px solid #293d58;border-radius:12px;padding:14px;margin:10px 0 0;text-align:left"
		blocks["guide"] = "border-top:1px solid #293d58;padding:12px 0 0;margin:12px 0 0"
		blocks["actions"] = "text-align:right;margin:6px 0 0;font-size:13px;line-height:1.6"
		blocks["resource"] = "border-left:2px solid #355879;padding:4px 0 4px 10px;margin:8px 0 0;text-align:left"
		blocks["traffic"] = "text-align:center;background:#151e34;border:1px solid #34405b;border-radius:12px;padding:12px;margin:14px 0 0"
		blocks["signoff"] = "text-align:center;padding:14px 0 0;color:#c1cde0"
	}
	if mini {
		styles["p"] = "font-size:13px;line-height:1.55;margin:0 0 6px;color:#c1cde0"
		styles["h1"] = "font-size:22px;line-height:1.3;font-weight:700;margin:4px 0 8px;color:#f4f7ff"
		styles["h2"] = "font-size:17px;line-height:1.35;font-weight:700;margin:0 0 5px;color:#f4f7ff"
		styles["h3"] = "font-size:15px;line-height:1.35;font-weight:700;margin:0 0 4px;color:#f4f7ff"
		blocks["hero"] = "text-align:center;padding:0 0 8px;margin:0"
		blocks["intro"] = "font-size:13px;line-height:1.55;color:#c1cde0;margin:0"
		for _, key := range []string{"column", "column-app", "column-checkin"} {
			blocks[key] = "display:inline-block;vertical-align:top;width:50%;box-sizing:border-box;padding:4px;font-size:13px;line-height:1.55;text-align:left"
		}
		for _, key := range []string{"app-card", "checkin-card"} {
			blocks[key] = strings.ReplaceAll(blocks[key], "padding:14px 8px", "padding:11px 7px")
		}
		blocks["section"] = "text-align:center;padding:11px 0 0;margin:0"
		blocks["spotlight"] = "background:#101c30;border:1px solid #293d58;border-radius:12px;padding:11px;margin:8px 0 0;text-align:left"
		blocks["guide"] = "border-top:1px solid #293d58;padding:9px 0 0;margin:9px 0 0"
		blocks["actions"] = "text-align:right;margin:4px 0 0;font-size:13px;line-height:1.55"
		blocks["resource"] = "border-left:2px solid #355879;padding:3px 0 3px 8px;margin:6px 0 0;text-align:left"
		blocks["traffic"] = "text-align:center;background:#151e34;border:1px solid #34405b;border-radius:12px;padding:10px;margin:11px 0 0"
		blocks["signoff"] = "text-align:center;padding:11px 0 0;color:#c1cde0"
	}
	if fullSky || fullStatic {
		for key, color := range map[string]string{"app-card": "rgba(18,43,72,.72)", "checkin-card": "rgba(33,29,61,.72)", "spotlight": "rgba(16,28,48,.70)", "traffic": "rgba(21,30,52,.72)"} {
			style := blocks[key]
			start := strings.Index(style, "background:")
			end := start + strings.Index(style[start:], ";")
			blocks[key] = style[:end] + ";background:" + color + style[end:]
		}
	}
	// Explicit card tokens keep saved messages on their original presentation.
	// Block layout and inline colors also work without flexbox or media queries.
	blocks["app-launch-card"] = "text-align:left;background:#10263b;background-image:linear-gradient(155deg,#12334e,#102039);border:1px solid #2e4c67;border-top:2px solid #66c5ff;border-radius:12px;padding:12px 10px;min-height:164px;box-sizing:border-box"
	blocks["daily-reward-card"] = "text-align:left;background:#241e39;background-image:linear-gradient(155deg,#302647,#1d2037);border:1px solid #514369;border-top:2px solid #c8a7ff;border-radius:12px;padding:12px 10px;min-height:164px;box-sizing:border-box"
	blocks["app-kicker"] = "font-size:10px;line-height:1.5;font-weight:600;letter-spacing:.3px;color:#87d5ff;margin:0 0 4px"
	blocks["reward-kicker"] = "font-size:10px;line-height:1.5;font-weight:600;letter-spacing:.3px;color:#d1b9ff;margin:0 0 4px"
	blocks["feature-metric"] = "font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-.8px;color:#f4f7ff;margin:0 0 8px"
	blocks["feature-note"] = "font-size:12px;line-height:1.45;color:#b9c9df;margin:0"
	blocks["feature-action"] = "margin:10px 0 0;line-height:1.5"
	// New opt-in capsules retain existing sent-message snapshots and restrict
	// illustration URLs to a server-owned brand asset, never submitted markup.
	blocks["pocket-card"] = "text-align:left;background:#122b42;background-image:radial-gradient(ellipse at 90% 10%,#215b7666,transparent 70%);border:1px solid #3d647d;border-radius:18px 18px 18px 5px;padding:11px 12px;min-height:168px;box-sizing:border-box"
	blocks["supply-card"] = "text-align:center;background:#28223d;background-image:radial-gradient(ellipse at 50% 20%,#55407466,transparent 70%);border:1px solid #645078;border-radius:18px 18px 5px 18px;padding:11px 12px;min-height:168px;box-sizing:border-box"
	blocks["pocket-mascot"] = "height:46px;line-height:46px;margin:2px 0 3px"
	blocks["supply-orbit"] = "height:46px;line-height:46px;margin:2px 0 3px;color:#f0dcff;font-size:27px;font-weight:700;letter-spacing:-.6px"
	blocks["capsule-title"] = "font-size:14px;font-weight:700;line-height:1.4;color:#f4f7ff;margin:0 0 3px"
	blocks["capsule-note"] = "font-size:11px;line-height:1.5;color:#bdcde2;margin:0"
	blocks["capsule-action"] = "border-top:1px dashed #8ca7cd44;padding-top:7px;margin:8px 0 0;line-height:1.5"
	var format func(*nethtml.Node)
	format = func(node *nethtml.Node) {
		if node.Type == nethtml.ElementNode {
			style := styles[node.Data]
			if node.Data == "div" || node.Data == "p" || node.Data == "span" {
				if blockStyle := blocks[adminMailAttr(node, "data-mail-block")]; blockStyle != "" {
					style = blockStyle
				}
			}
			if node.Data == "a" {
				switch adminMailAttr(node, "data-mail-button") {
				case "primary":
					style = "display:inline-block;background:#37aaff;color:#071120;border:1px solid #37aaff;border-radius:9px;padding:11px 18px;font-size:14px;line-height:1.5;font-weight:700;text-decoration:none;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere"
				case "secondary":
					style = "display:inline-block;background:#142b45;color:#a0dbff;border:1px solid #36597f;border-radius:9px;padding:11px 18px;font-size:14px;line-height:1.5;font-weight:700;text-decoration:none;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere"
				case "app-launch":
					style = "display:block;width:100%;text-align:center;background:#66c5ff;color:#071524;border:1px solid #66c5ff;border-radius:7px;padding:8px 6px;font-size:12px;line-height:1.5;font-weight:700;text-decoration:none;box-sizing:border-box;overflow-wrap:anywhere"
				case "daily-reward":
					style = "display:block;width:100%;text-align:center;background:#cfb5ff;color:#211330;border:1px solid #cfb5ff;border-radius:7px;padding:8px 6px;font-size:12px;line-height:1.5;font-weight:700;text-decoration:none;box-sizing:border-box;overflow-wrap:anywhere"
				case "pocket":
					style = "display:inline-block;color:#95dcff;font-size:12px;line-height:1.5;font-weight:700;text-decoration:none;overflow-wrap:anywhere"
				case "supply":
					style = "display:inline-block;color:#e3c8ff;font-size:12px;line-height:1.5;font-weight:700;text-decoration:none;overflow-wrap:anywhere"
				}
				if compact && (adminMailAttr(node, "data-mail-button") == "primary" || adminMailAttr(node, "data-mail-button") == "secondary") {
					style = strings.ReplaceAll(strings.ReplaceAll(style, "padding:11px 18px", "padding:8px 10px"), "font-size:14px", "font-size:13px")
				}
			}
			if adminMailAttr(node, "data-mail-block") == "pocket-mascot" {
				// Submitted children cannot choose an image or hide the text fallback.
				for node.FirstChild != nil {
					node.RemoveChild(node.FirstChild)
				}
				node.AppendChild(&nethtml.Node{Type: nethtml.ElementNode, Data: "img", DataAtom: atom.Img, Attr: []nethtml.Attribute{
					{Key: "src", Val: "https://skymoni.com/branding/skymoni-cloud-friend-transparent.png"},
					{Key: "alt", Val: "☁ skymoni"}, {Key: "width", Val: "46"}, {Key: "height", Val: "46"},
					{Key: "style", Val: "display:block;width:46px;height:46px;object-fit:contain;border:0"},
				}})
			}
			attrs := node.Attr[:0]
			for _, attr := range node.Attr {
				if (attr.Key == "data-mail-image" || !strings.HasPrefix(attr.Key, "data-mail-")) && attr.Key != "style" {
					attrs = append(attrs, attr)
				}
			}
			node.Attr = attrs
			if style != "" {
				node.Attr = append(node.Attr, nethtml.Attribute{Key: "style", Val: style})
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if child.Type != nethtml.ElementNode || child.Data != "img" {
				format(child)
			}
		}
	}
	animated := adminMailAttr(root, "data-mail-template") == "starry-motion"
	format(root)
	var rendered bytes.Buffer
	if err := nethtml.Render(&rendered, root); err != nil {
		return "", true, err
	}
	if compact {
		cell := `<td style="padding:16px;word-break:break-word;border-radius:16px">`
		banner := common.MailStarBannerPreviewHTML
		if fullSky {
			cell = common.MailStarSkyPreviewCell
			banner = ""
		}
		if fullStatic {
			cell = common.MailStaticSkyPreviewCell
			banner = ""
		}
		result := fmt.Sprintf(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>%s</title></head><body bgcolor="#080f20" style="margin:0;background:#080f20;font-family:Arial,'Microsoft YaHei',sans-serif;color:#c1cde0"><table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#080f20"><tr><td align="center" style="padding:12px 8px"><table role="presentation" width="100%%" cellspacing="0" cellpadding="0" bgcolor="#0c1527" style="max-width:620px;background:#0c1527;border:1px solid #243650;border-radius:16px"><tr>%s<p style="font-size:20px;line-height:1.4;font-weight:700;text-align:center;margin:0 0 10px;color:#83caff">☁ %s <span style="font-size:10px;font-weight:400;color:#a9bdd6;letter-spacing:1px">/ WHAT'S NEW</span></p>%s<div style="font-size:14px;line-height:1.65;color:#c1cde0">%s</div><div style="border-top:1px solid #243650;text-align:center;margin-top:14px;padding-top:10px;font-size:11px;line-height:1.65;color:#a9bdd6">此邮件由 %s 管理员发送。<br>如需帮助，请通过站内客服入口联系我们。</div></td></tr></table></td></tr></table></body></html>`, html.EscapeString(subject), cell, html.EscapeString(common.SystemName), banner, rendered.String(), html.EscapeString(common.SystemName))
		if mini {
			for _, change := range [][2]string{
				{"padding:16px;word-break", "padding:12px;word-break"},
				{"padding:12px 8px", "padding:10px 8px"},
				{"font-size:20px;line-height:1.4", "font-size:18px;line-height:1.35"},
				{"margin:0 0 10px;color:#83caff", "margin:0 0 8px;color:#83caff"},
				{"font-size:14px;line-height:1.65;color:#c1cde0", "font-size:13px;line-height:1.55;color:#c1cde0"},
				{"margin-top:14px;padding-top:10px", "margin-top:11px;padding-top:8px"},
			} {
				result = strings.ReplaceAll(result, change[0], change[1])
			}
		}
		return result, true, nil
	}
	return fmt.Sprintf(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>%s</title></head><body bgcolor="#080f20" style="margin:0;background:#080f20;font-family:Arial,'Microsoft YaHei',sans-serif;color:#c1cde0"><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">%s</div><table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#080f20"><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="100%%" cellspacing="0" cellpadding="0" bgcolor="#0c1527" style="max-width:620px;background:#0c1527;border:1px solid #243650;border-radius:20px"><tr><td style="padding:24px;word-break:break-word;%s;border-radius:20px"><p style="font-size:22px;line-height:1.4;font-weight:700;text-align:center;margin:4px 0 24px;color:#83caff">☁ %s <span style="font-size:11px;font-weight:400;color:#a9bdd6;letter-spacing:2px">/ WHAT'S NEW</span></p><div style="font-size:15px;line-height:1.85;color:#c1cde0">%s</div><div style="border-top:1px solid #243650;text-align:center;margin-top:24px;padding-top:16px;font-size:12px;line-height:1.8;color:#a9bdd6">此邮件由 %s 管理员发送。<br>如需帮助，请通过站内客服入口联系我们。</div></td></tr></table></td></tr></table></body></html>`, html.EscapeString(subject), html.EscapeString(subject), starryMailBackgroundStyle(animated), html.EscapeString(common.SystemName), rendered.String(), html.EscapeString(common.SystemName)), true, nil
}

func adminMailAttr(node *nethtml.Node, key string) string {
	for _, attr := range node.Attr {
		if attr.Key == key {
			return attr.Val
		}
	}
	return ""
}

const starryMailAnimationURL = "https://skymoni.com/static/mail/skymoni-mail-stars-20261011-a7df1c3fc667.gif"

func starryMailBackgroundStyle(animated bool) string {
	const fallback = `radial-gradient(circle at 92% 3%,rgba(82,164,255,.30) 0,rgba(82,164,255,0) 190px),radial-gradient(circle at 7% 19%,rgba(75,204,239,.13) 0,rgba(75,204,239,0) 160px),radial-gradient(circle at 86% 8%,#6a96c2 0 1px,transparent 2px),radial-gradient(circle at 70% 4%,#6a96c2 0 1px,transparent 2px),radial-gradient(circle at 95% 21%,#6a96c2 0 1px,transparent 2px),radial-gradient(circle at 4% 46%,#6a96c2 0 1px,transparent 2px)`
	if !animated {
		return "background-image:" + fallback
	}
	// Keep the fallback glow near the top on tall mobile layouts so the GIF
	// blends into the solid sky rather than ending above a second glow.
	motionFallback := strings.ReplaceAll(strings.ReplaceAll(fallback, "92% 3%", "92% 36px"), "7% 19%", "7% 200px")
	return "background-image:url('" + starryMailAnimationURL + "')," + motionFallback + ";background-size:100% auto,auto,auto,auto,auto,auto,auto;background-position:center top;background-repeat:no-repeat;background-color:#0c1527"
}
