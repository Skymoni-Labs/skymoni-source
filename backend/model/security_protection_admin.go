package model

import (
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SecurityProtectionBanInput struct {
	SubjectType     string `json:"subject_type"`
	UserID          int    `json:"user_id"`
	IP              string `json:"ip"`
	Scope           string `json:"scope"`
	DurationSeconds int64  `json:"duration_seconds"`
	Reason          string `json:"reason"`
}

func CreateSecurityProtectionBan(in SecurityProtectionBanInput, operatorID int, operatorIP string, requestID ...string) (*SecurityProtectionBan, error) {
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Reason == "" || len([]rune(in.Reason)) > 255 {
		return nil, securityProtectionInvalid("请填写不超过255字的限制原因")
	}
	if in.DurationSeconds != 0 && (in.DurationSeconds < 60 || in.DurationSeconds > 31536000) {
		return nil, securityProtectionInvalid("限制时长必须为60至31536000秒，0表示人工永久限制")
	}
	now := time.Now().Unix()
	b := &SecurityProtectionBan{SubjectType: in.SubjectType, UserID: in.UserID, IP: in.IP, Scope: in.Scope, Source: "manual", Reason: in.Reason, Rule: "manual_restriction", CreatedAt: now, OperatorID: operatorID, RequestID: securityProtectionRequestID(requestID)}
	if in.DurationSeconds > 0 {
		b.ExpiresAt = now + in.DurationSeconds
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		v, err := getSecurityProtectionConfig(tx)
		if err != nil {
			return err
		}
		b.PolicyRevision = v.Revision
		key := ""
		switch in.SubjectType {
		case "user":
			if b.Scope == "" {
				b.Scope = "account"
			}
			if b.Scope != "account" && b.Scope != "checkin" {
				return securityProtectionInvalid("账号限制范围必须为account或checkin")
			}
			if in.UserID <= 0 || in.UserID == operatorID || in.IP != "" {
				return securityProtectionInvalid("禁止限制当前管理员或无效账号")
			}
			key = "uid:" + itoaSecurityProtection(in.UserID)
			if err := securityProtectionLock(tx, key, now); err != nil {
				return err
			}
			v, err = getSecurityProtectionConfig(tx)
			if err != nil {
				return err
			}
			b.PolicyRevision = v.Revision
			var u User
			if err := tx.Unscoped().Clauses(clause.Locking{Strength: "UPDATE"}).Select("id", "role", "status", "deleted_at").First(&u, in.UserID).Error; err != nil {
				return err
			}
			if u.Role >= common.RoleAdminUser {
				return securityProtectionInvalid("禁止在此限制管理员账号")
			}
			if u.DeletedAt.Valid || u.Status != common.UserStatusEnabled {
				return securityProtectionInvalid("账号已被原生停用或删除，请保留其既有状态")
			}
			for _, id := range v.Config.AllowlistUserIDs {
				if id == in.UserID {
					return securityProtectionInvalid("请先复核并移除账号白名单")
				}
			}
			key = "uid:" + itoaSecurityProtection(in.UserID)
		case "ip":
			if b.Scope == "" {
				b.Scope = "ip"
			}
			if b.Scope != "ip" || in.UserID != 0 {
				return securityProtectionInvalid("IP限制仅支持精确IP范围")
			}
			ip, err := NormalizeSecurityProtectionIP(in.IP)
			if err != nil {
				return err
			}
			b.IP = ip
			key = "ip:" + ip
			if err := securityProtectionLock(tx, key, now); err != nil {
				return err
			}
			v, err = getSecurityProtectionConfig(tx)
			if err != nil {
				return err
			}
			b.PolicyRevision = v.Revision
			ownIP, ownErr := NormalizeSecurityProtectionIP(operatorIP)
			if ownErr != nil {
				return securityProtectionInvalid("无法确认当前管理来源IP，禁止创建IP限制")
			}
			if ip == ownIP || securityProtectionExempt(v.Config, 0, 0, ip) {
				return securityProtectionInvalid("禁止限制当前操作来源、运维白名单或非公网IP")
			}
			// Never lock out an administrator whose source has been observed.
			var admins int64
			if err := tx.Table("security_protection_activities AS a").Joins("JOIN users AS u ON u.id = a.user_id").Where("a.ip = ? AND u.role >= ? AND u.deleted_at IS NULL", ip, common.RoleAdminUser).Count(&admins).Error; err != nil {
				return err
			}
			if admins > 0 {
				return securityProtectionInvalid("该IP曾关联管理员，请人工复核运维来源")
			}
			key = "ip:" + ip
		default:
			return securityProtectionInvalid("subject_type必须是user或ip")
		}
		q := securityProtectionActiveBans(tx, now).Where("subject_type = ? AND scope = ?", b.SubjectType, b.Scope)
		if b.SubjectType == "ip" {
			q = q.Where("ip = ?", b.IP)
		} else {
			q = q.Where("user_id = ?", b.UserID)
		}
		var count int64
		if err := q.Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return securityProtectionInvalid("对象已有同范围有效限制，请先复核现有限制")
		}
		return tx.Create(b).Error
	})
	return b, err
}

