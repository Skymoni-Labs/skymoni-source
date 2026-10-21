package service

import (
	"fmt"
	"github.com/QuantumNous/new-api/model"
	"html"
	"strings"
	"time"
)

// Compact linked blocks use the same database prices and scheduling guards as
// the full countdown. They avoid repeating animated clocks for one shared slot.
func modelSaleCompactTimeMail(sale model.ModelSale, state string) string {
	var out strings.Builder
	out.WriteString(`<div style="margin:7px 0;padding:9px 10px;background:#101c30;border:1px solid #29405f;border-radius:9px;color:#c1cde0;font-size:11px;line-height:1.6;text-align:left">`)
	details := model.ModelSaleTimePriceDisplay(sale, time.Now())
	for _, detail := range details {
		base := 0.
		for _, tier := range detail.Tiers {
			if tier.Label == "off_peak" {
				base = tier.Official["p"]
			}
		}
		name := detail.Model
		switch name {
		case "deepseek-v4-pro":
			name = "DeepSeek Pro"
		case "deepseek-flash":
			name = "DeepSeek Flash"
		case "deepseek-v4.1-flash-low":
			name = "DeepSeek Flash Low"
		}
		fmt.Fprintf(&out, `<p style="margin:0 0 3px;color:#83caff;font-weight:700">%s</p>`, html.EscapeString(name))
		if base > 0 {
			for _, tier := range detail.Tiers {
				label := "普通"
				if tier.Label == "peak" {
					label = "高峰"
				}
				fmt.Fprintf(&out, `<span>%s <del>%s×</del> → <strong style="color:#f4f7ff">%s×</strong>　</span>`, label, mailSalePrice(tier.Original["p"]/base), mailSalePrice(tier.Target["p"]/base))
			}
		}
		fmt.Fprintf(&out, `<p style="margin:3px 0 0;color:#97a9c4">%s</p>`, html.EscapeString(detail.ScheduleText))
	}
	if len(details) == 0 {
		fmt.Fprintf(&out, `<strong>%s</strong>`, html.EscapeString(sale.Title))
	}
	if sale.Status != "active" || model.ModelSalePublicationState(sale, time.Now()) != "published" {
		fmt.Fprintf(&out, `<p style="margin:3px 0;color:#97a9c4">%s</p>`, html.EscapeString(state))
	}
	fmt.Fprintf(&out, `<a href="https://skymoni.com/model-offers/%s" style="color:#70c5ff;text-decoration:none">查看价格与活动 →</a></div>`, sale.ID)
	return out.String()
}
