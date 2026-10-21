package model

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const UpstreamWalletAlertReminderSeconds = int64(24 * time.Hour / time.Second)

// Only recipient addresses and delivery metadata are persisted here. Passwords
// remain in the encrypted credential vault and are read at the SMTP boundary.
type UpstreamWalletAlertConfig struct {
	Slot             string   `json:"-" gorm:"primaryKey;size:20"`
	Enabled          bool     `json:"enabled"`
	RecipientsJSON   string   `json:"-" gorm:"type:text"`
	Recipients       []string `json:"recipients" gorm:"-"`
	ShibaThreshold   float64  `json:"shiba_threshold"`
	YYLXThreshold    float64  `json:"yylx_threshold"`
	OranexaThreshold float64  `json:"oranexa_threshold"`
	Revision         int      `json:"revision"`
	UpdatedAt        int64    `json:"updated_at"`
}

type UpstreamWalletAlertDelivery struct {
	WalletID       int    `json:"wallet_id" gorm:"primaryKey;autoIncrement:false"`
	Email          string `json:"email" gorm:"primaryKey;size:254"`
	Active         bool   `json:"active"`
	Claim          string `json:"-" gorm:"size:36"`
	ConfigRevision int    `json:"-"`
	LastAttemptAt  int64  `json:"last_attempt_at"`
	LastSentAt     int64  `json:"last_sent_at"`
	NextAttemptAt  int64  `json:"next_attempt_at"`
	Status         string `json:"status" gorm:"size:32"`
	Result         string `json:"result" gorm:"size:60"`
	Attempts       int    `json:"attempts"`
}

var ErrUpstreamWalletAlertConflict = errors.New("预警配置已更新，请刷新后重试")

func DefaultUpstreamWalletAlertConfig() UpstreamWalletAlertConfig {
	return UpstreamWalletAlertConfig{Slot: "active", Recipients: []string{"2924128981@qq.com"}, ShibaThreshold: 200, YYLXThreshold: 1, OranexaThreshold: .3, Revision: 1}
}

func decodeWalletAlertConfig(c *UpstreamWalletAlertConfig) error {
	return json.Unmarshal([]byte(c.RecipientsJSON), &c.Recipients)
}

func GetUpstreamWalletAlertConfig() (*UpstreamWalletAlertConfig, error) {
	var c UpstreamWalletAlertConfig
	if err := DB.First(&c, "slot = ?", "active").Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			d := DefaultUpstreamWalletAlertConfig()
			return &d, nil
		}
		return nil, err
	}
	return &c, decodeWalletAlertConfig(&c)
}

func ValidateUpstreamWalletAlertConfig(c *UpstreamWalletAlertConfig) error {
	if len(c.Recipients) == 0 || len(c.Recipients) > 20 {
		return errors.New("请设置 1 至 20 个收件邮箱")
	}
	seen := map[string]bool{}
	emails := []string{}
	for _, raw := range c.Recipients {
		address := NormalizeEmail(raw)
		if !ValidAdminMailAddress(address) {
			return errors.New("收件邮箱格式无效")
		}
		if !seen[address] {
			seen[address] = true
			emails = append(emails, address)
		}
	}
	for _, v := range []float64{c.ShibaThreshold, c.YYLXThreshold, c.OranexaThreshold} {
		if math.IsNaN(v) || math.IsInf(v, 0) || v <= 0 || v > 1e12 {
			return errors.New("预警阈值必须大于 0，且使用上游原始额度")
		}
	}
	c.Recipients = emails
	return nil
}

func SaveUpstreamWalletAlertConfig(c *UpstreamWalletAlertConfig) error {
	if err := ValidateUpstreamWalletAlertConfig(c); err != nil {
		return err
	}
	raw, _ := json.Marshal(c.Recipients)
	c.RecipientsJSON = string(raw)
	c.Slot = "active"
	return DB.Transaction(func(tx *gorm.DB) error {
		d := DefaultUpstreamWalletAlertConfig()
		r, _ := json.Marshal(d.Recipients)
		d.RecipientsJSON = string(r)
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&d).Error; err != nil {
			return err
		}
		var prior UpstreamWalletAlertConfig
		if err := lockForUpdate(tx).First(&prior, "slot = ?", "active").Error; err != nil {
			return err
		}
		if prior.Revision != c.Revision {
			return ErrUpstreamWalletAlertConflict
		}
		c.Revision++
		c.UpdatedAt = time.Now().Unix()
		return tx.Save(c).Error
	})
}

