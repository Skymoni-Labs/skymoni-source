package operation_setting

// SecurityProtectionConfig is stored atomically by model's revisioned private
// configuration table. It is intentionally not registered with generic options:
// changing security policy must go through root authorization and revision CAS.
type SecurityProtectionConfig struct {
	Enabled                     bool     `json:"enabled"`
	Mode                        string   `json:"mode"`
	FirstCheckinCooldownSeconds int64    `json:"first_checkin_cooldown_seconds"`
	NewAccountAgeSeconds        int64    `json:"new_account_age_seconds"`
	IPDailyNewUserLimit         int      `json:"ip_daily_new_user_limit"`
	BurstWindowSeconds          int64    `json:"burst_window_seconds"`
	BurstNewUserThreshold       int      `json:"burst_new_user_threshold"`
	BurstRapidUserThreshold     int      `json:"burst_rapid_user_threshold"`
	RapidClaimSeconds           int64    `json:"rapid_claim_seconds"`
	AutoIPWindowSeconds         int64    `json:"auto_ip_window_seconds"`
	AutoIPNewUserThreshold      int      `json:"auto_ip_new_user_threshold"`
	AutoIPDeniedThreshold       int      `json:"auto_ip_denied_threshold"`
	AutoIPBanSeconds            int64    `json:"auto_ip_ban_seconds"`
	AllowlistIPs                []string `json:"allowlist_ips"`
	AllowlistUserIDs            []int    `json:"allowlist_user_ids"`
	RetentionDays               int      `json:"retention_days"`
	RegistrationIPHourLimit     int      `json:"registration_ip_hour_limit"`
	RegistrationWindowSeconds   int64    `json:"registration_window_seconds"`
}

func DefaultSecurityProtectionConfig() SecurityProtectionConfig {
	return SecurityProtectionConfig{Mode: "observe", FirstCheckinCooldownSeconds: 3600,
		NewAccountAgeSeconds: 604800, IPDailyNewUserLimit: 5, BurstWindowSeconds: 600,
		BurstNewUserThreshold: 6, BurstRapidUserThreshold: 3, RapidClaimSeconds: 60,
		AutoIPWindowSeconds: 3600, AutoIPNewUserThreshold: 20, AutoIPDeniedThreshold: 10,
		AutoIPBanSeconds: 900, AllowlistIPs: []string{}, AllowlistUserIDs: []int{}, RetentionDays: 30, RegistrationIPHourLimit: 20, RegistrationWindowSeconds: 3600}
}
