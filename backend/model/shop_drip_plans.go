package model

import (
	"fmt"
	"html"
	"sort"
	"strconv"
	"strings"
)

func dripPlanQuota(pack ShopPackage) (int, error) {
	quota := pack.QuotaGiB
	if quota == 0 { // Compatibility with catalogues saved before explicit quota fields.
		var err error
		quota, err = generatedDripQuota(pack.ID, pack.Name)
		if err != nil {
			return 0, err
		}
	}
	if quota < 1 || quota > 100000 {
		return 0, ErrShopInvalid
	}
	return quota, nil
}

func normalizeDripPlans(c *ShopConfig) error {
	quota, err := dripPlanQuota(shopPackages(*c)[0])
	if err != nil {
		return err
	}
	c.QuotaGiB = quota
	for i := range c.Packages {
		quota, err := dripPlanQuota(c.Packages[i])
		if err != nil {
			return err
		}
		c.Packages[i].QuotaGiB = quota
	}
	for _, pack := range shopPackages(*c) {
		if pack.ValidityDays < 1 || pack.ValidityDays > 3650 || pack.Delivery != "instant" {
			return ErrShopInvalid
		}
	}
	return nil
}

func planCredit(cents int64) string {
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", float64(cents)/100), "0"), ".")
}

func sortedDripPlans(c ShopConfig) []ShopPackage {
	plans := shopPackages(c)
	sort.SliceStable(plans, func(i, j int) bool {
		a, _ := dripPlanQuota(plans[i])
		b, _ := dripPlanQuota(plans[j])
		return a < b
	})
	return plans
}

const planBlockStart = "<!-- skymoni:plans:start -->"
const planBlockEnd = "<!-- skymoni:plans:end -->"

func stripPlanBlock(text string) string {
	for {
		start := strings.Index(text, planBlockStart)
		if start < 0 {
			return strings.TrimSpace(text)
		}
		end := strings.Index(text[start:], planBlockEnd)
		if end < 0 {
			return strings.TrimSpace(text[:start])
		}
		text = text[:start] + text[start+end+len(planBlockEnd):]
	}
}

// Retire the previous generated pricing sentence once. Other prose stays editable.
func legacyDripLine(c ShopConfig) string {
	var parts []string
	days := c.Benefit.ValidityDays
	for _, pack := range sortedDripPlans(c) {
		parts = append(parts, pack.Name+"＝"+planCredit(pack.PriceCents))
		if pack.ValidityDays != days {
			return ""
		}
	}
	return strings.Join(parts, "、") + "（均为站内额度）；所有新购套餐有效 " + strconv.Itoa(days) + " 天"
}

func dripPlanTable(c ShopConfig, format string) string {
	plans := sortedDripPlans(c)
	var out strings.Builder
	if format == "html" {
		out.WriteString("<section><h3>套餐配置</h3><table><thead><tr><th>套餐</th><th>流量</th><th>站内额度</th><th>有效期</th></tr></thead><tbody>")
		for _, p := range plans {
			fmt.Fprintf(&out, "<tr><td>%s</td><td>%d GiB</td><td>%s</td><td>%d 天</td></tr>", html.EscapeString(p.Name), p.QuotaGiB, planCredit(p.PriceCents), p.ValidityDays)
		}
		out.WriteString("</tbody></table><p>普通订阅每单独立计算。兑换到 Drip 账号时，只合并尚未使用的流量与剩余时长；已购订单保留购买时的配置。</p></section>")
	} else if format == "text" {
		out.WriteString("套餐配置\n")
		for _, p := range plans {
			fmt.Fprintf(&out, "%s：%d GiB，%s 站内额度，%d 天\n", p.Name, p.QuotaGiB, planCredit(p.PriceCents), p.ValidityDays)
		}
	} else {
		out.WriteString("### 套餐配置\n\n| 套餐 | 流量 | 站内额度 | 有效期 |\n| --- | --- | --- | --- |\n")
		for _, p := range plans {
			fmt.Fprintf(&out, "| %s | %d GiB | %s | %d 天 |\n", strings.ReplaceAll(html.EscapeString(p.Name), "|", "&#124;"), p.QuotaGiB, planCredit(p.PriceCents), p.ValidityDays)
		}
		out.WriteString("\n普通订阅每单独立计算。兑换到 Drip 账号时，只合并剩余流量与时长；已购订单保留购买时的配置。")
	}
	return planBlockStart + "\n" + out.String() + "\n" + planBlockEnd
}