func itoaSecurityProtection(i int) string { return strconv.Itoa(i) }

func RevokeSecurityProtectionBan(id int64, reason string, operatorID int, requestID ...string) (*SecurityProtectionBan, error) {
	reason = strings.TrimSpace(reason)
	if id <= 0 || reason == "" || len([]rune(reason)) > 255 {
		return nil, securityProtectionInvalid("请提供有效限制ID及不超过255字的解除原因")
	}
	var b SecurityProtectionBan
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&b, id).Error; err != nil {
			return err
		}
		key := "ip:" + b.IP
		if b.SubjectType == "user" {
			key = "uid:" + itoaSecurityProtection(b.UserID)
		}
		if err := securityProtectionLock(tx, key, time.Now().Unix()); err != nil {
			return err
		}
		r := tx.Model(&SecurityProtectionBan{}).Where("id = ? AND revoked_at = 0", id).Updates(map[string]any{"revoked_at": time.Now().Unix(), "revoked_by": operatorID, "revoke_reason": reason, "revoked_request_id": securityProtectionRequestID(requestID)})
		if r.Error != nil {
			return r.Error
		}
		if r.RowsAffected != 1 {
			return securityProtectionInvalid("该限制已经解除")
		}
		return tx.First(&b, id).Error
	})
	return &b, err
}

func securityProtectionPage(page, size int) (int, int) {
	if page < 1 {
		page = 1
	}
	if page > 100000 {
		page = 100000
	}
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	return page, size
}

func ListSecurityProtectionEvents(page, size int, decision, kind string, userID int, rawIP string, requestID ...string) ([]SecurityProtectionEvent, int64, error) {
	page, size = securityProtectionPage(page, size)
	q := DB.Model(&SecurityProtectionEvent{})
	if id := securityProtectionRequestID(requestID); id != "" {
		q = q.Where("request_id = ?", id)
	}
	if decision != "" {
		q = q.Where("decision = ?", decision)
	}
	if kind != "" {
		q = q.Where("kind = ?", kind)
	}
	if userID > 0 {
		q = q.Where("user_id = ?", userID)
	}
	if rawIP != "" {
		ip, err := NormalizeSecurityProtectionIP(rawIP)
		if err != nil {
			return nil, 0, err
		}
		q = q.Where("ip = ?", ip)
	}
	var n int64
	if err := q.Count(&n).Error; err != nil {
		return nil, 0, err
	}
	items := []SecurityProtectionEvent{}
	err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&items).Error
	return items, n, err
}
func ListSecurityProtectionBans(page, size int, active bool) ([]SecurityProtectionBan, int64, error) {
	page, size = securityProtectionPage(page, size)
	q := DB.Model(&SecurityProtectionBan{})
	if active {
		q = securityProtectionActiveBans(DB, time.Now().Unix())
	}
	var n int64
	if err := q.Count(&n).Error; err != nil {
		return nil, 0, err
	}
	items := []SecurityProtectionBan{}
	err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&items).Error
	return items, n, err
}

func GetSecurityProtectionOverview() (map[string]any, error) {
	v, err := GetSecurityProtectionConfig()
	if err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	out := map[string]any{"enabled": v.Config.Enabled, "mode": v.Config.Mode, "revision": v.Revision, "healthy": true}
	for _, kind := range []string{"user", "ip"} {
		var n int64
		if err := securityProtectionActiveBans(DB, now).Where("subject_type = ?", kind).Count(&n).Error; err != nil {
			return nil, err
		}
		out["active_"+kind+"_bans"] = n
	}
	for key, decision := range map[string]string{"events_24h": "", "denied_24h": "denied", "observed_24h": "observed"} {
		q := DB.Model(&SecurityProtectionEvent{}).Where("created_at >= ?", now-86400)
		if decision != "" {
			q = q.Where("decision = ?", decision)
		}
		var n int64
		if err := q.Count(&n).Error; err != nil {
			return nil, err
		}
		out[key] = n
	}
	var last int64
	if err := DB.Model(&SecurityProtectionEvent{}).Select("COALESCE(MAX(created_at), 0)").Scan(&last).Error; err != nil {
		return nil, err
	}
	out["last_event_at"] = last
	// Query every table used by the money guard: missing migrations must not
	// present as healthy merely because the configuration table exists.
	for _, table := range []any{&SecurityProtectionLock{}, &SecurityProtectionClaim{}, &SecurityProtectionActivity{}, &TopUp{}} {
		var n int64
		if err := DB.Model(table).Limit(1).Count(&n).Error; err != nil {
			return nil, err
		}
	}
	return out, nil
}

