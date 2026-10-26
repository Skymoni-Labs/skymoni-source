package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"net/netip"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrSecurityProtectionRevision = errors.New("安全配置已被其他管理员修改，请刷新后重试")
var ErrSecurityProtectionAlreadyCheckedIn = errors.New("今日已签到")

type SecurityProtectionValidationError struct{ Message string }

func (e *SecurityProtectionValidationError) Error() string { return e.Message }
func securityProtectionInvalid(s string) error             { return &SecurityProtectionValidationError{Message: s} }

var securityProtectionNonPublicPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"), netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"), netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"), netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("100::/64"), netip.MustParsePrefix("2001:db8::/32"),
}

type SecurityProtectionPolicy struct {
	ID         int    `json:"-" gorm:"primaryKey"`
	Revision   int64  `json:"revision"`
	ConfigJSON string `json:"-" gorm:"type:text;not null"`
	UpdatedAt  int64  `json:"updated_at"`
	UpdatedBy  int    `json:"updated_by"`
}

func (SecurityProtectionPolicy) TableName() string { return "security_protection_policies" }

type SecurityProtectionConfigView struct {
	Revision  int64                                      `json:"revision"`
	Config    operation_setting.SecurityProtectionConfig `json:"config"`
	UpdatedAt int64                                      `json:"updated_at"`
	UpdatedBy int                                        `json:"updated_by"`
}

// The lock rows serialize the IP budget and UID balance transaction across
// processes. They never contain credentials or request bodies.
type SecurityProtectionLock struct {
	Key       string `gorm:"primaryKey;size:96"`
	TouchedAt int64
}

func (SecurityProtectionLock) TableName() string { return "security_protection_locks" }

type SecurityProtectionEvent struct {
	ID              int64            `json:"id" gorm:"primaryKey;autoIncrement"`
	UserID          int              `json:"user_id" gorm:"index:idx_sp_event_ip_time_user,priority:3;index"`
	IP              string           `json:"ip" gorm:"size:45;index:idx_sp_event_ip_time_user,priority:1"`
	IPPrefix        string           `json:"ip_prefix,omitempty" gorm:"size:64"`
	Kind            string           `json:"kind" gorm:"size:32;index"`
	Scope           string           `json:"scope,omitempty" gorm:"size:16"`
	RequestID       string           `json:"request_id,omitempty" gorm:"size:128;index"`
	PolicyRevision  int64            `json:"policy_revision"`
	Evidence        map[string]int64 `json:"evidence,omitempty" gorm:"serializer:json;type:text"`
	Route           string           `json:"route" gorm:"size:160"`
	Rule            string           `json:"rule" gorm:"size:80"`
	Decision        string           `json:"decision" gorm:"size:20;index"`
	Summary         string           `json:"summary" gorm:"size:255"`
	NewUser         bool             `json:"new_user"`
	Rapid           bool             `json:"rapid"`
	RestrictedRetry bool             `json:"restricted_retry"`
	DedupKey        *string          `json:"-" gorm:"size:160;uniqueIndex"`
	CreatedAt       int64            `json:"created_at" gorm:"index:idx_sp_event_ip_time_user,priority:2;index"`
}

func (SecurityProtectionEvent) TableName() string { return "security_protection_events" }

type SecurityProtectionBan struct {
	ID               int64            `json:"id" gorm:"primaryKey;autoIncrement"`
	SubjectType      string           `json:"subject_type" gorm:"size:8;index"`
	UserID           int              `json:"user_id" gorm:"index"`
	IP               string           `json:"ip" gorm:"size:45;index"`
	Scope            string           `json:"scope" gorm:"size:16;index"`
	Source           string           `json:"source" gorm:"size:16;index"`
	Reason           string           `json:"reason" gorm:"size:255"`
	Rule             string           `json:"rule" gorm:"size:80"`
	CreatedAt        int64            `json:"created_at"`
	ExpiresAt        int64            `json:"expires_at" gorm:"index"`
	RevokedAt        int64            `json:"revoked_at" gorm:"index"`
	OperatorID       int              `json:"operator_id"`
	RevokedBy        int              `json:"revoked_by"`
	RevokeReason     string           `json:"revoke_reason" gorm:"size:255"`
	RequestID        string           `json:"request_id,omitempty" gorm:"size:128;index"`
	RevokedRequestID string           `json:"revoked_request_id,omitempty" gorm:"size:128"`
	PolicyRevision   int64            `json:"policy_revision"`
	Evidence         map[string]int64 `json:"evidence,omitempty" gorm:"serializer:json;type:text"`
}

func (SecurityProtectionBan) TableName() string { return "security_protection_bans" }

