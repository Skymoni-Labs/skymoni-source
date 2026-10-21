package service

import (
	"bytes"
	"fmt"
	"github.com/QuantumNous/new-api/model"
	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"html"
	"regexp"
	"strings"
	"time"
)

var saleMailID = regexp.MustCompile(`^[a-f0-9]{32}$`)

func renderModelSaleMailBlocks(document string) (string, error) {
	if !strings.Contains(document, "data-model-sale") {
		return document, nil
	}
	parsed, err := nethtml.Parse(strings.NewReader(document))
	if err != nil {
		return "", err
	}
	var visit func(*nethtml.Node) error
	visit = func(node *nethtml.Node) error {
		id := adminMailAttr(node, "data-model-sale")
		if id != "" {
			if !saleMailID.MatchString(id) {
				return fmt.Errorf("降价倒计时活动标识无效")
			}
			var sale model.ModelSale
			if err := model.DB.First(&sale, "id = ?", id).Error; err != nil {
				return fmt.Errorf("降价活动不存在")
			}
			mode := "活动截止"
			deadline := sale.EndAt
			if sale.Config.CountdownMode == "start" || (sale.Config.CountdownMode == "auto" && time.Now().Unix() < sale.StartAt) {
				deadline = sale.StartAt
				mode = "活动开始"
			}
			state := "指定模型独立优惠价格；具体价格以模型广场为准"
			if sale.Status == "draft" || sale.Status == "paused" {
				state = "预览：活动尚未启用"
			} else if sale.Status != "active" && sale.Status != "scheduled" {
				state = "活动已停止，请查看站内状态"
			}
			publication := model.ModelSalePublicationState(sale, time.Now())
			if sale.AnnouncementManaged {
				if publication == "scheduled" {
					publishedAt := time.Unix(sale.AnnouncementAt, 0).In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("01月02日 15:04")
					state = "预览：公告将于 " + publishedAt + "（北京时间）发布；当前价格未变"
					mode = "公告发布"
					deadline = sale.AnnouncementAt
				} else if publication == "unpublished" {
					state = "预览：公告尚未发布"
				}
				if publication == "published" && (sale.Status == "draft" || sale.Status == "paused") {
					state = "降价预告：实际降价待管理员启用，当前价格未变"
					mode = "计划" + mode
				}
			}
			at := time.Unix(deadline, 0).In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006年01月02日 15:04")
			timePrices := modelSaleTimePriceMail(sale)
			compact := adminMailAttr(node, "data-model-sale-layout") == "compact"
			block := fmt.Sprintf(`<div style="margin:12px 0;padding:16px;background:#101c30;border:1px solid #29405f;border-radius:12px;text-align:center;color:#c1cde0"><p style="margin:0 0 5px;font-size:17px;font-weight:700;color:#f4f7ff">%s</p><p style="margin:0 0 10px;font-size:13px;color:#83caff">%s</p><a href="https://skymoni.com/model-offers/%s"><img src="https://skymoni.com/api/model-sales/public/%s/countdown.gif" width="620" height="132" alt="翻页倒计时；%s：%s（北京时间）" style="display:block;width:100%%;max-width:620px;height:auto;border:0;margin:auto" /></a><p style="margin:10px 0 6px;font-size:12px;color:#c1cde0">%s：%s（北京时间）</p><p style="margin:0 0 10px;font-size:11px;color:#97a9c4">以截止时间及活动页实时状态为准；不支持动画时显示静态画面。</p><a href="https://skymoni.com/model-offers/%s" style="color:#70c5ff;font-size:13px;font-weight:700;text-decoration:none">查看模型优惠与实时倒计时 →</a></div>`, html.EscapeString(sale.Title), html.EscapeString(state), id, id, mode, at, mode, at, id)
			if timePrices != "" {
				block = strings.Replace(block, `<a href="https://skymoni.com/model-offers/`+id+`" style=`, timePrices+`<a href="https://skymoni.com/model-offers/`+id+`" style=`, 1)
			}
			if compact {
				block = modelSaleCompactTimeMail(sale, state)
			}
			fragments, e := nethtml.ParseFragment(strings.NewReader(block), &nethtml.Node{Type: nethtml.ElementNode, Data: "div", DataAtom: atom.Div})
			if e != nil {
				return e
			}
			for node.FirstChild != nil {
				node.RemoveChild(node.FirstChild)
			}
			for _, child := range fragments {
				node.AppendChild(child)
			}
			node.Attr = nil
			return nil
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if err := visit(child); err != nil {
				return err
			}
		}
		return nil
	}
	if err = visit(parsed); err != nil {
		return "", err
	}
	var out bytes.Buffer
	err = nethtml.Render(&out, parsed)
	return out.String(), err
}
