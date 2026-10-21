package model

type AdminMailAttemptTimes struct {
	LastAttempt     int64
	LastAuthFailure int64
}

// Restore pacing after a process restart without adding a new queue schema.
// Drafts, cancellations, and changed recipients never delay real deliveries.
func RecentAdminMailAttemptTimes(since int64) (AdminMailAttemptTimes, error) {
	var attempts AdminMailAttemptTimes
	err := DB.Model(&AdminMailDelivery{}).
		Where("updated_at >= ? AND status IN ?", since, []string{"sending", "sent", "failed", "uncertain"}).
		Select(`COALESCE(MAX(updated_at), 0) AS last_attempt,
			COALESCE(MAX(CASE WHEN status = 'failed' AND
			(result = 'smtp_auth' OR result LIKE 'smtp_auth_%')
			THEN updated_at ELSE 0 END), 0) AS last_auth_failure`).
		Scan(&attempts).Error
	return attempts, err
}
