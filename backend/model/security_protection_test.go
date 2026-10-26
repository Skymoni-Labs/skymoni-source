package model

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func securityProtectionTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	var dialector gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "security.db"))
	family := common.DatabaseTypeSQLite
	expectedSchema := ""
	if dsn := os.Getenv("TEST_SECURITY_POSTGRES_DSN"); dsn != "" {
		// Every test gets a brand-new schema. No production table or existing
		// schema is migrated or cleaned, even when the DSN hosts other data.
		schema := fmt.Sprintf("sp_test_%d_%d", time.Now().UnixNano(), securityProtectionTestSchemaSequence.Add(1))
		expectedSchema = schema
		admin, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
		require.NoError(t, err)
		require.NoError(t, admin.Exec("CREATE SCHEMA "+schema).Error)
		scoped := dsn
		if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
			u, err := url.Parse(dsn)
			require.NoError(t, err)
			q := u.Query()
			q.Set("search_path", schema)
			u.RawQuery = q.Encode()
			scoped = u.String()
		} else {
			scoped += " search_path=" + schema
		}
		dialector = postgres.Open(scoped)
		family = common.DatabaseTypePostgreSQL
		t.Cleanup(func() {
			require.NoError(t, admin.Exec("DROP SCHEMA "+schema+" CASCADE").Error)
			conn, err := admin.DB()
			require.NoError(t, err)
			_ = conn.Close()
		})
	}
	db, err := gorm.Open(dialector, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	if family == common.DatabaseTypePostgreSQL {
		var actualSchema string
		require.NoError(t, db.Raw("SELECT current_schema()").Scan(&actualSchema).Error)
		require.NotEqual(t, "public", actualSchema)
		require.Equal(t, expectedSchema, actualSchema, "refusing to migrate any pre-existing/shared schema")
	}
	sql, err := db.DB()
	require.NoError(t, err)
	if family == common.DatabaseTypePostgreSQL {
		sql.SetMaxOpenConns(24)
	} else {
		sql.SetMaxOpenConns(1)
	}
	prior, priorRedis, priorType, priorSetting := DB, common.RedisEnabled, common.MainDatabaseType(), *operation_setting.GetCheckinSetting()
	DB = db
	common.RedisEnabled = false
	common.SetMainDatabaseType(family)
	initCol()
	*operation_setting.GetCheckinSetting() = operation_setting.CheckinSetting{Enabled: true, MinQuota: 7, MaxQuota: 7}
	require.NoError(t, db.AutoMigrate(&User{}, &Checkin{}, &TopUp{}))
	require.NoError(t, InitSecurityProtection(db))
	t.Cleanup(func() {
		DB = prior
		common.RedisEnabled = priorRedis
		common.SetMainDatabaseType(priorType)
		initCol()
		*operation_setting.GetCheckinSetting() = priorSetting
		_ = sql.Close()
	})
	return db
}

var securityProtectionTestSchemaSequence atomic.Int64

func securityProtectionTestUser(t *testing.T, id int, age time.Duration) *User {
	t.Helper()
	u := &User{Id: id, Username: fmt.Sprintf("security-%d", id), Password: "not-a-real-hash", AffCode: fmt.Sprintf("security-%d", id), Role: common.RoleCommonUser, Status: common.UserStatusEnabled, CreatedAt: time.Now().Add(-age).Unix()}
	require.NoError(t, DB.Create(u).Error)
	return u
}
func securityProtectionTestPolicy(t *testing.T, mutate func(*operation_setting.SecurityProtectionConfig)) {
	t.Helper()
	v, err := GetSecurityProtectionConfig()
	require.NoError(t, err)
	c := v.Config
	c.Enabled = true
	c.Mode = "enforce"
	mutate(&c)
	_, err = UpdateSecurityProtectionConfig(v.Revision, c, 999)
	require.NoError(t, err)
}
func securityProtectionTestGuard(t *testing.T, uid int, ip string, requestID ...string) *SecurityProtectionDecision {
	t.Helper()
	var d *SecurityProtectionDecision
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		var err error
		d, err = SecurityProtectionCheckinGuard(tx, uid, ip, "/api/user/checkin", time.Now(), requestID...)
		return err
	}))
	return d
}