// One row per successful user/day checkin is committed with the balance. A new
// account continues consuming the source's daily budget across successive days.
type SecurityProtectionClaim struct {
	UserID    int    `gorm:"primaryKey;autoIncrement:false"`
	IP        string `gorm:"size:45;index:idx_sp_claim_ip_day,priority:1"`
	ClaimDate string `gorm:"primaryKey;size:10;index:idx_sp_claim_ip_day,priority:2"`
	NewUser   bool
	CreatedAt int64
}

func (SecurityProtectionClaim) TableName() string { return "security_protection_claims" }

// Live associations are only used to protect shared exits from automatic IP
// actions. They are not identity proof and never trigger account punishment.
type SecurityProtectionActivity struct {
	IP         string `gorm:"primaryKey;size:45"`
	UserID     int    `gorm:"primaryKey;autoIncrement:false"`
	LastSeenAt int64  `gorm:"index"`
}

func (SecurityProtectionActivity) TableName() string { return "security_protection_activities" }

type SecurityProtectionDecision struct {
	Allowed        bool   `json:"allowed"`
	Code           string `json:"code,omitempty"`
	Rule           string `json:"rule,omitempty"`
	Message        string `json:"message,omitempty"`
	RetryAfter     int64  `json:"retry_after,omitempty"`
	NewUser        bool   `json:"-"`
	PolicyRevision int64  `json:"policy_revision,omitempty"`
}

func (d *SecurityProtectionDecision) Error() string { return d.Message }

func InitSecurityProtection(db *gorm.DB) error {
	if err := db.AutoMigrate(&SecurityProtectionPolicy{}, &SecurityProtectionLock{}, &SecurityProtectionEvent{}, &SecurityProtectionBan{}, &SecurityProtectionClaim{}, &SecurityProtectionActivity{}); err != nil {
		return err
	}
	b, err := json.Marshal(operation_setting.DefaultSecurityProtectionConfig())
	if err != nil {
		return err
	}
	return db.Clauses(clause.OnConflict{DoNothing: true}).Create(&SecurityProtectionPolicy{ID: 1, Revision: 1, ConfigJSON: string(b), UpdatedAt: time.Now().Unix()}).Error
}

func NormalizeSecurityProtectionIP(raw string) (string, error) {
	ip, err := netip.ParseAddr(strings.TrimSpace(raw))
	if err != nil || ip.Zone() != "" {
		return "", securityProtectionInvalid("必须提供不含端口的有效IP地址")
	}
	return ip.Unmap().String(), nil
}
func securityProtectionPrefix(ip string) string {
	a, err := netip.ParseAddr(ip)
	if err != nil || a.Is4() {
		return ""
	}
	return netip.PrefixFrom(a, 64).Masked().String()
}
func securityProtectionLocalIP(ip string) bool {
	a, err := netip.ParseAddr(ip)
	if err != nil || a.IsPrivate() || a.IsLoopback() || a.IsLinkLocalUnicast() || a.IsLinkLocalMulticast() || a.IsMulticast() || a.IsUnspecified() {
		return true
	}
	for _, p := range securityProtectionNonPublicPrefixes {
		if p.Contains(a) {
			return true
		}
	}
	return false
}
func securityProtectionExempt(c operation_setting.SecurityProtectionConfig, userID, role int, ip string) bool {
	return securityProtectionLocalIP(ip) || securityProtectionTrusted(c, userID, role, ip)
}
func securityProtectionTrusted(c operation_setting.SecurityProtectionConfig, userID, role int, ip string) bool {
	if role >= common.RoleAdminUser {
		return true
	}
	for _, id := range c.AllowlistUserIDs {
		if userID > 0 && userID == id {
			return true
		}
	}
	a, _ := netip.ParseAddr(ip)
	for _, s := range c.AllowlistIPs {
		if p, e := netip.ParsePrefix(s); e == nil {
			if p.Contains(a) {
				return true
			}
		} else if s == ip {
			return true
		}
	}
	return false
}

