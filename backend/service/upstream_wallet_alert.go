package service

import (
	"context"
	"errors"
	"fmt"
	"html"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// No campaign/body snapshot is created: credentials exist only in memory while
// building this individual recipient's email and in the encrypted wallet vault.
func RenderUpstreamWalletAlert(w *model.UpstreamWallet, threshold float64, login *model.UpstreamWalletLogin) (string, string) {
	subject := "Skymoni 上游余额预警 · " + strings.ReplaceAll(strings.ReplaceAll(w.Name, "\r", " "), "\n", " ")
	row := func(label, value string) string {
		return "<tr><td style=\"padding:9px;color:#8fa6bc\">" + html.EscapeString(label) + "</td><td style=\"padding:9px;word-break:break-all\">" + html.EscapeString(value) + "</td></tr>"
	}
	body := row("上游账户", w.Name) + row("平台", w.Provider) + row("当前余额", fmt.Sprintf("%.6g %s", w.Remaining, w.Unit)) + row("预警阈值", fmt.Sprintf("低于 %.6g %s", threshold, w.Unit))
	if login != nil {
		body += row("登录网址", login.LoginURL) + row("登录账号", login.Username) + row("登录密码", login.Password)
	} else {
		body += row("登录凭据", "尚未录入或暂时无法读取，请到上游账户管理补全")
	}
	if w.Pending > 0 {
		body += row("待核对扣款", fmt.Sprintf("%d 笔，请核对实际余额", w.Pending))
	}
	message := `<!doctype html><html lang="zh-CN"><body style="margin:0;background:#0b1321;color:#e5edf7;font-family:Arial,'Microsoft YaHei',sans-serif"><div style="max-width:620px;margin:24px auto;padding:28px;background:#101f32;border:1px solid #294158;border-radius:18px"><p style="color:#53b8f4;font-size:12px;letter-spacing:2px">SKYMONI · 上游余额</p><h1 style="font-size:22px">上游余额低于预警额度</h1><table style="width:100%;font-size:14px">` + body + `</table><p style="font-size:12px;color:#a4b5c6;line-height:1.8">余额为上游原始单位，依据本地成本账本估算，并非本站用户额度。站外消费或上游计价变化后请重新核验。持续低余额每 24 小时最多提醒一次；充值恢复并更新余额后重置。</p><p style="font-size:12px;color:#a4b5c6">此邮件仅发给预警设置中的管理员邮箱。</p></div></body></html>`
	return subject, message
}

func DeliverUpstreamWalletAlert(d *model.UpstreamWalletAlertDelivery, send func(string, string, string) error, now int64) error {
	c, err := model.GetUpstreamWalletAlertConfig()
	if err != nil {
		return err
	}
	allowed := false
	for _, email := range c.Recipients {
		if email == d.Email {
			allowed = true
		}
	}
	var w model.UpstreamWallet
	if !c.Enabled || !allowed || c.Revision != d.ConfigRevision || model.DB.First(&w, d.WalletID).Error != nil || !model.WalletNeedsAlert(c, &w) {
		return model.FinishUpstreamWalletAlert(d, "skipped", "settings_or_balance_changed", now)
	}
	threshold, _ := model.WalletAlertThreshold(c, &w)
	login, credentialErr := model.ReadUpstreamWalletCredential(w.ID)
	if credentialErr != nil {
		login = nil
	}
	subject, body := RenderUpstreamWalletAlert(&w, threshold, login)
	err = send(subject, d.Email, body)
	if login != nil {
		login.Password = ""
	}
	body = ""
	if err == nil {
		result := "smtp_accepted"
		if credentialErr != nil {
			result = "smtp_accepted_credentials_missing"
		}
		return model.FinishUpstreamWalletAlert(d, "sent", result, now)
	}
	var uncertain *common.EmailDeliveryUncertain
	if errors.As(err, &uncertain) {
		return model.FinishUpstreamWalletAlert(d, "uncertain", "delivery_unknown", now)
	}
	return model.FinishUpstreamWalletAlert(d, "failed", adminMailFailureResult(err), now)
}

func RunUpstreamWalletAlertsOnce(send func(string, string, string) error, now int64) error {
	c, err := model.GetUpstreamWalletAlertConfig()
	if err != nil || !c.Enabled {
		return err
	}
	var wallets []model.UpstreamWallet
	if err = model.DB.Find(&wallets).Error; err != nil {
		return err
	}
	for _, w := range wallets {
		for _, email := range c.Recipients {
			d, e := model.ClaimUpstreamWalletAlert(w.ID, email, now)
			if e != nil {
				return e
			}
			if d != nil {
				if e = DeliverUpstreamWalletAlert(d, send, now); e != nil {
					return e
				}
			}
		}
	}
	return nil
}

func StartUpstreamWalletAlertWorker() func() {
	if !common.IsMasterNode || os.Getenv("ADMIN_MAIL_WORKER_DISABLED") == "true" {
		return func() {}
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if !AdminMailSMTPReady() {
					continue
				}
				if err := RunUpstreamWalletAlertsOnce(common.SendEmail, time.Now().Unix()); err != nil {
					common.SysError("upstream wallet alert processing failed")
				}
			}
		}
	}()
	return func() { cancel(); <-done }
}