func TestSecurityProtectionConcurrencyFirstClaimBudget(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.FirstCheckinCooldownSeconds = 0 })
	for i := 1; i <= 24; i++ {
		securityProtectionTestUser(t, i, 2*time.Hour)
	}
	var wg sync.WaitGroup
	var success atomic.Int64
	for i := 1; i <= 24; i++ {
		wg.Add(1)
		go func(uid int) {
			defer wg.Done()
			if _, err := UserCheckinProtected(uid, "::ffff:8.8.4.4", "/api/user/checkin"); err == nil {
				success.Add(1)
			}
		}(i)
	}
	wg.Wait()
	require.EqualValues(t, 5, success.Load())
	var claims, checkins, sum int64
	require.NoError(t, db.Model(&SecurityProtectionClaim{}).Count(&claims).Error)
	require.NoError(t, db.Model(&Checkin{}).Count(&checkins).Error)
	require.NoError(t, db.Model(&User{}).Select("SUM(quota)").Scan(&sum).Error)
	require.EqualValues(t, 5, claims)
	require.EqualValues(t, 5, checkins)
	require.EqualValues(t, 35, sum)
	var ips []string
	require.NoError(t, db.Model(&SecurityProtectionClaim{}).Distinct("ip").Pluck("ip", &ips).Error)
	require.Equal(t, []string{"8.8.4.4"}, ips)
}
func TestSecurityProtectionSameUIDUniqueConstraint(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.FirstCheckinCooldownSeconds = 0 })
	securityProtectionTestUser(t, 1, 24*time.Hour)
	var wg sync.WaitGroup
	var success atomic.Int64
	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			if _, err := UserCheckinProtected(1, fmt.Sprintf("9.9.9.%d", n+1), "/api/user/checkin"); err == nil {
				success.Add(1)
			}
		}(i)
	}
	wg.Wait()
	require.EqualValues(t, 1, success.Load())
	var u User
	require.NoError(t, db.First(&u, 1).Error)
	require.Equal(t, 7, u.Quota)
	// The pre-existing database uniqueness invariant is retained independently.
	require.Error(t, db.Create(&Checkin{UserId: 1, CheckinDate: time.Now().Format("2006-01-02")}).Error)
}
func TestSecurityProtectionCooldownObserveDisabledAndNativeStatus(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestUser(t, 1, 10*time.Second)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) {})
	_, err := UserCheckinProtected(1, "8.8.8.8", "/api/user/checkin")
	var denied *SecurityProtectionDecision
	require.ErrorAs(t, err, &denied)
	require.Equal(t, "first_checkin_cooldown", denied.Rule)
	var n int64
	require.NoError(t, db.Model(&Checkin{}).Count(&n).Error)
	require.Zero(t, n)
	require.NoError(t, db.Model(&SecurityProtectionEvent{}).Where("decision = ?", "denied").Count(&n).Error)
	require.EqualValues(t, 1, n)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.Mode = "observe" })
	require.True(t, securityProtectionTestGuard(t, 1, "8.8.8.8").Allowed)
	require.NoError(t, db.Model(&SecurityProtectionBan{}).Count(&n).Error)
	require.Zero(t, n)
	var u User
	require.NoError(t, db.First(&u, 1).Error)
	require.Zero(t, u.Quota) // guard never awards funds
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.Enabled = false })
	require.True(t, securityProtectionTestGuard(t, 1, "8.8.8.8").Allowed)
	require.NoError(t, db.Model(&User{}).Where("id = ?", 1).Update("status", common.UserStatusDisabled).Error)
	require.False(t, securityProtectionTestGuard(t, 1, "127.0.0.1").Allowed)
	d, err := SecurityProtectionAccess(1, "8.8.8.8", "account")
	require.NoError(t, err)
	require.False(t, d.Allowed)
	require.NoError(t, db.Delete(&User{}, 1).Error)
	_, err = UserCheckinProtected(1, "8.8.8.8", "/api/user/checkin")
	require.Error(t, err)
}
func TestSecurityProtectionOldUsersAndExemptions(t *testing.T) {
	securityProtectionTestDB(t)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) {
		c.AllowlistIPs = []string{"8.8.8.8", "2001:4860::/32"}
		c.AllowlistUserIDs = []int{3}
	})
	securityProtectionTestUser(t, 1, 30*24*time.Hour)
	securityProtectionTestUser(t, 2, time.Second)
	securityProtectionTestUser(t, 3, time.Second)
	securityProtectionTestUser(t, 4, time.Second)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", 4).Update("role", common.RoleAdminUser).Error)
	for _, tc := range []struct {
		uid int
		ip  string
	}{{1, "1.1.1.1"}, {2, "8.8.8.8"}, {3, "1.1.1.1"}, {4, "1.1.1.1"}, {4, "127.0.0.1"}, {3, "10.0.0.8"}, {2, "2001:4860::123"}} {
		require.True(t, securityProtectionTestGuard(t, tc.uid, tc.ip).Allowed, "uid=%d ip=%s", tc.uid, tc.ip)
	}
}
func TestSecurityProtectionManualBanNeverResurrectsNativeState(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestUser(t, 1, 24*time.Hour)
	securityProtectionTestUser(t, 2, 24*time.Hour)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) {})
	b, err := CreateSecurityProtectionBan(SecurityProtectionBanInput{SubjectType: "user", UserID: 1, DurationSeconds: 60, Reason: "人工复核"}, 999, "8.8.8.8")
	require.NoError(t, err)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.Enabled = false; c.Mode = "observe" })
	d, err := SecurityProtectionAccess(1, "127.0.0.1", "account")
	require.NoError(t, err)
	require.False(t, d.Allowed) // private sources cannot bypass manual account restrictions
	d, err = SecurityProtectionAccess(1, "", "account")
	require.NoError(t, err)
	require.False(t, d.Allowed, "missing source cannot bypass manual account restriction")
	require.NoError(t, db.Model(&User{}).Where("id = ?", 1).Update("status", common.UserStatusDisabled).Error)
	_, err = RevokeSecurityProtectionBan(b.ID, "人工解除", 999)
	require.NoError(t, err)
	d, err = SecurityProtectionAccess(1, "8.8.4.4", "account")
	require.NoError(t, err)
	require.False(t, d.Allowed)
	var u User
	require.NoError(t, db.First(&u, 1).Error)
	require.Equal(t, common.UserStatusDisabled, u.Status)
	for _, ip := range []string{"8.8.8.8", "127.0.0.1", "10.0.0.1", "192.168.1.1", "8.8.4.0/24"} {
		_, err := CreateSecurityProtectionBan(SecurityProtectionBanInput{SubjectType: "ip", IP: ip, Reason: "复核"}, 999, "8.8.8.8")
		require.Error(t, err, ip)
	}
	require.NoError(t, db.Model(&User{}).Where("id = ?", 2).Update("role", common.RoleAdminUser).Error)
	require.NoError(t, TouchSecurityProtectionActivity(2, "1.1.1.1"))
	_, err = CreateSecurityProtectionBan(SecurityProtectionBanInput{SubjectType: "ip", IP: "1.1.1.1", Reason: "复核"}, 999, "8.8.8.8")
	require.Error(t, err)
}
func TestSecurityProtectionAutomaticEscalationRetriesAndExpiry(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) {
		c.AutoIPNewUserThreshold = 10
		c.AutoIPDeniedThreshold = 5
	})
	for i := 1; i <= 10; i++ {
		securityProtectionTestUser(t, i, time.Second)
		require.False(t, securityProtectionTestGuard(t, i, "8.8.8.8").Allowed)
	}
	var bans int64
	require.NoError(t, db.Model(&SecurityProtectionBan{}).Where("subject_type = ?", "ip").Count(&bans).Error)
	require.Zero(t, bans, "ten first-time denials must not count as continued retries")
	for i := 0; i < 5; i++ {
		require.False(t, securityProtectionTestGuard(t, 1, "8.8.8.8", fmt.Sprintf("security-retry-%d", i)).Allowed)
	}
	require.NoError(t, db.Model(&SecurityProtectionBan{}).Where("subject_type = ?", "ip").Count(&bans).Error)
	require.EqualValues(t, 1, bans)
	var ipBan SecurityProtectionBan
	require.NoError(t, db.Where("subject_type = ?", "ip").First(&ipBan).Error)
	require.Equal(t, "security-retry-4", ipBan.RequestID)
	require.EqualValues(t, 2, ipBan.PolicyRevision)
	require.EqualValues(t, 5, ipBan.Evidence["restricted_retries"])
	events, total, err := ListSecurityProtectionEvents(1, 20, "", "", 0, "", "security-retry-4")
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	for _, event := range events {
		require.EqualValues(t, 2, event.PolicyRevision)
		require.NotEmpty(t, event.Evidence)
		require.Equal(t, "security-retry-4", event.RequestID)
	}
	d, err := SecurityProtectionAccess(1, "8.8.8.8", "account")
	require.NoError(t, err)
	require.False(t, d.Allowed)
	require.NoError(t, db.Model(&SecurityProtectionBan{}).Where("source = ?", "automatic").Update("expires_at", time.Now().Unix()-1).Error)
	d, err = SecurityProtectionAccess(1, "8.8.8.8", "account")
	require.NoError(t, err)
	require.True(t, d.Allowed)
	var claims int64
	require.NoError(t, db.Model(&SecurityProtectionClaim{}).Count(&claims).Error)
	require.Zero(t, claims, "retries never consume first-claim daily budget")
}
func TestSecurityProtectionSharedPaidAndOldExitNeverAutoIPBanned(t *testing.T) {
	for _, paid := range []bool{false, true} {
		t.Run(fmt.Sprint(paid), func(t *testing.T) {
			db := securityProtectionTestDB(t)
			securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) {
				c.AutoIPNewUserThreshold = 10
				c.AutoIPDeniedThreshold = 5
			})
			age := 30 * 24 * time.Hour
			if paid {
				age = time.Minute
			}
			securityProtectionTestUser(t, 50, age)
			if paid {
				require.NoError(t, db.Create(&TopUp{UserId: 50, Amount: 100, Money: 1, TradeNo: "verified-payment", PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusSuccess, CompleteTime: time.Now().Unix()}).Error)
			}
			require.NoError(t, TouchSecurityProtectionActivity(50, "8.8.8.8"))
			for i := 1; i <= 10; i++ {
				securityProtectionTestUser(t, i, time.Second)
				securityProtectionTestGuard(t, i, "8.8.8.8")
			}
			for i := 0; i < 8; i++ {
				securityProtectionTestGuard(t, 1, "8.8.8.8")
			}
			var n int64
			require.NoError(t, db.Model(&SecurityProtectionBan{}).Where("subject_type = ?", "ip").Count(&n).Error)
			require.Zero(t, n)
		})
	}
}
func TestSecurityProtectionConfigCASAndValidation(t *testing.T) {
	securityProtectionTestDB(t)
	v, err := GetSecurityProtectionConfig()
	require.NoError(t, err)
	c := v.Config
	c.Enabled = true
	c.Mode = "enforce"
	var wg sync.WaitGroup
	var winners atomic.Int64
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := UpdateSecurityProtectionConfig(v.Revision, c, 999)
			if err == nil {
				winners.Add(1)
			} else if !errors.Is(err, ErrSecurityProtectionRevision) {
				t.Errorf("unexpected CAS error: %v", err)
			}
		}()
	}
	wg.Wait()
	require.EqualValues(t, 1, winners.Load())
	c.AllowlistIPs = []string{"0.0.0.0/0"}
	_, err = UpdateSecurityProtectionConfig(v.Revision+1, c, 999)
	require.Error(t, err)
	got, err := GetSecurityProtectionConfig()
	require.NoError(t, err)
	require.Equal(t, v.Revision+1, got.Revision)
}
func TestSecurityProtectionRegistrationScopeAndObserve(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.RegistrationIPHourLimit = 10 })
	for i := 0; i < 10; i++ {
		d, err := SecurityProtectionRegistrationGuard("8.8.8.8", "/api/user/register")
		require.NoError(t, err)
		require.True(t, d.Allowed)
	}
	d, err := SecurityProtectionRegistrationGuard("8.8.8.8", "/api/user/register")
	require.NoError(t, err)
	require.False(t, d.Allowed)
	d, err = SecurityProtectionAccess(0, "8.8.8.8", "ip")
	require.NoError(t, err)
	require.True(t, d.Allowed, "registration rate must not become an automatic site-wide ban")
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.Mode = "observe" })
	d, err = SecurityProtectionRegistrationGuard("8.8.8.8", "/api/user/register")
	require.NoError(t, err)
	require.True(t, d.Allowed)
	var n int64
	require.NoError(t, db.Model(&SecurityProtectionBan{}).Count(&n).Error)
	require.Zero(t, n)
}
func TestSecurityProtectionMoneyRollbackDoesNotConsumeBudget(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.FirstCheckinCooldownSeconds = 0 })
	securityProtectionTestUser(t, 1, 2*time.Hour)
	if db.Dialector.Name() == "postgres" {
		require.NoError(t, db.Exec("CREATE FUNCTION reject_test_quota_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test funding failure'; END; $$").Error)
		require.NoError(t, db.Exec("CREATE TRIGGER reject_test_quota BEFORE UPDATE OF quota ON users FOR EACH ROW EXECUTE FUNCTION reject_test_quota_fn()").Error)
	} else {
		require.NoError(t, db.Exec("CREATE TRIGGER reject_test_quota BEFORE UPDATE OF quota ON users BEGIN SELECT RAISE(ABORT, 'test funding failure'); END;").Error)
	}
	_, err := UserCheckinProtected(1, "8.8.8.8", "/api/user/checkin")
	require.Error(t, err)
	for _, table := range []any{&Checkin{}, &SecurityProtectionClaim{}} {
		var n int64
		require.NoError(t, db.Model(table).Count(&n).Error)
		require.Zero(t, n)
	}
	if db.Dialector.Name() == "postgres" {
		require.NoError(t, db.Exec("DROP TRIGGER reject_test_quota ON users").Error)
	} else {
		require.NoError(t, db.Exec("DROP TRIGGER reject_test_quota").Error)
	}
	_, err = UserCheckinProtected(1, "8.8.8.8", "/api/user/checkin")
	require.NoError(t, err)
}

