package service

import (
	"bytes"
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/model"
	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"html"
	"strings"
	"time"
)

type ModelSaleMailDraftInput struct {
	Revision    int    `json:"revision"`
	BaseDraftID int    `json:"base_draft_id"`
	RequestKey  string `json:"request_key"`
}

func InsertModelSaleMail(source, id string) (string, error) {
	if !saleMailID.MatchString(id) {
		return "", errors.New("活动标识无效")
	}
	doc, err := nethtml.Parse(strings.NewReader(source))
	if err != nil {
		return "", err
	}
	var body, root *nethtml.Node
	var walk func(*nethtml.Node)
	walk = func(n *nethtml.Node) {
		if n.Type == nethtml.ElementNode && n.Data == "body" {
			body = n
		}
		if adminMailAttr(n, "data-mail-template") != "" && root == nil {
			root = n
		}
		for child := n.FirstChild; child != nil; {
			next := child.NextSibling
			if adminMailAttr(child, "data-model-sale") != "" {
				n.RemoveChild(child)
			} else {
				walk(child)
			}
			child = next
		}
	}
	walk(doc)
	if root == nil {
		root = body
	}
	if root == nil {
		return "", errors.New("邮件内容无效")
	}
	marker := &nethtml.Node{Type: nethtml.ElementNode, Data: "div", DataAtom: atom.Div, Attr: []nethtml.Attribute{{Key: "data-model-sale", Val: id}}}
	marker.AppendChild(&nethtml.Node{Type: nethtml.TextNode, Data: "模型限时降价翻页倒计时"})
	root.InsertBefore(marker, root.FirstChild)
	var out bytes.Buffer
	for child := body.FirstChild; child != nil; child = child.NextSibling {
		if err = nethtml.Render(&out, child); err != nil {
			return "", err
		}
	}
	return out.String(), nil
}

func CreateModelSaleMailDraft(id string, in ModelSaleMailDraftInput, actor int) (*model.AdminMailCampaign, error) {
	var sale model.ModelSale
	if err := model.DB.First(&sale, "id = ?", id).Error; err != nil {
		return nil, err
	}
	if sale.Revision != in.Revision {
		return nil, model.ErrModelSaleConflict
	}
	source := fmt.Sprintf(`<div data-mail-template="starry-mini-static"><p data-mail-block="brand">skymoni / 模型优惠</p><h1 data-mail-block="hero">%s</h1><p data-mail-block="lead">精选模型限时降价。查看当前活动和模型价格，再按使用文档接入。</p><p><a data-mail-button="app" href="https://skymoni.com/pricing">查看模型价格 →</a></p><p><a href="https://skymoni.com/docs">查看接入教程 →</a></p></div>`, html.EscapeString(sale.Title))
	subject := "skymoni｜" + sale.Title
	if in.BaseDraftID > 0 {
		base, err := model.GetAdminMailCampaign(in.BaseDraftID)
		if err != nil {
			return nil, err
		}
		if base.Format != "html" {
			return nil, errors.New("请选择 HTML 格式的上新邮件")
		}
		source = string(base.Content)
		subject = "skymoni 更新｜" + sale.Title + "，App 与签到福利同步升级"
	}
	content, err := InsertModelSaleMail(source, id)
	if err != nil {
		return nil, err
	}
	input := model.AdminMailInput{RequestKey: in.RequestKey, Subject: subject, Content: content, Format: "html", Audience: "all_users"}
	if err = model.ValidateAdminMailInput(&input); err != nil {
		return nil, err
	}
	rendered, err := RenderAdminMail(input.Subject, input.Content, input.Format)
	if err != nil {
		return nil, err
	}
	return model.CreateAdminMailDraft(input, rendered, actor)
}

// Refresh linked activity blocks at queue time so an enabled activity is not
// sent using the stale "not enabled" snapshot made when the draft was saved.
// Inactive activities can be mailed to explicit test addresses as a preview;
// broad recipient selections require an intact enabled activity and fresh cost.
func PrepareModelSaleMailForSend(campaign *model.AdminMailCampaign) (string, error) {
	if !strings.Contains(string(campaign.Content), "data-model-sale") {
		return string(campaign.Html), nil
	}
	doc, err := nethtml.Parse(strings.NewReader(string(campaign.Content)))
	if err != nil {
		return "", err
	}
	var visit func(*nethtml.Node) error
	visit = func(n *nethtml.Node) error {
		id := adminMailAttr(n, "data-model-sale")
		if id != "" {
			var sale model.ModelSale
			if e := model.DB.First(&sale, "id = ?", id).Error; e != nil {
				return e
			}
			if campaign.Audience != "emails" {
				if model.ModelSalePublicationState(sale, time.Now()) != "published" {
					return errors.New("优惠活动未启用或已结束，不能向用户群发；可先发送到测试邮箱预览")
				}
				_, quotes, e := model.CheckSavedModelSale(id, time.Now())
				if e != nil {
					return e
				}
				for _, q := range quotes {
					if !q.Eligible {
						return errors.New("优惠邮件未发送：" + q.Model + " " + q.Reason)
					}
				}
				offers, _, e := model.CurrentModelSaleOffers(time.Now())
				if e != nil {
					return e
				}
				found := false
				for _, o := range offers {
					if o.ID == id {
						found = true
					}
				}
				if !found {
					return errors.New("优惠价格已经变化，请重新核验活动后再发送")
				}
			}
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			if e := visit(child); e != nil {
				return e
			}
		}
		return nil
	}
	if err = visit(doc); err != nil {
		return "", err
	}
	return RenderAdminMail(campaign.Subject, string(campaign.Content), campaign.Format)
}
