package common

import (
	"fmt"
	"html"
	"strings"
)

// AccountEmailContent keeps account messages readable without remote images or CSS.
// All dynamic values are escaped before they enter the email HTML.
func AccountEmailContent(site, code, resetLink string, minutes int) string {
	title := "验证您的邮箱"
	intro := "您正在验证邮箱，请在网站的验证码输入框中填写以下验证码："
	action := fmt.Sprintf(`<div style="background:#eef8fd;border:1px solid #d6eaf5;border-radius:16px;padding:22px;text-align:center;font:700 30px monospace;letter-spacing:7px;color:#247fa9">%s</div>`, html.EscapeString(code))
	if resetLink != "" {
		title = "重置您的密码"
		intro = "我们收到了您的密码重置申请。请点击下方按钮，继续设置新密码："
		link := html.EscapeString(resetLink)
		action = fmt.Sprintf(`<p style="text-align:center;margin:28px 0"><a href="%s" style="display:inline-block;background:#329bc9;color:#fff;padding:14px 30px;border-radius:12px;text-decoration:none;font-weight:bold">重置密码</a></p><p style="font-size:12px;color:#667d8c">按钮无法打开？请复制以下完整链接到浏览器：</p><p style="font-size:12px;word-break:break-all"><a href="%s" style="color:#247fa9">%s</a></p>`, link, link, link)
	}
	content := fmt.Sprintf(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f8fb;font-family:Arial,'Microsoft YaHei',sans-serif;color:#294b61"><table role="presentation" width="100%%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 16px"><table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #deedf5;border-radius:22px"><tr><td style="padding:30px"><p style="margin:0 0 24px;color:#329bc9;font-size:23px;font-weight:bold">☁ %s</p><h1 style="font-size:24px;margin:0 0 18px">%s</h1><p style="font-size:15px;line-height:1.8">您好，</p><p style="font-size:15px;line-height:1.8">%s</p>%s<p style="font-size:14px;line-height:1.8;margin-top:24px">本次验证在 <strong>%d 分钟</strong>内有效，请尽快完成操作。</p><p style="background:#fff8e7;border-radius:12px;padding:14px;font-size:13px;line-height:1.8;color:#806b3b">请勿将验证码或验证链接转发给他人，客服不会向您索取验证码。若非您本人操作，请忽略此邮件。</p><div style="border-top:1px solid #e7eff4;margin-top:26px;padding-top:18px;color:#6b8291;font-size:12px;line-height:1.9">此邮件由系统自动发送。<br>需要帮助？联系 skymoni客服：<a href="mailto:792521914@qq.com" style="color:#247fa9">792521914@qq.com</a><br>官方网站：<a href="https://skymoni.com" style="color:#247fa9">skymoni.com</a></div></td></tr></table></td></tr></table></body></html>`, html.EscapeString(site), title, intro, action, minutes)
	return strings.ReplaceAll(content, "><", ">\r\n<")
}