func TestSecurityProtectionNewAccountsAcrossDaysStillUseDailyIPBudget(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.FirstCheckinCooldownSeconds = 0 })
	for uid := 1; uid <= 6; uid++ {
		securityProtectionTestUser(t, uid, 48*time.Hour)
	}
	yesterday := time.Now().Add(-24 * time.Hour).Format("2006-01-02")
	for uid := 1; uid <= 6; uid++ {
		require.NoError(t, db.Create(&Checkin{UserId: uid, CheckinDate: yesterday, QuotaAwarded: 7, CreatedAt: time.Now().Add(-24 * time.Hour).Unix()}).Error)
		require.NoError(t, db.Create(&SecurityProtectionClaim{UserID: uid, IP: "8.8.8.8", ClaimDate: yesterday, NewUser: true}).Error)
	}
	for uid := 1; uid <= 5; uid++ {
		_, err := UserCheckinProtected(uid, "8.8.8.8", "/api/user/checkin")
		require.NoError(t, err)
	}
	_, err := UserCheckinProtected(6, "8.8.8.8", "/api/user/checkin")
	var denied *SecurityProtectionDecision
	require.ErrorAs(t, err, &denied)
	require.Equal(t, "ip_daily_new_user_limit", denied.Rule)
	var n int64
	require.NoError(t, db.Model(&SecurityProtectionClaim{}).Where("claim_date = ?", time.Now().Format("2006-01-02")).Count(&n).Error)
	require.EqualValues(t, 5, n)
}