func validateSecurityProtectionConfig(c *operation_setting.SecurityProtectionConfig) (err error) {
	defer func() {
		if err != nil {
			var invalid *SecurityProtectionValidationError
			if !errors.As(err, &invalid) {
				err = securityProtectionInvalid(err.Error())
			}
		}
	}()
	if c.Mode != "observe" && c.Mode != "enforce" {
		return errors.New("mode必须是observe或enforce")
	}
	if c.FirstCheckinCooldownSeconds < 0 || c.FirstCheckinCooldownSeconds > 604800 || c.NewAccountAgeSeconds < 3600 || c.NewAccountAgeSeconds > 2592000 || c.FirstCheckinCooldownSeconds > c.NewAccountAgeSeconds {
		return errors.New("账号冷却和新账号期限无效")
	}
	if c.IPDailyNewUserLimit < 1 || c.IPDailyNewUserLimit > 1000 || c.BurstWindowSeconds < 60 || c.BurstWindowSeconds > 3600 || c.BurstNewUserThreshold < 2 || c.BurstNewUserThreshold > 1000 || c.BurstRapidUserThreshold < 2 || c.BurstRapidUserThreshold > c.BurstNewUserThreshold || c.RapidClaimSeconds < 1 || c.RapidClaimSeconds > 3600 {
		return errors.New("签到检测阈值无效")
	}
	if c.AutoIPWindowSeconds < 600 || c.AutoIPWindowSeconds > 86400 || c.AutoIPNewUserThreshold < 10 || c.AutoIPNewUserThreshold > 10000 || c.AutoIPDeniedThreshold < 5 || c.AutoIPDeniedThreshold > 10000 || c.AutoIPBanSeconds < 60 || c.AutoIPBanSeconds > 86400 {
		return errors.New("自动IP临时封禁阈值无效")
	}
	if c.RetentionDays < 7 || c.RetentionDays > 180 || len(c.AllowlistIPs) > 200 || len(c.AllowlistUserIDs) > 200 {
		return errors.New("保留期限或白名单数量无效")
	}
	if c.RegistrationIPHourLimit < 10 || c.RegistrationIPHourLimit > 10000 || c.RegistrationWindowSeconds < 600 || c.RegistrationWindowSeconds > 86400 {
		return errors.New("注册检测阈值无效")
	}
	ipSet := map[string]bool{}
	ids := map[int]bool{}
	for _, s := range c.AllowlistIPs {
		s = strings.TrimSpace(s)
		if p, e := netip.ParsePrefix(s); e == nil {
			if p.Addr().Is4In6() || p.Addr().Zone() != "" || p.Bits() == 0 {
				return errors.New("白名单网段无效，不允许全网段或映射IPv6网段")
			}
			ipSet[p.Masked().String()] = true
		} else {
			v, e := NormalizeSecurityProtectionIP(s)
			if e != nil {
				return e
			}
			ipSet[v] = true
		}
	}
	for _, id := range c.AllowlistUserIDs {
		if id <= 0 {
			return errors.New("白名单用户ID无效")
		}
		ids[id] = true
	}
	c.AllowlistIPs = []string{}
	for s := range ipSet {
		c.AllowlistIPs = append(c.AllowlistIPs, s)
	}
	sort.Strings(c.AllowlistIPs)
	c.AllowlistUserIDs = []int{}
	for id := range ids {
		c.AllowlistUserIDs = append(c.AllowlistUserIDs, id)
	}
	sort.Ints(c.AllowlistUserIDs)
	return nil
}
func getSecurityProtectionConfig(db *gorm.DB) (*SecurityProtectionConfigView, error) {
	var p SecurityProtectionPolicy
	if err := db.First(&p, 1).Error; err != nil {
		return nil, err
	}
	v := &SecurityProtectionConfigView{Revision: p.Revision, UpdatedAt: p.UpdatedAt, UpdatedBy: p.UpdatedBy}
	v.Config = operation_setting.DefaultSecurityProtectionConfig()
	if err := json.Unmarshal([]byte(p.ConfigJSON), &v.Config); err != nil {
		return nil, err
	}
	if err := validateSecurityProtectionConfig(&v.Config); err != nil {
		return nil, err
	}
	return v, nil
}
func GetSecurityProtectionConfig() (*SecurityProtectionConfigView, error) {
	return getSecurityProtectionConfig(DB)
}
func UpdateSecurityProtectionConfig(expected int64, c operation_setting.SecurityProtectionConfig, operatorID int) (*SecurityProtectionConfigView, error) {
	if err := validateSecurityProtectionConfig(&c); err != nil {
		return nil, err
	}
	b, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	r := DB.Model(&SecurityProtectionPolicy{}).Where("id = ? AND revision = ?", 1, expected).Updates(map[string]any{"config_json": string(b), "revision": expected + 1, "updated_at": now, "updated_by": operatorID})
	if r.Error != nil {
		return nil, r.Error
	}
	if r.RowsAffected != 1 {
		return nil, ErrSecurityProtectionRevision
	}
	return &SecurityProtectionConfigView{Revision: expected + 1, Config: c, UpdatedAt: now, UpdatedBy: operatorID}, nil
}

