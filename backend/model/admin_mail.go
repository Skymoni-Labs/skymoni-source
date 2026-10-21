package model

import (
	"errors"
	"net/mail"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const AdminMailMaxContentBytes = 64 * 1024
const AdminMailMaxRecipients = 5000

var ErrAdminMailConflict = errors.New("email draft conflicts with the existing request")

type AdminMailInput struct {
	RequestKey string   `json:"request_key"`
	Subject    string   `json:"subject"`
	Content    string   `json:"content"`
	Format     string   `json:"format"`
	Audience   string   `json:"audience"`
	UserIds    []int    `json:"user_ids"`
	Emails     []string `json:"emails"`
}

type AdminMailCampaign struct {
	Id                      int                `json:"id"`
	RequestKey              string             `json:"-" gorm:"size:36;uniqueIndex"`
	Subject                 string             `json:"subject" gorm:"size:200"`
	Content                 PopupNoticeContent `json:"content"`
	Html                    PopupNoticeContent `json:"html"`
	Format                  string             `json:"format" gorm:"size:16"`
	Audience                string             `json:"audience" gorm:"size:16"`
	UserIds                 string             `json:"-" gorm:"type:text"`
	Emails                  PopupNoticeContent `json:"-"`
	Status                  string             `json:"status" gorm:"size:16;index"`
	RecipientCount          int                `json:"recipient_count"`
	SkippedCount            int                `json:"skipped_count"`
	CreatedBy               int                `json:"created_by"`
	CreatedAt               int64              `json:"created_at"`
	QueuedAt                int64              `json:"queued_at"`
	SendAt                  int64              `json:"send_at" gorm:"not null;default:0;index"`
	ScheduleError           string             `json:"schedule_error" gorm:"type:text"`
	ScheduleSaleFingerprint string             `json:"-" gorm:"type:text"`
	Counts                  map[string]int64   `json:"counts" gorm:"-"`
}

type AdminMailDelivery struct {
	Id         int    `json:"id"`
	CampaignId int    `json:"campaign_id" gorm:"uniqueIndex:idx_admin_mail_recipient;index"`
	UserId     int    `json:"user_id"`
	Username   string `json:"username" gorm:"size:64"`
	Email      string `json:"email" gorm:"size:254;uniqueIndex:idx_admin_mail_recipient"`
	Status     string `json:"status" gorm:"size:16;index"`
	Result     string `json:"result" gorm:"size:64"`
	UpdatedAt  int64  `json:"updated_at"`
}

func ValidateAdminMailInput(input *AdminMailInput) error {
	input.Subject = strings.TrimSpace(input.Subject)
	if _, err := uuid.Parse(input.RequestKey); err != nil {
		return errors.New("invalid request identifier")
	}
	if !utf8.ValidString(input.Subject) || len([]rune(input.Subject)) == 0 || len([]rune(input.Subject)) > 200 || strings.ContainsFunc(input.Subject, unicode.IsControl) {
		return errors.New("email subject must contain 1–200 characters without control characters")
	}
	if !utf8.ValidString(input.Content) || strings.TrimSpace(input.Content) == "" || len(input.Content) > AdminMailMaxContentBytes {
		return errors.New("email content must contain 1–65536 UTF-8 bytes")
	}
	if !slices.Contains([]string{"text", "markdown", "html"}, input.Format) {
		return errors.New("invalid email format")
	}
	if !slices.Contains([]string{"emails", "users", "all_users"}, input.Audience) {
		return errors.New("invalid email audience")
	}
	if len(input.UserIds) > AdminMailMaxRecipients || len(input.Emails) > AdminMailMaxRecipients {
		return errors.New("too many recipients; split into batches of at most 5000")
	}
	if input.Audience == "emails" {
		input.UserIds = nil
		for i, address := range input.Emails {
			input.Emails[i] = NormalizeEmail(address)
			if !ValidAdminMailAddress(input.Emails[i]) {
				return errors.New("enter valid recipient email addresses")
			}
		}
		slices.Sort(input.Emails)
		input.Emails = slices.Compact(input.Emails)
		if len(input.Emails) == 0 {
			return errors.New("enter at least one recipient email address")
		}
		return nil
	}
	input.Emails = nil
	if input.Audience == "all_users" {
		input.UserIds = nil
		return nil
	}
	slices.Sort(input.UserIds)
	input.UserIds = slices.Compact(input.UserIds)
	if len(input.UserIds) == 0 || input.UserIds[0] <= 0 {
		return errors.New("select at least one user")
	}
	return nil
}

func ValidAdminMailAddress(address string) bool {
	if address == "" || len(address) > 254 || strings.ContainsAny(address, "\r\n;,") {
		return false
	}
	parsed, err := mail.ParseAddress(address)
	return err == nil && parsed.Address == address && parsed.Name == "" && strings.Contains(address, "@")
}

// Drafts freeze both the rendered message and the recipient list. Replaying a
// request key cannot create another mailing, even after a lost HTTP response.
func CreateAdminMailDraft(input AdminMailInput, html string, actor int) (*AdminMailCampaign, error) {
	if err := ValidateAdminMailInput(&input); err != nil {
		return nil, err
	}
	ids, err := common.Marshal(input.UserIds)
	if err != nil {
		return nil, err
	}
	emails, err := common.Marshal(input.Emails)
	if err != nil {
		return nil, err
	}
	campaign := AdminMailCampaign{RequestKey: input.RequestKey, Subject: input.Subject, Content: PopupNoticeContent(input.Content), Html: PopupNoticeContent(html), Format: input.Format, Audience: input.Audience, UserIds: string(ids), Emails: PopupNoticeContent(emails), Status: "draft", CreatedBy: actor, CreatedAt: time.Now().Unix()}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var existing AdminMailCampaign
		err := tx.Where("request_key = ?", input.RequestKey).First(&existing).Error
		if err == nil {
			if existing.CreatedBy != actor || existing.Subject != campaign.Subject || existing.Content != campaign.Content || existing.Format != campaign.Format || existing.Audience != campaign.Audience || existing.UserIds != campaign.UserIds || existing.Emails != campaign.Emails {
				return ErrAdminMailConflict
			}
			campaign = existing
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var users []User
		if input.Audience != "emails" {
			query := tx.Model(&User{}).Select("id", "username", "email", "status").Order("id")
			if input.Audience == "users" {
				query = query.Where("id IN ?", input.UserIds)
			} else {
				query = query.Where("status = ? AND email <> ?", common.UserStatusEnabled, "")
			}
			if err := query.Limit(AdminMailMaxRecipients + 1).Find(&users).Error; err != nil {
				return err
			}
		}
		if len(users) > AdminMailMaxRecipients {
			return errors.New("too many recipients; split into batches of at most 5000")
		}
		deliveries := make([]AdminMailDelivery, 0, len(users))
		for _, address := range input.Emails {
			deliveries = append(deliveries, AdminMailDelivery{Email: address, Status: "pending", UpdatedAt: campaign.CreatedAt})
		}
		seen := make(map[string]bool)
		for _, user := range users {
			email := NormalizeEmail(user.Email)
			if user.Status != common.UserStatusEnabled || !ValidAdminMailAddress(email) || seen[email] {
				continue
			}
			seen[email] = true
			deliveries = append(deliveries, AdminMailDelivery{UserId: user.Id, Username: user.Username, Email: email, Status: "pending", UpdatedAt: campaign.CreatedAt})
		}
		if len(deliveries) == 0 {
			return errors.New("no active users with a valid bound email address")
		}
		campaign.RecipientCount = len(deliveries)
		campaign.SkippedCount = len(users) - len(deliveries)
		if input.Audience == "emails" {
			campaign.SkippedCount = 0
		}
		if input.Audience == "users" {
			campaign.SkippedCount = len(input.UserIds) - len(deliveries)
		}
		if err := tx.Create(&campaign).Error; err != nil {
			return err
		}
		for i := range deliveries {
			deliveries[i].CampaignId = campaign.Id
		}
		return tx.CreateInBatches(deliveries, 100).Error
	})
	if err != nil {
		return nil, err
	}
	return &campaign, nil
}