func TestSecurityProtectionPrivateOrMissingSourceNeverAwardsOrdinaryUsers(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.Enabled = false })
	securityProtectionTestUser(t, 1, 30*24*time.Hour)
	for _, ip := range []string{"", "127.0.0.1", "10.0.0.5", "172.19.0.1", "::1", "::ffff:192.168.0.5"} {
		_, err := UserCheckinProtected(1, ip, "/api/user/checkin")
		var denied *SecurityProtectionDecision
		require.ErrorAs(t, err, &denied, ip)
		require.Equal(t, "security_source_unavailable", denied.Code)
	}
	var u User
	require.NoError(t, db.First(&u, 1).Error)
	require.Zero(t, u.Quota)
	var n int64
	require.NoError(t, db.Model(&SecurityProtectionBan{}).Count(&n).Error)
	require.Zero(t, n)
	// Only an explicit operator trust decision can exempt such a source.
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) { c.AllowlistUserIDs = []int{1} })
	_, err := UserCheckinProtected(1, "127.0.0.1", "/api/user/checkin")
	require.NoError(t, err)
}

func TestSecurityProtectionGiftConsumptionPendingAndBalanceNeverTrustNewUser(t *testing.T) {
	for _, payment := range []string{"gift_consumption", "pending_payment", "balance_payment"} {
		t.Run(payment, func(t *testing.T) {
			db := securityProtectionTestDB(t)
			securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) {
				c.AutoIPNewUserThreshold = 10
				c.AutoIPDeniedThreshold = 5
			})
			securityProtectionTestUser(t, 50, time.Minute)
			require.NoError(t, db.Model(&User{}).Where("id = ?", 50).Update("used_quota", 100).Error)
			if payment != "gift_consumption" {
				p := TopUp{UserId: 50, Amount: 100, Money: 1, TradeNo: "not-verified-paid", PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusPending, CompleteTime: time.Now().Unix()}
				if payment == "balance_payment" {
					p.Status = common.TopUpStatusSuccess
					p.PaymentProvider = PaymentProviderBalance
				}
				require.NoError(t, db.Create(&p).Error)
			}
			require.NoError(t, TouchSecurityProtectionActivity(50, "8.8.8.8"))
			for uid := 1; uid <= 10; uid++ {
				securityProtectionTestUser(t, uid, time.Second)
				securityProtectionTestGuard(t, uid, "8.8.8.8")
			}
			for i := 0; i < 5; i++ {
				securityProtectionTestGuard(t, 1, "8.8.8.8")
			}
			var n int64
			require.NoError(t, db.Model(&SecurityProtectionBan{}).Where("subject_type = ?", "ip").Count(&n).Error)
			require.EqualValues(t, 1, n)
		})
	}
}