func securityProtectionLock(tx *gorm.DB, key string, now int64) error {
	r := SecurityProtectionLock{Key: key, TouchedAt: now}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&r).Error; err != nil {
		return err
	}
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where(clause.Eq{Column: clause.Column{Name: "key"}, Value: key}).First(&r).Error; err != nil {
		return err
	}
	return tx.Model(&r).Update("touched_at", now).Error
}
func securityProtectionActiveBans(db *gorm.DB, now int64) *gorm.DB {
	return db.Model(&SecurityProtectionBan{}).Where("revoked_at = 0 AND (expires_at = 0 OR expires_at > ?)", now)
}
func securityProtectionFindBan(db *gorm.DB, c operation_setting.SecurityProtectionConfig, userID int, ip, scope string, now int64) (*SecurityProtectionBan, error) {
	q := securityProtectionActiveBans(db, now).Where("((subject_type = ? AND ip = ?) OR (subject_type = ? AND user_id = ?))", "ip", ip, "user", userID)
	if scope == "checkin" {
		q = q.Where("scope IN ?", []string{"ip", "account", "checkin"})
	} else if scope == "ip" {
		q = q.Where("scope = ?", "ip")
	} else {
		q = q.Where("scope IN ?", []string{"ip", "account"})
	}
	if !c.Enabled || c.Mode != "enforce" {
		q = q.Where("source = ?", "manual")
	}
	var b SecurityProtectionBan
	err := q.Order("id DESC").First(&b).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &b, err
}
func securityProtectionBanDecision(b *SecurityProtectionBan, now int64) *SecurityProtectionDecision {
	retry := int64(0)
	if b.ExpiresAt > now {
		retry = b.ExpiresAt - now
	}
	msg := "账号暂时受限，请联系管理员"
	if b.Scope == "checkin" {
		msg = "签到领取暂时受限，请稍后重试"
	} else if b.SubjectType == "ip" {
		msg = "当前IP暂时受限，请稍后重试或联系管理员"
	}
	return &SecurityProtectionDecision{Code: "security_protection_restricted", Rule: b.Rule, Message: msg, RetryAfter: retry, PolicyRevision: b.PolicyRevision}
}

// SecurityProtectionAccess checks live database restrictions, never changing a
// user's native disabled/deleted status or their auth/session versions.
func SecurityProtectionAccess(userID int, rawIP, scope string) (*SecurityProtectionDecision, error) {
	// Account restrictions remain effective when source attribution is absent.
	// An unknown IP skips automatic IP actions, never a manual UID restriction.
	ip, _ := NormalizeSecurityProtectionIP(rawIP)
	role := 0
	if userID > 0 {
		var u User
		if err := DB.Unscoped().Select("id", "role", "status", "deleted_at").First(&u, userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &SecurityProtectionDecision{Code: "AUTH_USER_DISABLED", Rule: "native_account_missing", Message: "账号不存在或已删除"}, nil
			}
			return nil, err
		}
		if u.DeletedAt.Valid || u.Status != common.UserStatusEnabled {
			return &SecurityProtectionDecision{Code: "AUTH_USER_DISABLED", Rule: "native_account_disabled", Message: "账号已停用或删除"}, nil
		}
		role = u.Role
	}
	v, err := GetSecurityProtectionConfig()
	if err != nil {
		return nil, err
	}
	// Administrators and explicit allowlists bypass this module only. Native
	// account state above and existing nginx/firewall/identity bans still apply.
	manualConfig := v.Config
	manualConfig.Enabled = false
	if role < common.RoleAdminUser {
		b, err := securityProtectionFindBan(DB, manualConfig, userID, ip, scope, time.Now().Unix())
		if err != nil {
			return nil, err
		}
		if b != nil {
			return securityProtectionBanDecision(b, time.Now().Unix()), nil
		}
	}
	if securityProtectionExempt(v.Config, userID, role, ip) {
		return &SecurityProtectionDecision{Allowed: true}, nil
	}
	b, err := securityProtectionFindBan(DB, v.Config, userID, ip, scope, time.Now().Unix())
	if err != nil {
		return nil, err
	}
	if b != nil {
		return securityProtectionBanDecision(b, time.Now().Unix()), nil
	}
	return &SecurityProtectionDecision{Allowed: true}, nil
}

func securityProtectionRecord(tx *gorm.DB, e SecurityProtectionEvent) error {
	if len(e.Route) > 160 {
		e.Route = e.Route[:160]
	}
	return tx.Create(&e).Error
}

func securityProtectionRequestID(values []string) string {
	if len(values) == 0 {
		return ""
	}
	s := strings.TrimSpace(values[0])
	if len(s) > 128 {
		return ""
	}
	for _, r := range s {
		if r < 33 || r > 126 {
			return ""
		}
	}
	return s
}