// CleanupSecurityProtectionRecords retains permanent first-claim facts and
// manual/revocation audit. Expiration is evaluated during every access check.
func CleanupSecurityProtectionRecords() error {
	v, err := GetSecurityProtectionConfig()
	if err != nil {
		return err
	}
	cutoff := time.Now().Add(-time.Duration(v.Config.RetentionDays) * 24 * time.Hour).Unix()
	actionDays := v.Config.RetentionDays
	if actionDays < 90 {
		actionDays = 90
	}
	actionCutoff := time.Now().Add(-time.Duration(actionDays) * 24 * time.Hour).Unix()
	if err := DB.Where("(created_at < ? AND kind <> ?) OR (created_at < ? AND kind = ?)", cutoff, "automatic_action", actionCutoff, "automatic_action").Delete(&SecurityProtectionEvent{}).Error; err != nil {
		return err
	}
	return DB.Where("last_seen_at < ?", cutoff).Delete(&SecurityProtectionActivity{}).Error
}

// RecordSecurityProtectionEvent accepts a fixed event vocabulary and route
// template, never request bodies, query strings, tokens or supplied headers.
func RecordSecurityProtectionEvent(userID int, rawIP, route, kind string, requestID ...string) error {
	if kind != "registration" && kind != "login" && kind != "token_created" {
		return securityProtectionInvalid("无效的安全事件类型")
	}
	ip, err := NormalizeSecurityProtectionIP(rawIP)
	if err != nil {
		return err
	}
	if strings.ContainsAny(route, "?\r\n") {
		return securityProtectionInvalid("仅允许记录路由模板")
	}
	v, err := GetSecurityProtectionConfig()
	if err != nil {
		return err
	}
	now := time.Now().Unix()
	var u User
	if err := DB.Select("id", "role", "created_at").First(&u, userID).Error; err != nil {
		return err
	}
	e := SecurityProtectionEvent{UserID: userID, IP: ip, IPPrefix: securityProtectionPrefix(ip), Kind: kind, RequestID: securityProtectionRequestID(requestID), PolicyRevision: v.Revision, Route: route, Decision: "allowed", Rule: "metadata", CreatedAt: now, NewUser: u.CreatedAt > 0 && now-u.CreatedAt < v.Config.NewAccountAgeSeconds}
	if err := securityProtectionRecord(DB, e); err != nil {
		return err
	}
	return TouchSecurityProtectionActivity(userID, ip)
}

// SecurityProtectionRegistrationGuard limits only registration submissions.
// It never disables an account and never blocks paid traffic. Unknown storage
// errors are reported to the caller; the normal login flow remains unaffected.
func SecurityProtectionRegistrationGuard(rawIP, route string, requestID ...string) (*SecurityProtectionDecision, error) {
	ip, err := NormalizeSecurityProtectionIP(rawIP)
	if err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	d := &SecurityProtectionDecision{Allowed: true}
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := securityProtectionLock(tx, "ip:"+ip, now); err != nil {
			return err
		}
		v, err := getSecurityProtectionConfig(tx)
		if err != nil {
			return err
		}
		c := v.Config
		e := SecurityProtectionEvent{IP: ip, IPPrefix: securityProtectionPrefix(ip), Kind: "registration_attempt", Scope: "registration", RequestID: securityProtectionRequestID(requestID), PolicyRevision: v.Revision, Route: route, Decision: "allowed", Rule: "registration_metadata", CreatedAt: now}
		manualConfig := c
		manualConfig.Enabled = false
		if b, err := securityProtectionFindBan(tx, manualConfig, 0, ip, "ip", now); err != nil {
			return err
		} else if b != nil {
			d = securityProtectionBanDecision(b, now)
			e.Decision = "denied"
			e.Rule = d.Rule
			return securityProtectionRecord(tx, e)
		}
		if !c.Enabled || securityProtectionExempt(c, 0, 0, ip) {
			e.Decision = "exempt"
			return securityProtectionRecord(tx, e)
		}
		shared, err := securityProtectionSharedIP(tx, ip, now-c.RegistrationWindowSeconds, now-c.NewAccountAgeSeconds, c.AllowlistUserIDs...)
		if err != nil {
			return err
		}
		if shared {
			e.Decision = "exempt"
			e.Rule = "shared_exit_protected"
			return securityProtectionRecord(tx, e)
		}
		var n int64
		if err := tx.Model(&SecurityProtectionEvent{}).Where("ip = ? AND kind = ? AND created_at >= ?", ip, "registration_attempt", now-c.RegistrationWindowSeconds).Count(&n).Error; err != nil {
			return err
		}
		e.Evidence = map[string]int64{"registration_submissions_in_window": n + 1, "registration_ip_hour_limit": int64(c.RegistrationIPHourLimit), "registration_window_seconds": c.RegistrationWindowSeconds}
		if n >= int64(c.RegistrationIPHourLimit) {
			e.Rule = "registration_ip_rate"
			e.Summary = "同IP注册提交频率过高；仅暂缓新注册"
			if c.Mode == "observe" {
				e.Decision = "observed"
			} else {
				e.Decision = "denied"
				d = &SecurityProtectionDecision{Code: "registration_rate_limited", Rule: e.Rule, Message: "当前IP注册提交过于频繁，请稍后重试", RetryAfter: c.RegistrationWindowSeconds}
			}
		}
		return securityProtectionRecord(tx, e)
	})
	return d, err
}