func TestSecurityProtectionManualIPBanRechecksAdminAfterConcurrentGuardCommits(t *testing.T) {
	db := securityProtectionTestDB(t)
	if db.Dialector.Name() != "postgres" {
		t.Skip("requires isolated PostgreSQL with multiple connections")
	}
	securityProtectionTestUser(t, 50, time.Second)
	require.NoError(t, db.Model(&User{}).Where("id = ?", 50).Update("role", common.RoleAdminUser).Error)
	tx := db.Begin()
	require.NoError(t, tx.Error)
	defer tx.Rollback()
	now := time.Now().Unix()
	require.NoError(t, securityProtectionLock(tx, "ip:8.8.4.4", now))
	require.NoError(t, touchSecurityProtectionActivity(tx, 50, "8.8.4.4", now))
	done := make(chan error, 1)
	go func() {
		_, err := CreateSecurityProtectionBan(SecurityProtectionBanInput{SubjectType: "ip", IP: "8.8.4.4", DurationSeconds: 60, Reason: "并发复核"}, 999, "8.8.8.8")
		done <- err
	}()
	select {
	case err := <-done:
		t.Fatalf("ban must wait for the in-flight source transaction, got %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	require.NoError(t, tx.Commit().Error)
	select {
	case err := <-done:
		var invalid *SecurityProtectionValidationError
		require.ErrorAs(t, err, &invalid)
		require.Contains(t, err.Error(), "管理员")
	case <-time.After(10 * time.Second):
		t.Fatal("manual IP ban did not resume after source commit")
	}
	var n int64
	require.NoError(t, db.Model(&SecurityProtectionBan{}).Count(&n).Error)
	require.Zero(t, n)
}

func TestSecurityProtectionDatabaseFailureDoesNotAwardAndNativeBansRemain(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestUser(t, 1, 24*time.Hour)
	require.NoError(t, db.Migrator().DropTable(&SecurityProtectionPolicy{}))
	_, err := UserCheckinProtected(1, "8.8.8.8", "/api/user/checkin")
	require.Error(t, err)
	var u User
	require.NoError(t, db.First(&u, 1).Error)
	require.Zero(t, u.Quota)
	var n int64
	require.NoError(t, db.Model(&Checkin{}).Count(&n).Error)
	require.Zero(t, n)
	_, err = GetSecurityProtectionOverview()
	require.Error(t, err)
}

func TestSecurityProtectionNewZeroConsumptionAdminExitNeverAutoIPBanned(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) {
		c.AutoIPNewUserThreshold = 10
		c.AutoIPDeniedThreshold = 5
	})
	securityProtectionTestUser(t, 50, time.Second)
	require.NoError(t, db.Model(&User{}).Where("id = ?", 50).Update("role", common.RoleAdminUser).Error)
	require.NoError(t, TouchSecurityProtectionActivity(50, "8.8.8.8"))
	for uid := 1; uid <= 10; uid++ {
		securityProtectionTestUser(t, uid, time.Second)
		securityProtectionTestGuard(t, uid, "8.8.8.8")
	}
	for i := 0; i < 8; i++ {
		securityProtectionTestGuard(t, 1, "8.8.8.8")
	}
	var n int64
	require.NoError(t, db.Model(&SecurityProtectionBan{}).Where("subject_type = ?", "ip").Count(&n).Error)
	require.Zero(t, n)
}