// SecurityProtectionCheckinGuard must execute inside the SAME transaction as
// checkin creation and quota increment. A denied decision is NOT a transaction
// error: commit it to retain evidence and temporary actions, without a reward.
// Lock order is always exact IP then UID. IPv6 /64 is evidence only.
func SecurityProtectionCheckinGuard(tx *gorm.DB, userID int, rawIP, route string, at time.Time, requestID ...string) (*SecurityProtectionDecision, error) {
	ip, sourceErr := NormalizeSecurityProtectionIP(rawIP)
	now := at.Unix()
	if err := securityProtectionLock(tx, "ip:"+ip, now); err != nil {
		return nil, err
	}
	if err := securityProtectionLock(tx, "uid:"+strconv.Itoa(userID), now); err != nil {
		return nil, err
	}
	var u User
	if err := tx.Unscoped().Clauses(clause.Locking{Strength: "UPDATE"}).Select("id", "role", "status", "deleted_at", "created_at", "used_quota").First(&u, userID).Error; err != nil {
		return nil, err
	}
	if u.DeletedAt.Valid || u.Status != common.UserStatusEnabled {
		d := &SecurityProtectionDecision{Code: "AUTH_USER_DISABLED", Rule: "native_account_disabled", Message: "账号已停用或删除"}
		return d, securityProtectionRecord(tx, SecurityProtectionEvent{UserID: userID, IP: ip, IPPrefix: securityProtectionPrefix(ip), Kind: "checkin_attempt", Scope: "checkin", RequestID: securityProtectionRequestID(requestID), Route: route, Decision: "denied", Rule: d.Rule, Summary: d.Message, CreatedAt: now})
	}
	if err := touchSecurityProtectionActivity(tx, userID, ip, now); err != nil {
		return nil, err
	}
	v, err := getSecurityProtectionConfig(tx)
	if err != nil {
		return nil, err
	}
	c := v.Config
	newUser := u.CreatedAt > 0 && now-u.CreatedAt < c.NewAccountAgeSeconds
	rapid := newUser && now-u.CreatedAt <= c.RapidClaimSeconds
	e := SecurityProtectionEvent{UserID: userID, IP: ip, IPPrefix: securityProtectionPrefix(ip), Kind: "checkin_attempt", Scope: "checkin", RequestID: securityProtectionRequestID(requestID), PolicyRevision: v.Revision, Evidence: map[string]int64{"account_age_seconds": now - u.CreatedAt}, Route: route, CreatedAt: now, NewUser: newUser, Rapid: rapid, Decision: "allowed"}
	e.Evidence["first_checkin_cooldown_seconds"] = c.FirstCheckinCooldownSeconds
	e.Evidence["ip_daily_new_user_limit"] = int64(c.IPDailyNewUserLimit)
	e.Evidence["burst_window_seconds"] = c.BurstWindowSeconds
	e.Evidence["burst_new_user_threshold"] = int64(c.BurstNewUserThreshold)
	e.Evidence["burst_rapid_user_threshold"] = int64(c.BurstRapidUserThreshold)
	e.Evidence["auto_ip_window_seconds"] = c.AutoIPWindowSeconds
	e.Evidence["auto_ip_new_user_threshold"] = int64(c.AutoIPNewUserThreshold)
	e.Evidence["auto_ip_denied_threshold"] = int64(c.AutoIPDeniedThreshold)
	e.Evidence["auto_ip_ban_seconds"] = c.AutoIPBanSeconds
	d := &SecurityProtectionDecision{Allowed: true, NewUser: newUser}
	manualConfig := c
	manualConfig.Enabled = false
	if u.Role < common.RoleAdminUser {
		if b, err := securityProtectionFindBan(tx, manualConfig, userID, ip, "checkin", now); err != nil {
			return nil, err
		} else if b != nil {
			d = securityProtectionBanDecision(b, now)
			e.Decision = "denied"
			e.Rule = d.Rule
			e.Summary = d.Message
			return d, securityProtectionRecord(tx, e)
		}
	}
	if securityProtectionTrusted(c, userID, u.Role, ip) {
		e.Decision = "exempt"
		e.Rule = "trusted_exemption"
		return d, securityProtectionRecord(tx, e)
	}
	if sourceErr != nil || securityProtectionLocalIP(ip) {
		d = &SecurityProtectionDecision{Code: "security_source_unavailable", Rule: "source_unavailable", Message: "暂时无法确认可信来源IP，签到未入账，请稍后重试", RetryAfter: 60}
		e.Decision = "denied"
		e.Rule = d.Rule
		e.Summary = d.Message
		return d, securityProtectionRecord(tx, e)
	}
	if b, err := securityProtectionFindBan(tx, c, userID, ip, "checkin", now); err != nil {
		return nil, err
	} else if b != nil {
		d = securityProtectionBanDecision(b, now)
		e.Decision = "denied"
		e.Rule = d.Rule
		e.Summary = d.Message
		e.RestrictedRetry = true
		if err := securityProtectionMaybeBanIP(tx, c, &e); err != nil {
			return nil, err
		}
		return d, securityProtectionRecord(tx, e)
	}
	if !c.Enabled {
		e.Rule = "protection_disabled"
		return d, securityProtectionRecord(tx, e)
	}
	var historical int64
	if err := tx.Model(&Checkin{}).Where("user_id = ?", userID).Count(&historical).Error; err != nil {
		return nil, err
	}
	first := historical == 0
	if first && newUser && now-u.CreatedAt < c.FirstCheckinCooldownSeconds {
		d = &SecurityProtectionDecision{Code: "checkin_cooldown", Rule: "first_checkin_cooldown", Message: "新账号首次签到需等待冷却期结束", RetryAfter: c.FirstCheckinCooldownSeconds - (now - u.CreatedAt)}
	}
	if newUser && d.Allowed {
		var count int64
		if err := tx.Model(&SecurityProtectionClaim{}).Where("ip = ? AND claim_date = ? AND new_user = ?", ip, at.Format("2006-01-02"), true).Count(&count).Error; err != nil {
			return nil, err
		}
		if count >= int64(c.IPDailyNewUserLimit) {
			d = &SecurityProtectionDecision{Code: "checkin_ip_daily_limit", Rule: "ip_daily_new_user_limit", Message: "当前IP今日新账号签到领取已达上限，请明日重试"}
		}
		e.Evidence["ip_daily_new_claims"] = count
	}
	// Current UID is included exactly once; repeated attempts never inflate the
	// distinct-account evidence used to decide a batch pattern.
	countDistinct := func(since int64, rapidOnly bool) (int64, error) {
		q := tx.Model(&SecurityProtectionEvent{}).Where("ip = ? AND kind = ? AND created_at >= ? AND new_user = ? AND user_id <> ?", ip, "checkin_attempt", since, true, userID)
		if rapidOnly {
			q = q.Where("rapid = ?", true)
		}
		var n int64
		err := q.Distinct("user_id").Count(&n).Error
		if newUser && (!rapidOnly || rapid) {
			n++
		}
		return n, err
	}
	n, err := countDistinct(now-c.BurstWindowSeconds, false)
	if err != nil {
		return nil, err
	}
	r, err := countDistinct(now-c.BurstWindowSeconds, true)
	if err != nil {
		return nil, err
	}
	batch := newUser && rapid && n >= int64(c.BurstNewUserThreshold) && r >= int64(c.BurstRapidUserThreshold)
	e.Evidence["burst_new_uids"] = n
	e.Evidence["burst_rapid_uids"] = r
	if batch {
		d = &SecurityProtectionDecision{Code: "checkin_batch_restricted", Rule: "rapid_new_account_batch", Message: "检测到短时间批量新账号领奖，签到领取暂时受限", RetryAfter: c.AutoIPBanSeconds}
	}
	if !d.Allowed && c.Mode == "observe" {
		e.Decision = "observed"
		e.Rule = d.Rule
		e.Summary = "观察模式：" + d.Message
		d = &SecurityProtectionDecision{Allowed: true, NewUser: newUser}
		return d, securityProtectionRecord(tx, e)
	}
	if !d.Allowed {
		e.Decision = "denied"
		e.Rule = d.Rule
		e.Summary = d.Message
		var prior int64
		if err := tx.Model(&SecurityProtectionEvent{}).Where("ip = ? AND user_id = ? AND created_at >= ? AND decision = ?", ip, userID, now-c.AutoIPWindowSeconds, "denied").Count(&prior).Error; err != nil {
			return nil, err
		}
		e.RestrictedRetry = prior > 0
		if batch {
			b := SecurityProtectionBan{SubjectType: "user", UserID: userID, Scope: "checkin", Source: "automatic", Reason: "多UID新注册后快速领奖；仅限制签到，不影响正常业务", Rule: "rapid_new_account_batch", CreatedAt: now, ExpiresAt: now + c.AutoIPBanSeconds, RequestID: e.RequestID, PolicyRevision: e.PolicyRevision, Evidence: e.Evidence}
			if err := tx.Create(&b).Error; err != nil {
				return nil, err
			}
		}
		if err := securityProtectionMaybeBanIP(tx, c, &e); err != nil {
			return nil, err
		}
	}
	return d, securityProtectionRecord(tx, e)
}