func UpdateAdminMailDraft(id int, input AdminMailInput, html string) (*AdminMailCampaign, error) {
	if err := ValidateAdminMailInput(&input); err != nil {
		return nil, err
	}
	ids, err := common.Marshal(input.UserIds)
	if err != nil {
		return nil, err
	}
	emails, err := common.Marshal(input.Emails)
	if err != nil {
		return nil, err
	}
	var campaign AdminMailCampaign
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&campaign, id).Error; err != nil {
			return err
		}
		if campaign.Status != "draft" {
			return ErrAdminMailConflict
		}
		var users []User
		if input.Audience != "emails" {
			query := tx.Model(&User{}).Select("id", "username", "email", "status").Order("id")
			if input.Audience == "users" {
				query = query.Where("id IN ?", input.UserIds)
			} else {
				query = query.Where("status = ? AND email <> ?", common.UserStatusEnabled, "")
			}
			if err := query.Limit(AdminMailMaxRecipients + 1).Find(&users).Error; err != nil {
				return err
			}
		}
		if len(users) > AdminMailMaxRecipients {
			return errors.New("too many recipients; split into batches of at most 5000")
		}
		deliveries := make([]AdminMailDelivery, 0, len(users)+len(input.Emails))
		now := time.Now().Unix()
		for _, address := range input.Emails {
			deliveries = append(deliveries, AdminMailDelivery{Email: address, Status: "pending", UpdatedAt: now})
		}
		seen := make(map[string]bool)
		for _, user := range users {
			address := NormalizeEmail(user.Email)
			if user.Status != common.UserStatusEnabled || !ValidAdminMailAddress(address) || seen[address] {
				continue
			}
			seen[address] = true
			deliveries = append(deliveries, AdminMailDelivery{UserId: user.Id, Username: user.Username, Email: address, Status: "pending", UpdatedAt: now})
		}
		if len(deliveries) == 0 {
			return errors.New("no active users with a valid bound email address")
		}
		campaign.Subject = input.Subject
		campaign.Content = PopupNoticeContent(input.Content)
		campaign.Html = PopupNoticeContent(html)
		campaign.Format = input.Format
		campaign.Audience = input.Audience
		campaign.UserIds = string(ids)
		campaign.Emails = PopupNoticeContent(emails)
		campaign.RecipientCount = len(deliveries)
		campaign.SkippedCount = len(users) - len(deliveries)
		if input.Audience == "emails" {
			campaign.SkippedCount = 0
		} else if input.Audience == "users" {
			campaign.SkippedCount = len(input.UserIds) - len(deliveries)
		}
		if err := tx.Where("campaign_id = ?", id).Delete(&AdminMailDelivery{}).Error; err != nil {
			return err
		}
		if err := tx.Save(&campaign).Error; err != nil {
			return err
		}
		for i := range deliveries {
			deliveries[i].CampaignId = id
		}
		return tx.CreateInBatches(deliveries, 100).Error
	})
	if err != nil {
		return nil, err
	}
	return &campaign, LoadAdminMailCounts(&campaign)
}

