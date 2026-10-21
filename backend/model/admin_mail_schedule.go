package model

import (
	"errors"
	"time"
)

// The database owns the one-time schedule. Draft content and recipients remain
// immutable; a CAS prevents cancellation or another worker from queuing twice.
func ScheduleAdminMailCampaign(id int, sendAt int64, now time.Time, fingerprints ...string) error {
	if sendAt < now.Unix()+60 || sendAt > now.Unix()+30*86400 {
		return errors.New("定时发送须在一分钟后至未来 30 天内")
	}
	fingerprint := ""
	if len(fingerprints) > 0 {
		fingerprint = fingerprints[0]
	}
	result := DB.Model(&AdminMailCampaign{}).Where("id = ? AND status = ?", id, "draft").Updates(map[string]any{
		"status": "scheduled", "send_at": sendAt, "schedule_error": "", "schedule_sale_fingerprint": fingerprint,
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 1 {
		return nil
	}
	campaign, err := GetAdminMailCampaign(id)
	if err != nil {
		return err
	}
	if campaign.Status == "scheduled" && campaign.SendAt == sendAt {
		return nil
	}
	return ErrAdminMailConflict
}

func DueAdminMailCampaigns(now time.Time) ([]AdminMailCampaign, error) {
	var items []AdminMailCampaign
	err := DB.Where("status = ? AND send_at <= ? AND send_at > 0", "scheduled", now.Unix()).Order("send_at, id").Limit(10).Find(&items).Error
	return items, err
}

func FinishAdminMailSchedule(campaign AdminMailCampaign, rendered string, preparationError error, now time.Time) error {
	if campaign.SendAt > now.Unix() || campaign.SendAt == 0 {
		return errors.New("尚未到邮件发送时间")
	}
	updates := map[string]any{"status": "queued", "queued_at": now.Unix(), "html": rendered, "schedule_error": ""}
	if preparationError != nil {
		updates = map[string]any{"status": "schedule_failed", "schedule_error": preparationError.Error()}
	} else if rendered == "" {
		return errors.New("定时邮件内容为空")
	}
	return DB.Model(&AdminMailCampaign{}).Where("id = ? AND status = ? AND send_at = ?", campaign.Id, "scheduled", campaign.SendAt).Updates(updates).Error
}