func securityProtectionSharedIP(tx *gorm.DB, ip string, since, oldBefore int64, trustedUserIDs ...int) (bool, error) {
	var n int64
	// Consumption can be funded entirely by giveaways. Only completed positive
	// external-provider payments establish new-account paid trust; balance moves
	// and pending orders never do. Explicit operator grants use the UID allowlist.
	trustSQL := "(u.created_at <= ? OR u.role >= ? OR EXISTS (SELECT 1 FROM top_ups AS p WHERE p.user_id = u.id AND p.status = ? AND p.amount > 0 AND p.money > 0 AND p.complete_time > 0 AND p.payment_provider IN ?))"
	trustArgs := []any{oldBefore, common.RoleAdminUser, common.TopUpStatusSuccess, []string{PaymentProviderEpay, PaymentProviderStripe, PaymentProviderCreem, PaymentProviderWaffo, PaymentProviderWaffoPancake}}
	if len(trustedUserIDs) > 0 {
		trustSQL = "(" + trustSQL + " OR u.id IN ?)"
		trustArgs = append(trustArgs, trustedUserIDs)
	}
	err := tx.Table("security_protection_events AS e").Joins("JOIN users AS u ON u.id = e.user_id").Where("e.ip = ? AND e.created_at >= ? AND u.status = ? AND u.deleted_at IS NULL", ip, since, common.UserStatusEnabled).Where(trustSQL, trustArgs...).Count(&n).Error
	if err != nil || n > 0 {
		return n > 0, err
	}
	err = tx.Table("security_protection_activities AS a").Joins("JOIN users AS u ON u.id = a.user_id").Where("a.ip = ? AND a.last_seen_at >= ? AND u.status = ? AND u.deleted_at IS NULL", ip, since, common.UserStatusEnabled).Where(trustSQL, trustArgs...).Count(&n).Error
	return n > 0, err
}