func GetAdminMailDraftInput(id int) (*AdminMailInput, error) {
	campaign, err := GetAdminMailCampaign(id)
	if err != nil {
		return nil, err
	}
	if campaign.Status != "draft" {
		return nil, ErrAdminMailConflict
	}
	var userIDs []int
	var emails []string
	if err := common.Unmarshal([]byte(campaign.UserIds), &userIDs); err != nil {
		return nil, err
	}
	if err := common.Unmarshal([]byte(campaign.Emails), &emails); err != nil {
		return nil, err
	}
	return &AdminMailInput{Subject: campaign.Subject, Content: string(campaign.Content), Format: campaign.Format, Audience: campaign.Audience, UserIds: userIDs, Emails: emails}, nil
}

func GetAdminMailCampaign(id int) (*AdminMailCampaign, error) {
	var campaign AdminMailCampaign
	if err := DB.First(&campaign, id).Error; err != nil {
		return nil, err
	}
	return &campaign, LoadAdminMailCounts(&campaign)
}

func LoadAdminMailCounts(campaign *AdminMailCampaign) error {
	var counts []struct {
		Status string
		Count  int64
	}
	if err := DB.Model(&AdminMailDelivery{}).Select("status, COUNT(*) AS count").Where("campaign_id = ?", campaign.Id).Group("status").Scan(&counts).Error; err != nil {
		return err
	}
	campaign.Counts = make(map[string]int64)
	for _, count := range counts {
		campaign.Counts[count.Status] = count.Count
	}
	return nil
}

