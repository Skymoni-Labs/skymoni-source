package service

import (
	"fmt"
	"github.com/QuantumNous/new-api/model"
	"html"
	"strings"
	"time"
)

func modelSaleTimePriceMail(sale model.ModelSale) string {
	details := model.ModelSaleTimePriceDisplay(sale, time.Now())
	return renderModelSaleTimePrices(details)
}
func renderModelSaleTimePrices(details []model.ModelSaleTimePrices) string {
	if len(details) == 0 {
		return ""
	}
	var out strings.Builder
	out.WriteString(`<div style="margin:12px 0;padding:10px;text-align:left;background:#0b1628;border-radius:8px;color:#c1cde0;font-size:12px;line-height:1.7"><strong style="color:#e2ecff">高峰与普通时段分别降价</strong><p style="margin:4px 0">两档各用对应时段的官方价计算；以下为美元 / 百万 Token，按 ¥9.9 / 99 额度换算。计划价格须经成本核验并启用后生效。</p>`)
	for _, detail := range details {
		fmt.Fprintf(&out, `<p style="margin:8px 0 4px;color:#70c5ff;font-weight:700">%s</p>`, html.EscapeString(detail.Model))
		if detail.ScheduleText != "" {
			fmt.Fprintf(&out, `<p style="margin:3px 0;color:#97a9c4">%s</p>`, html.EscapeString(detail.ScheduleText))
		}
		for _, tier := range detail.Tiers {
			label := "普通时段"
			if tier.Label == "peak" {
				label = "高峰时段"
			}
			fmt.Fprintf(&out, `<p style="margin:3px 0"><strong>%s</strong>：输入 <del>$%s</del> → $%s；输出 <del>$%s</del> → $%s；缓存读取 <del>$%s</del> → $%s</p>`, label, mailSalePrice(tier.Original["p"]), mailSalePrice(tier.Target["p"]), mailSalePrice(tier.Original["c"]), mailSalePrice(tier.Target["c"]), mailSalePrice(tier.Original["cr"]), mailSalePrice(tier.Target["cr"]))
		}
	}
	// Conditions and excluded dates are rendered from the actual billing AST on
	// the linked activity page; do not duplicate a hardcoded holiday calendar.
	out.WriteString(`<p style="margin:6px 0 0;color:#97a9c4">高峰时间、北京时间及节假日例外见活动页；同一个模型按时段切换价格，两档均须满足成本保护。</p></div>`)
	return out.String()
}
func mailSalePrice(price float64) string {
	value := fmt.Sprintf("%.8f", price)
	return strings.TrimRight(strings.TrimRight(value, "0"), ".")
}