func WalletAlertThreshold(c *UpstreamWalletAlertConfig, w *UpstreamWallet) (float64, bool) {
	p := strings.ToLower(strings.TrimSpace(w.Provider))
	switch p {
	case "yylx":
		return c.YYLXThreshold, true
	case "oranexa":
		return c.OranexaThreshold, true
	case "2000run", "shiba", "柴犬":
		return c.ShibaThreshold, true
	}
	// Legacy Shiba wallets were recorded with the generic provider "Moni".
	if strings.Contains(w.Name, "柴犬") {
		return c.ShibaThreshold, true
	}
	return 0, false
}

func WalletNeedsAlert(c *UpstreamWalletAlertConfig, w *UpstreamWallet) bool {
	t, ok := WalletAlertThreshold(c, w)
	return ok && w.CalibratedAt > 0 && !math.IsNaN(w.Remaining) && !math.IsInf(w.Remaining, 0) && w.Remaining < t
}

// Config and wallet row locks serialize claims across processes. A claim is
// durable before sending; interrupted or uncertain SMTP attempts wait a day
// rather than immediately duplicating an already accepted message.
func ClaimUpstreamWalletAlert(walletID int, email string, now int64) (*UpstreamWalletAlertDelivery, error) {
	var claimed *UpstreamWalletAlertDelivery
	err := DB.Transaction(func(tx *gorm.DB) error {
		var c UpstreamWalletAlertConfig
		if err := lockForUpdate(tx).First(&c, "slot = ?", "active").Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if err := decodeWalletAlertConfig(&c); err != nil {
			return err
		}
		if !c.Enabled {
			return nil
		}
		allowed := false
		for _, e := range c.Recipients {
			if e == email {
				allowed = true
			}
		}
		if !allowed {
			return nil
		}
		var w UpstreamWallet
		if err := lockForUpdate(tx).First(&w, walletID).Error; err != nil {
			return err
		}
		d := UpstreamWalletAlertDelivery{WalletID: walletID, Email: email}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&d).Error; err != nil {
			return err
		}
		if err := lockForUpdate(tx).First(&d, "wallet_id = ? AND email = ?", walletID, email).Error; err != nil {
			return err
		}
		if !WalletNeedsAlert(&c, &w) {
			if !d.Active {
				return nil
			}
			d.Active = false
			d.Claim = ""
			d.NextAttemptAt = 0
			d.Attempts = 0
			d.Status = "recovered"
			d.Result = "balance_recovered"
			return tx.Save(&d).Error
		}
		if d.Active && now < d.NextAttemptAt {
			return nil
		}
		if !d.Active {
			d.Attempts = 0
		}
		d.Active = true
		d.Claim = uuid.NewString()
		d.ConfigRevision = c.Revision
		d.LastAttemptAt = now
		d.NextAttemptAt = now + UpstreamWalletAlertReminderSeconds
		d.Status = "sending"
		d.Result = ""
		d.Attempts++
		if err := tx.Save(&d).Error; err != nil {
			return err
		}
		claimed = &d
		return nil
	})
	return claimed, err
}

func FinishUpstreamWalletAlert(d *UpstreamWalletAlertDelivery, status, result string, now int64) error {
	u := map[string]any{"status": status, "result": result}
	if status == "sent" {
		u["last_sent_at"] = now
	}
	if status == "failed" {
		delay := int64(5 * 60)
		if d.Attempts > 1 {
			delay = 15 * 60
		}
		if d.Attempts > 3 {
			delay = 60 * 60
		}
		u["next_attempt_at"] = now + delay
	}
	return DB.Model(&UpstreamWalletAlertDelivery{}).Where("wallet_id = ? AND email = ? AND claim = ?", d.WalletID, d.Email, d.Claim).Updates(u).Error
}