func QueueAdminMailCampaign(id int) error {
	return QueueAdminMailCampaignWithHTML(id, "")
}
func QueueAdminMailCampaignWithHTML(id int, rendered string) error {
	updates := map[string]any{"status": "queued", "queued_at": time.Now().Unix()}
	if rendered != "" {
		updates["html"] = rendered
	}
	result := DB.Model(&AdminMailCampaign{}).Where("id = ? AND status = ?", id, "draft").Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		return nil
	}
	campaign, err := GetAdminMailCampaign(id)
	if err != nil {
		return err
	}
	if campaign.Status == "queued" || campaign.Status == "completed" {
		return nil
	}
	return ErrAdminMailConflict
}

func CancelAdminMailCampaign(id int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var campaign AdminMailCampaign
		if err := lockForUpdate(tx).First(&campaign, id).Error; err != nil {
			return err
		}
		if campaign.Status != "draft" && campaign.Status != "queued" && campaign.Status != "scheduled" && campaign.Status != "schedule_failed" {
			return ErrAdminMailConflict
		}
		if err := tx.Model(&campaign).Update("status", "cancelled").Error; err != nil {
			return err
		}
		return tx.Model(&AdminMailDelivery{}).Where("campaign_id = ? AND status = ?", id, "pending").Updates(map[string]any{"status": "skipped", "result": "cancelled", "updated_at": time.Now().Unix()}).Error
	})
}

// CAS claims work across nodes and every supported database. A delivery in
// progress is never retried automatically: SMTP cannot guarantee exactly once.
func ClaimAdminMailDelivery(now int64) (*AdminMailDelivery, *AdminMailCampaign, error) {
	if err := DB.Model(&AdminMailDelivery{}).Where("status = ? AND updated_at < ?", "sending", now-120).Updates(map[string]any{"status": "uncertain", "result": "delivery_unknown", "updated_at": now}).Error; err != nil {
		return nil, nil, err
	}
	var campaigns []AdminMailCampaign
	if err := DB.Where("status = ?", "queued").Order("id").Limit(20).Find(&campaigns).Error; err != nil {
		return nil, nil, err
	}
	for _, campaign := range campaigns {
		var delivery AdminMailDelivery
		err := DB.Where("campaign_id = ? AND status = ?", campaign.Id, "pending").Order("id").First(&delivery).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			var active int64
			if err := DB.Model(&AdminMailDelivery{}).Where("campaign_id = ? AND status = ?", campaign.Id, "sending").Count(&active).Error; err != nil {
				return nil, nil, err
			}
			if active == 0 {
				if err := DB.Model(&AdminMailCampaign{}).Where("id = ? AND status = ?", campaign.Id, "queued").Update("status", "completed").Error; err != nil {
					return nil, nil, err
				}
			}
			continue
		}
		if err != nil {
			return nil, nil, err
		}
		claimed := false
		err = DB.Transaction(func(tx *gorm.DB) error {
			var current AdminMailCampaign
			if err := lockForUpdate(tx).First(&current, campaign.Id).Error; err != nil {
				return err
			}
			if current.Status != "queued" {
				return nil
			}
			result := tx.Model(&AdminMailDelivery{}).Where("id = ? AND status = ?", delivery.Id, "pending").Updates(map[string]any{"status": "sending", "updated_at": now})
			claimed = result.RowsAffected == 1
			return result.Error
		})
		if err != nil {
			return nil, nil, err
		}
		if claimed {
			delivery.Status = "sending"
			return &delivery, &campaign, nil
		}
	}
	return nil, nil, nil
}

func FinishAdminMailDelivery(id int, status, result string) error {
	return DB.Model(&AdminMailDelivery{}).Where("id = ? AND status = ?", id, "sending").Updates(map[string]any{"status": status, "result": result, "updated_at": time.Now().Unix()}).Error
}