func securityProtectionMaybeBanIP(tx *gorm.DB, c operation_setting.SecurityProtectionConfig, e *SecurityProtectionEvent) error {
	if !c.Enabled || c.Mode != "enforce" || e.Decision != "denied" {
		return nil
	}
	var uids, retries int64
	q := tx.Model(&SecurityProtectionEvent{}).Where("ip = ? AND kind = ? AND created_at >= ?", e.IP, "checkin_attempt", e.CreatedAt-c.AutoIPWindowSeconds)
	if err := q.Session(&gorm.Session{}).Where("new_user = ? AND user_id <> ?", true, e.UserID).Distinct("user_id").Count(&uids).Error; err != nil {
		return err
	}
	if e.NewUser {
		uids++
	}
	if err := tx.Model(&SecurityProtectionEvent{}).Where("ip = ? AND created_at >= ? AND decision = ? AND restricted_retry = ?", e.IP, e.CreatedAt-c.AutoIPWindowSeconds, "denied", true).Count(&retries).Error; err != nil {
		return err
	}
	if e.RestrictedRetry {
		retries++
	}
	if e.Evidence == nil {
		e.Evidence = map[string]int64{}
	}
	e.Evidence["window_new_uids"] = uids
	e.Evidence["restricted_retries"] = retries
	if uids < int64(c.AutoIPNewUserThreshold) || retries < int64(c.AutoIPDeniedThreshold) {
		return nil
	}
	shared, err := securityProtectionSharedIP(tx, e.IP, e.CreatedAt-c.AutoIPWindowSeconds, e.CreatedAt-c.NewAccountAgeSeconds, c.AllowlistUserIDs...)
	if err != nil {
		return err
	}
	if shared {
		e.Summary += "；关联老号、管理员、白名单或已验证付费号，不自动封禁共享IP"
		return nil
	}
	var existing int64
	if err := securityProtectionActiveBans(tx, e.CreatedAt).Where("subject_type = ? AND ip = ? AND scope = ?", "ip", e.IP, "ip").Count(&existing).Error; err != nil {
		return err
	}
	if existing > 0 {
		return nil
	}
	if err := tx.Create(&SecurityProtectionBan{SubjectType: "ip", IP: e.IP, Scope: "ip", Source: "automatic", Reason: "多UID批量领奖且受限后持续尝试；精确IP短时限制", Rule: "persistent_batch_abuse", CreatedAt: e.CreatedAt, ExpiresAt: e.CreatedAt + c.AutoIPBanSeconds, RequestID: e.RequestID, PolicyRevision: e.PolicyRevision, Evidence: e.Evidence}).Error; err != nil {
		return err
	}
	return securityProtectionRecord(tx, SecurityProtectionEvent{UserID: e.UserID, IP: e.IP, IPPrefix: e.IPPrefix, Kind: "automatic_action", Scope: "ip", RequestID: e.RequestID, PolicyRevision: e.PolicyRevision, Evidence: e.Evidence, Route: e.Route, Rule: "persistent_batch_abuse", Decision: "denied", Summary: fmt.Sprintf("%d秒内%d个新UID且%d次受限后重试，精确IP临时限制%d秒", c.AutoIPWindowSeconds, uids, retries, c.AutoIPBanSeconds), CreatedAt: e.CreatedAt})
}