func TestSecurityProtectionExplicitGrantAllowlistProtectsSharedExit(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestPolicy(t, func(c *operation_setting.SecurityProtectionConfig) {
		c.AutoIPNewUserThreshold = 10
		c.AutoIPDeniedThreshold = 5
		c.AllowlistUserIDs = []int{50}
	})
	securityProtectionTestUser(t, 50, time.Minute)
	require.NoError(t, TouchSecurityProtectionActivity(50, "8.8.8.8"))
	for uid := 1; uid <= 10; uid++ {
		securityProtectionTestUser(t, uid, time.Second)
		securityProtectionTestGuard(t, uid, "8.8.8.8")
	}
	for i := 0; i < 6; i++ {
		securityProtectionTestGuard(t, 1, "8.8.8.8")
	}
	var n int64
	require.NoError(t, db.Model(&SecurityProtectionBan{}).Where("subject_type = ?", "ip").Count(&n).Error)
	require.Zero(t, n)
}

func TestSecurityProtectionRetentionPreservesActionAuditAndManualBans(t *testing.T) {
	db := securityProtectionTestDB(t)
	old45 := time.Now().Add(-45 * 24 * time.Hour).Unix()
	old100 := time.Now().Add(-100 * 24 * time.Hour).Unix()
	for _, event := range []SecurityProtectionEvent{{Kind: "checkin_attempt", CreatedAt: old45}, {Kind: "automatic_action", CreatedAt: old45, RequestID: "preserve-action-90-days"}, {Kind: "automatic_action", CreatedAt: old100}} {
		require.NoError(t, db.Create(&event).Error)
	}
	require.NoError(t, db.Create(&SecurityProtectionBan{SubjectType: "ip", IP: "8.8.8.8", Scope: "ip", Source: "manual", CreatedAt: old100}).Error)
	require.NoError(t, CleanupSecurityProtectionRecords())
	var events []SecurityProtectionEvent
	require.NoError(t, db.Find(&events).Error)
	require.Len(t, events, 1)
	require.Equal(t, "preserve-action-90-days", events[0].RequestID)
	var n int64
	require.NoError(t, db.Model(&SecurityProtectionBan{}).Count(&n).Error)
	require.EqualValues(t, 1, n)
}

