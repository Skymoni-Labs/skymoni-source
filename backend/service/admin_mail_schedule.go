package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
	nethtml "golang.org/x/net/html"
)

func scheduledSaleFingerprint(ids []string) (string, error) {
	if len(ids) == 0 {
		return "", nil
	}
	reviewed := []any{}
	for _, id := range ids {
		var sale model.ModelSale
		if err := model.DB.First(&sale, "id = ?", id).Error; err != nil {
			return "", err
		}
		targets := []any{}
		for _, p := range sale.Plan {
			targets = append(targets, map[string]any{"name": p.Name, "target": p.Target})
		}
		reviewed = append(reviewed, map[string]any{"id": id, "title": sale.Title, "start_at": sale.StartAt, "end_at": sale.EndAt, "config": sale.Config, "targets": targets})
	}
	raw, err := json.Marshal(reviewed)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), nil
}

func linkedAdminMailSales(campaign *model.AdminMailCampaign) ([]string, error) {
	doc, err := nethtml.Parse(strings.NewReader(string(campaign.Content)))
	if err != nil {
		return nil, err
	}
	ids := []string{}
	seen := map[string]bool{}
	var walk func(*nethtml.Node) error
	walk = func(n *nethtml.Node) error {
		id := adminMailAttr(n, "data-model-sale")
		if id != "" {
			if !saleMailID.MatchString(id) {
				return errors.New("降价活动标识无效")
			}
			if !seen[id] {
				ids = append(ids, id)
				seen[id] = true
			}
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			if e := walk(child); e != nil {
				return e
			}
		}
		return nil
	}
	err = walk(doc)
	return ids, err
}

func ValidateAdminMailSchedule(campaign *model.AdminMailCampaign, sendAt int64, now time.Time) error {
	if sendAt < now.Unix()+60 || sendAt > now.Unix()+30*86400 {
		return errors.New("定时发送须在一分钟后至未来 30 天内")
	}
	if campaign.Status != "draft" && !(campaign.Status == "scheduled" && campaign.SendAt == sendAt) {
		return model.ErrAdminMailConflict
	}
	ids, err := linkedAdminMailSales(campaign)
	if err != nil {
		return err
	}
	for _, id := range ids {
		sale, quotes, e := model.CheckSavedModelSale(id, now)
		if e != nil {
			return e
		}
		if (sale.Status != "scheduled" && sale.Status != "active") || sendAt < sale.StartAt || sendAt >= sale.EndAt || model.ModelSalePublicationState(*sale, time.Unix(sendAt, 0)) != "published" {
			return errors.New("请先启用降价活动，并确保邮件发送时间处于已发布的活动期间")
		}
		for _, q := range quotes {
			if !q.Eligible {
				return errors.New("优惠邮件未定时：" + q.Model + " " + q.Reason)
			}
		}
	}
	campaign.ScheduleSaleFingerprint, err = scheduledSaleFingerprint(ids)
	return err
}

func PrepareScheduledAdminMail(campaign *model.AdminMailCampaign, now time.Time) (string, error) {
	if campaign.Status != "scheduled" || campaign.SendAt == 0 || campaign.SendAt > now.Unix() {
		return "", errors.New("尚未到邮件发送时间")
	}
	// A prolonged outage must not deliver an old newsletter days after its slot.
	if now.Unix()-campaign.SendAt > 3600 {
		return "", errors.New("定时发送已延误超过一小时，请核对活动后创建新邮件")
	}
	ids, err := linkedAdminMailSales(campaign)
	if err != nil {
		return "", err
	}
	fingerprint, err := scheduledSaleFingerprint(ids)
	if err != nil {
		return "", err
	}
	if fingerprint != campaign.ScheduleSaleFingerprint {
		return "", errors.New("降价活动的模型、价格或时间已修改，定时邮件未发送；请审核后创建新邮件")
	}
	for _, id := range ids {
		// Reuse the pricing scheduler's lock, captured price and cost guard. This
		// orders activation before mail even when both timers are due together.
		if e := model.TickModelSale(id, now); e != nil {
			return "", errors.New("优惠活动执行检查失败，邮件未发送")
		}
		var sale model.ModelSale
		if e := model.DB.First(&sale, "id = ?", id).Error; e != nil {
			return "", e
		}
		if sale.Status != "active" || now.Unix() < sale.StartAt || now.Unix() >= sale.EndAt {
			return "", errors.New("优惠价格尚未生效或活动已停止，定时邮件未发送；请查看活动成本检查结果")
		}
	}
	return PrepareModelSaleMailForSend(campaign)
}

func QueueDueAdminMailCampaigns(now time.Time) error {
	items, err := model.DueAdminMailCampaigns(now)
	if err != nil {
		return err
	}
	for _, campaign := range items {
		rendered, preparationError := PrepareScheduledAdminMail(&campaign, now)
		if e := model.FinishAdminMailSchedule(campaign, rendered, preparationError, now); e != nil {
			return e
		}
	}
	return nil
}