// TouchSecurityProtectionActivity is safe to invoke after successful auth. It
// records UID/IP/time only, and protects normal users of a shared public exit.
func TouchSecurityProtectionActivity(userID int, rawIP string) error {
	if userID <= 0 {
		return nil
	}
	ip, err := NormalizeSecurityProtectionIP(rawIP)
	if err != nil {
		return err
	}
	now := time.Now().Unix()
	return touchSecurityProtectionActivity(DB, userID, ip, now)
}

func touchSecurityProtectionActivity(db *gorm.DB, userID int, ip string, now int64) error {
	r := SecurityProtectionActivity{IP: ip, UserID: userID, LastSeenAt: now}
	return db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "ip"}, {Name: "user_id"}}, DoUpdates: clause.Assignments(map[string]any{"last_seen_at": now})}).Create(&r).Error
}

// UserCheckinProtected replaces UserCheckin at the HTTP integration point. All
// supported databases use a real transaction; quota is never awarded on policy
// or storage failure. Same UID/day uniqueness remains the final invariant.
func UserCheckinProtected(userID int, ip, route string, requestID ...string) (*Checkin, error) {
	s := operation_setting.GetCheckinSetting()
	if !s.Enabled {
		return nil, errors.New("签到功能未启用")
	}
	quota := s.MinQuota
	if s.MaxQuota > s.MinQuota {
		quota += rand.Intn(s.MaxQuota - s.MinQuota + 1)
	}
	now := time.Now()
	item := &Checkin{UserId: userID, CheckinDate: now.Format("2006-01-02"), QuotaAwarded: quota, CreatedAt: now.Unix()}
	var denied *SecurityProtectionDecision
	err := DB.Transaction(func(tx *gorm.DB) error {
		d, err := SecurityProtectionCheckinGuard(tx, userID, ip, route, now, requestID...)
		if err != nil {
			return err
		}
		if !d.Allowed {
			denied = d
			return nil
		}
		var existing int64
		if err := tx.Model(&Checkin{}).Where("user_id = ? AND checkin_date = ?", userID, item.CheckinDate).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ErrSecurityProtectionAlreadyCheckedIn
		}
		if err := tx.Create(item).Error; err != nil {
			return errors.New("今日已签到或签到写入失败，请刷新后重试")
		}
		r := tx.Model(&User{}).Where("id = ? AND status = ? AND deleted_at IS NULL", userID, common.UserStatusEnabled).Update("quota", gorm.Expr("quota + ?", quota))
		if r.Error != nil {
			return r.Error
		}
		if r.RowsAffected != 1 {
			return errors.New("账号已停用或删除")
		}
		{
			normalized, err := NormalizeSecurityProtectionIP(ip)
			if err != nil {
				normalized = "" // only an explicit UID/admin exemption can reach here
			}
			claim := SecurityProtectionClaim{UserID: userID, IP: normalized, ClaimDate: item.CheckinDate, CreatedAt: now.Unix(), NewUser: d.NewUser}
			if err := tx.Create(&claim).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("签到未入账：%w", err)
	}
	if denied != nil {
		return nil, denied
	}
	syncCreditUserQuotaCache(userID, quota, "checkin")
	return item, nil
}

// RecordSecurityProtectionDenial bounds site-wide denial evidence to one row
// per subject, rule, scope and minute. Checkin guards retain every reward attempt
// for the exact continued-retry counter; public traffic cannot amplify that.
func RecordSecurityProtectionDenial(userID int, rawIP, route, scope string, d *SecurityProtectionDecision, requestID ...string) error {
	if d == nil || d.Allowed {
		return nil
	}
	ip, err := NormalizeSecurityProtectionIP(rawIP)
	if err != nil {
		return err
	}
	now := time.Now().Unix()
	key := fmt.Sprintf("%s|%d|%s|%s|%d", ip, userID, scope, d.Rule, now/60)
	if len(key) > 160 {
		return errors.New("安全事件标识过长")
	}
	e := SecurityProtectionEvent{UserID: userID, IP: ip, IPPrefix: securityProtectionPrefix(ip), Kind: "access_denied", Scope: scope, RequestID: securityProtectionRequestID(requestID), PolicyRevision: d.PolicyRevision, Route: route, Decision: "denied", Rule: d.Rule, Summary: d.Message, CreatedAt: now, DedupKey: &key}
	if len(e.Route) > 160 {
		e.Route = e.Route[:160]
	}
	return DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&e).Error
}
