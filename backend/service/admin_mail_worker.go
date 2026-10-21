package service

import (
	"context"
	"errors"
	"os"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const adminMailSendInterval = 10 * time.Second
const adminMailAuthCooldown = 5 * time.Minute

// One gate covers every campaign. Pending recipients remain unclaimed during
// a wait, so cancellation works and a cooldown never turns them into failures.
type adminMailWorker struct {
	now        func() time.Time
	ready      func() bool
	restore    func(int64) (model.AdminMailAttemptTimes, error)
	queue      func(time.Time) error
	claim      func(int64) (*model.AdminMailDelivery, *model.AdminMailCampaign, error)
	deliver    func(*model.AdminMailDelivery, *model.AdminMailCampaign, func(string, string, string) error) error
	send       func(string, string, string) error
	restored   bool
	nextSendAt time.Time
}

func adminMailRestoredSendTime(attempts model.AdminMailAttemptTimes) time.Time {
	var next time.Time
	// Stored timestamps have second precision; add a second so restarting cannot
	// shorten the remaining interval by rounding down the completion time.
	if attempts.LastAttempt > 0 {
		next = time.Unix(attempts.LastAttempt, 0).Add(adminMailSendInterval + time.Second)
	}
	if attempts.LastAuthFailure > 0 {
		authNext := time.Unix(attempts.LastAuthFailure, 0).Add(adminMailAuthCooldown + time.Second)
		if authNext.After(next) {
			next = authNext
		}
	}
	return next
}

func (worker *adminMailWorker) tick(ctx context.Context) {
	if ctx.Err() != nil || !worker.ready() {
		return
	}
	now := worker.now()
	if !worker.restored {
		attempts, err := worker.restore(now.Add(-adminMailAuthCooldown - time.Second).Unix())
		if err != nil {
			common.SysError("admin mail send interval could not be restored")
			return
		}
		worker.nextSendAt = adminMailRestoredSendTime(attempts)
		worker.restored = true
	}
	if err := worker.queue(now); err != nil {
		common.SysError("scheduled admin mail queue preparation failed")
		return
	}
	if now.Before(worker.nextSendAt) || ctx.Err() != nil {
		return
	}
	delivery, campaign, err := worker.claim(now.Unix())
	if err != nil {
		common.SysError("admin mail queue claim failed")
		return
	}
	if delivery == nil {
		return
	}
	// DeliverAdminMail returns persistence errors, so observe the SMTP boundary
	// directly. Apply the wait even if saving the delivery result fails.
	err = worker.deliver(delivery, campaign, func(subject, recipient, body string) error {
		sendErr := worker.send(subject, recipient, body)
		interval := adminMailSendInterval
		var smtpErr *common.SMTPDeliveryError
		if errors.As(sendErr, &smtpErr) && smtpErr.Stage == "auth" {
			interval = adminMailAuthCooldown
			common.SysLog("admin mail SMTP authentication failed; pausing queue for 300 seconds")
		}
		worker.nextSendAt = worker.now().Add(interval)
		return sendErr
	})
	if err != nil {
		common.SysError("admin mail delivery result could not be persisted")
	}
}

func StartAdminMailWorker() func() {
	if !common.IsMasterNode || os.Getenv("ADMIN_MAIL_WORKER_DISABLED") == "true" {
		return func() {}
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	worker := adminMailWorker{
		now: time.Now, ready: AdminMailSMTPReady, restore: model.RecentAdminMailAttemptTimes,
		queue: QueueDueAdminMailCampaigns, claim: model.ClaimAdminMailDelivery,
		deliver: DeliverAdminMail, send: common.SendEmail,
	}
	common.SysLog("admin mail worker: 10 second send interval; 300 second authentication failure cooldown")
	go func() {
		defer close(done)
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				worker.tick(ctx)
			}
		}
	}()
	return func() { cancel(); <-done }
}