func syncDripPlanText(c *ShopConfig, previous ShopConfig) {
	oldLine := legacyDripLine(previous)
	clean := func(text string) string {
		text = stripPlanBlock(text)
		if oldLine != "" {
			text = strings.ReplaceAll(text, oldLine, "各档流量、售价和有效期见套餐配置表")
		}
		return strings.TrimSpace(text)
	}
	c.Content = clean(c.Content) + "\n\n" + dripPlanTable(*c, c.ContentFormat)
	c.Benefit.Instructions = clean(c.Benefit.Instructions) + "\n\n" + dripPlanTable(*c, c.Benefit.Format)
	plans := sortedDripPlans(*c)
	minPrice, minDays, maxDays := plans[0].PriceCents, plans[0].ValidityDays, plans[0].ValidityDays
	var prices []string
	for _, p := range plans {
		if p.PriceCents < minPrice {
			minPrice = p.PriceCents
		}
		if p.ValidityDays < minDays {
			minDays = p.ValidityDays
		}
		if p.ValidityDays > maxDays {
			maxDays = p.ValidityDays
		}
		prices = append(prices, fmt.Sprintf("%d GiB＝%s", p.QuotaGiB, planCredit(p.PriceCents)))
	}
	period := fmt.Sprintf("%d 天", minDays)
	if minDays != maxDays {
		period = fmt.Sprintf("%d～%d 天，各档见套餐表", minDays, maxDays)
	}
	c.Benefit.Summary = fmt.Sprintf("%d～%d GiB，%s 站内额度起，有效期 %s。购买即交付独立订阅；兑换到 Drip 可合并剩余权益。", plans[0].QuotaGiB, plans[len(plans)-1].QuotaGiB, planCredit(minPrice), period)
	values := map[string]string{"使用期限": period + "；已购订单保留购买时的期限", "套餐价格（站内额度）": strings.Join(prices, "、")}
	for label, value := range values {
		runes := []rune(value)
		if len(runes) > 500 {
			value = string(runes[:497]) + "…"
		}
		found := false
		for i := range c.Attributes {
			if c.Attributes[i].Label == label {
				c.Attributes[i].Value = value
				found = true
			}
		}
		if !found && len(c.Attributes) < 20 {
			c.Attributes = append(c.Attributes, ShopAttribute{Label: label, Value: value})
		}
	}
	var tags []string
	for _, tag := range strings.Fields(c.Tags) {
		if strings.Contains(tag, "GiB") || strings.HasSuffix(tag, "天") {
			continue
		}
		tags = append(tags, tag)
	}
	c.Tags = strings.Join(tags, " ")
}

// The encrypted order snapshot is the duration authority, including retries
// after the administrator edits or removes the package.
func ShopOrderDurationDays(order ShopOrder) (int, error) {
	var config BenefitConfig
	if err := decryptBenefit(order.Encrypted, "shop-order", &config); err != nil {
		return 0, err
	}
	if config.ValidityDays < 0 || config.ValidityDays > 3650 {
		return 0, ErrShopInvalid
	}
	return config.ValidityDays, nil
}

func applyDripReceiptPlan(c *BenefitConfig, order ShopOrder, detail bool) error {
	days, err := ShopOrderDurationDays(order)
	if err != nil {
		return err
	}
	period := fmt.Sprintf("%d 天", days)
	if days == 0 { // Legacy orders stored their expiry only in the subscription service.
		period = "原订阅期限（以订阅面板为准）"
	}
	c.Summary = fmt.Sprintf("%d GiB · %s · 实付 %s 站内额度；权益按购买时配置。", order.DripQuotaGiB, period, planCredit(order.PriceCents))
	if detail {
		c.ValidityDays = days
		instructions := stripPlanBlock(c.Instructions)
		note := "之后商品调价、修改套餐或移除档位均不改变本订单购买时的价格、流量和期限。"
		if c.Format == "html" {
			c.Instructions = "<p>" + html.EscapeString(c.Summary) + "</p>" + instructions + "<p>" + note + "</p>"
		} else {
			c.Instructions = c.Summary + "\n\n" + instructions + "\n\n" + note
		}
	}
	return nil
}
