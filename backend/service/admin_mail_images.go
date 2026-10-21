package service

import (
	"bytes"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"strings"
)

// Only uploaded raster images may be materialized after sanitization.
func renderAdminMailImages(body string) (string, error) {
	if !strings.Contains(body, "data-mail-image") {
		return body, nil
	}
	document, err := nethtml.Parse(strings.NewReader(body))
	if err != nil {
		return "", err
	}
	count := 0
	var visit func(*nethtml.Node) error
	visit = func(n *nethtml.Node) error {
		if name := adminMailAttr(n, "data-mail-image"); name != "" {
			count++
			if count > 4 {
				return fmt.Errorf("每封邮件最多插入 4 张图片")
			}
			if _, _, err := common.ReadAdminMailImage(name); err != nil {
				return fmt.Errorf("邮件图片不存在，请重新上传")
			}
			for n.FirstChild != nil {
				n.RemoveChild(n.FirstChild)
			}
			n.Attr = nil
			n.AppendChild(&nethtml.Node{Type: nethtml.ElementNode, Data: "img", DataAtom: atom.Img, Attr: []nethtml.Attribute{
				{Key: "src", Val: common.AdminMailImageURLPrefix + name}, {Key: "alt", Val: "邮件配图"}, {Key: "width", Val: "600"},
				{Key: "style", Val: "display:block;width:100%;max-width:600px;height:auto;margin:16px auto;border:0;border-radius:12px"},
			}})
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			if err := visit(child); err != nil {
				return err
			}
		}
		return nil
	}
	var out bytes.Buffer
	if err := visit(document); err != nil {
		return "", err
	}
	if err := nethtml.Render(&out, document); err != nil {
		return "", err
	}
	return out.String(), nil
}

func renderAdminMailWithImages(body string) (string, error) {
	rendered, err := renderAdminMailImages(body)
	if err != nil {
		return "", err
	}
	return renderModelSaleMailBlocks(rendered)
}
