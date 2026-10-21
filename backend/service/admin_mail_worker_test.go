package service

import (
	"context"
	"errors"
	"fmt"
	"net/textproto"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestAdminMailWorkerWaitsAfterSMTPCompletesAcrossCampaigns(t *testing.T) {
	for _, sendErr := range []error{nil, errors.New("network unavailable"), &common.EmailDeliveryUncertain{}} {
		t.Run(fmt.Sprintf("%T", sendErr), func(t *testing.T) {
			now := time.Unix(1000, 0)
			claims, sends, queues := 0, 0, 0
			worker := adminMailWorker{
				now: func() time.Time { return now }, ready: func() bool { return true },
				restore: func(int64) (model.AdminMailAttemptTimes, error) { return model.AdminMailAttemptTimes{}, nil },
				queue:   func(time.Time) error { queues++; return nil },
				claim: func(int64) (*model.AdminMailDelivery, *model.AdminMailCampaign, error) {
					claims++
					return &model.AdminMailDelivery{}, &model.AdminMailCampaign{Id: claims}, nil
				},
				deliver: func(d *model.AdminMailDelivery, c *model.AdminMailCampaign, send func(string, string, string) error) error {
					_ = send("subject", "test@example.com", "body")
					return errors.New("result persistence failed")
				},
				send: func(string, string, string) error {
					sends++
					now = now.Add(25 * time.Second) // A slow SMTP exchange.
					return sendErr
				},
			}
			ctx := context.Background()
			worker.tick(ctx)
			require.Equal(t, time.Unix(1035, 0), worker.nextSendAt)
			now = time.Unix(1034, 999999999)
			worker.tick(ctx)
			require.Equal(t, 1, claims, "waiting recipients must not be claimed")
			require.Equal(t, 1, sends)
			require.Equal(t, 2, queues, "scheduled campaigns are still prepared during a wait")
			now = time.Unix(1035, 0)
			worker.tick(ctx)
			require.Equal(t, 2, sends, "the next campaign shares the same gate")
		})
	}
}

func TestAdminMailWorkerAuthFailurePausesWithoutRetryingFailedRecipient(t *testing.T) {
	now := time.Unix(1000, 0)
	claims := 0
	worker := adminMailWorker{
		now: func() time.Time { return now }, ready: func() bool { return true }, restored: true,
		queue: func(time.Time) error { return nil },
		claim: func(int64) (*model.AdminMailDelivery, *model.AdminMailCampaign, error) {
			claims++
			return &model.AdminMailDelivery{Id: claims}, &model.AdminMailCampaign{}, nil
		},
		deliver: func(d *model.AdminMailDelivery, c *model.AdminMailCampaign, send func(string, string, string) error) error {
			return send("", "", "")
		},
		send: func(string, string, string) error {
			return fmt.Errorf("wrapped: %w", &common.SMTPDeliveryError{Stage: "auth", Err: &textproto.Error{Code: 535, Msg: "redacted"}})
		},
	}
	worker.tick(context.Background())
	now = now.Add(299 * time.Second)
	worker.tick(context.Background())
	require.Equal(t, 1, claims)
	now = now.Add(time.Second)
	worker.tick(context.Background())
	require.Equal(t, 2, claims, "only a new pending recipient is claimed after cooling down")
	require.Equal(t, now.Add(5*time.Minute), worker.nextSendAt, "another auth failure starts another cooldown")
}

func TestAdminMailWorkerRestoresCooldownAndStopsBeforeClaim(t *testing.T) {
	now := time.Unix(1000, 0)
	restores, claims := 0, 0
	worker := adminMailWorker{
		now: func() time.Time { return now }, ready: func() bool { return true },
		restore: func(int64) (model.AdminMailAttemptTimes, error) {
			restores++
			if restores == 1 {
				return model.AdminMailAttemptTimes{}, errors.New("database unavailable")
			}
			return model.AdminMailAttemptTimes{LastAttempt: 990, LastAuthFailure: 900}, nil
		},
		queue: func(time.Time) error { return nil },
		claim: func(int64) (*model.AdminMailDelivery, *model.AdminMailCampaign, error) {
			claims++
			return nil, nil, nil
		},
	}
	worker.tick(context.Background())
	require.False(t, worker.restored)
	require.Zero(t, claims, "failed restoration must not bypass pacing")
	worker.tick(context.Background())
	require.Equal(t, time.Unix(1201, 0), worker.nextSendAt)
	require.Zero(t, claims)
	now = time.Unix(1201, 0)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	worker.tick(ctx)
	require.Zero(t, claims, "shutdown must not start a new email")
	worker.tick(context.Background())
	require.Equal(t, 1, claims)
	require.Equal(t, 2, restores)
}

func TestAdminMailRestoredSendTimeUsesLatestApplicableDeadline(t *testing.T) {
	require.True(t, adminMailRestoredSendTime(model.AdminMailAttemptTimes{}).IsZero())
	require.Equal(t, time.Unix(1011, 0), adminMailRestoredSendTime(model.AdminMailAttemptTimes{LastAttempt: 1000}))
	require.Equal(t, time.Unix(1011, 0), adminMailRestoredSendTime(model.AdminMailAttemptTimes{LastAttempt: 1000, LastAuthFailure: 100}))
}