func TestSecurityProtectionNativeAccountStatePrecedesProtectionStoreFailure(t *testing.T) {
	db := securityProtectionTestDB(t)
	securityProtectionTestUser(t, 1, 24*time.Hour)
	securityProtectionTestUser(t, 2, 24*time.Hour)
	securityProtectionTestUser(t, 3, 24*time.Hour)
	require.NoError(t, db.Model(&User{}).Where("id = ?", 2).Update("status", common.UserStatusDisabled).Error)
	require.NoError(t, db.Delete(&User{}, 3).Error)
	require.NoError(t, db.Migrator().DropTable(&SecurityProtectionPolicy{}))
	for _, uid := range []int{2, 3, 999999} {
		d, err := SecurityProtectionAccess(uid, "8.8.8.8", "account")
		require.NoError(t, err)
		require.NotNil(t, d)
		require.False(t, d.Allowed)
		require.Equal(t, "AUTH_USER_DISABLED", d.Code)
	}
	d, err := SecurityProtectionAccess(1, "8.8.8.8", "account")
	require.Error(t, err)
	require.Nil(t, d, "normal users surface the protection storage error for the existing paid-flow degradation policy")
	_, err = UserCheckinProtected(1, "8.8.8.8", "/api/user/checkin")
	require.Error(t, err)
	var u User
	require.NoError(t, db.First(&u, 1).Error)
	require.Zero(t, u.Quota)
}
