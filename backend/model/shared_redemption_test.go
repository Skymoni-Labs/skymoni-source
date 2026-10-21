package model

import (
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestSharedRedemptionLimitsDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "postgres", "mysql"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "shared_limit_test_"}})
			require.NoError(t, err)
			raw, err := db.DB()
			require.NoError(t, err)
			if dialect == "sqlite" {
				raw.SetMaxOpenConns(1)
			} else {
				raw.SetMaxOpenConns(12)
			}
			previous, previousLog := DB, LOG_DB
			previousType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
			previousGift := common.QuotaForNewUser
			DB, LOG_DB = db, db
			common.QuotaForNewUser = 0
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			initCol()
			t.Cleanup(func() {
				DB, LOG_DB = previous, previousLog
				common.QuotaForNewUser = previousGift
				common.SetDatabaseTypes(previousType, previousLogType)
				initCol()
				raw.Close()
			})
			tables := []any{&RedemptionClaim{}, &Redemption{}, &User{}, &Log{}}
			reset := func(t *testing.T) {
				t.Helper()
				require.NoError(t, db.Migrator().DropTable(tables...))
				require.NoError(t, db.AutoMigrate(tables...))
			}
			t.Cleanup(func() { require.NoError(t, db.Migrator().DropTable(tables...)) })
			user := func(t *testing.T, n int) User {
				t.Helper()
				u := User{Username: fmt.Sprintf("shared-%d", n), AffCode: fmt.Sprintf("sh%06d", n), Password: "test-password-123", Role: common.RoleCommonUser, Status: common.UserStatusEnabled}
				require.NoError(t, db.Create(&u).Error)
				return u
			}
			code := func(t *testing.T, limit int64) Redemption {
				t.Helper()
				c := Redemption{Key: "50000000000000000000000000000001", Name: "shared welfare", Reusable: true, MaxClaims: limit, Quota: 500, Status: common.RedemptionCodeStatusEnabled}
				require.NoError(t, c.Insert())
				return c
			}
			t.Run("concurrent_distinct_accounts_do_not_exceed_limit", func(t *testing.T) {
				reset(t)
				c := code(t, 3)
				users := make([]User, 18)
				for i := range users {
					users[i] = user(t, i)
				}
				var wg sync.WaitGroup
				var successes atomic.Int64
				for _, u := range users {
					wg.Go(func() {
						if _, err := Redeem(c.Key, u.Id); err == nil {
							successes.Add(1)
						}
					})
				}
				wg.Wait()
				require.EqualValues(t, 3, successes.Load())
				require.NoError(t, db.First(&c, c.Id).Error)
				require.EqualValues(t, 3, c.ClaimedCount)
				var claims int64
				require.NoError(t, db.Model(&RedemptionClaim{}).Count(&claims).Error)
				require.EqualValues(t, 3, claims)
				var total int64
				require.NoError(t, db.Model(&User{}).Select("COALESCE(SUM(quota),0)").Scan(&total).Error)
				require.EqualValues(t, 1500, total)
				active, n, err := SearchRedemptions("", "1", 0, 30)
				require.NoError(t, err)
				require.Empty(t, active)
				require.Zero(t, n)
				full, n, err := SearchRedemptions("", "3", 0, 30)
				require.NoError(t, err)
				require.Len(t, full, 1)
				require.EqualValues(t, 1, n)
			})
			t.Run("unlimited_but_each_account_only_once", func(t *testing.T) {
				reset(t)
				c := code(t, 0)
				u := user(t, 0)
				var wg sync.WaitGroup
				var successes atomic.Int64
				for range 10 {
					wg.Go(func() {
						if _, err := Redeem(c.Key, u.Id); err == nil {
							successes.Add(1)
						}
					})
				}
				wg.Wait()
				require.EqualValues(t, 1, successes.Load())
				for i := 1; i < 8; i++ {
					other := user(t, i)
					_, err := Redeem(c.Key, other.Id)
					require.NoError(t, err)
				}
				require.NoError(t, db.First(&c, c.Id).Error)
				require.EqualValues(t, 8, c.ClaimedCount)
				_, err := Redeem(c.Key, u.Id)
				require.ErrorIs(t, err, ErrRedemptionAlreadyClaimed)
			})
			t.Run("failed_credit_rolls_back_claim_and_slot", func(t *testing.T) {
				reset(t)
				c := code(t, 1)
				u := user(t, 0)
				require.NoError(t, db.Model(&u).Update("quota", common.MaxWalletQuota).Error)
				_, err := Redeem(c.Key, u.Id)
				require.Error(t, err)
				require.NoError(t, db.First(&c, c.Id).Error)
				require.Zero(t, c.ClaimedCount)
				var n int64
				require.NoError(t, db.Model(&RedemptionClaim{}).Count(&n).Error)
				require.Zero(t, n)
				second := user(t, 1)
				_, err = Redeem(c.Key, second.Id)
				require.NoError(t, err)
				require.NoError(t, db.First(&c, c.Id).Error)
				require.EqualValues(t, 1, c.ClaimedCount)
			})
			t.Run("registration_and_wallet_share_guard_and_capacity", func(t *testing.T) {
				reset(t)
				c := code(t, 1)
				first := User{Username: "shared-registration", Password: "test-password-123", Role: common.RoleCommonUser}
				require.NoError(t, first.InsertWithRedemption(0, c.Key))
				_, err := Redeem(c.Key, first.Id)
				require.ErrorIs(t, err, ErrRedemptionAlreadyClaimed)
				second := User{Username: "registration-over-limit", Password: "test-password-123", Role: common.RoleCommonUser}
				require.Error(t, second.InsertWithRedemption(0, c.Key))
				var n int64
				require.NoError(t, db.Model(&User{}).Where("username = ?", second.Username).Count(&n).Error)
				require.Zero(t, n)
			})
			t.Run("claimed_terms_locked_but_limit_and_pause_editable", func(t *testing.T) {
				reset(t)
				c := code(t, 2)
				for i := range 2 {
					u := user(t, i)
					_, err := Redeem(c.Key, u.Id)
					require.NoError(t, err)
				}
				require.NoError(t, db.First(&c, c.Id).Error)
				bad := c
				bad.Quota++
				require.Error(t, bad.Update())
				bad = c
				bad.Reusable = false
				bad.MaxClaims = 0
				require.Error(t, bad.Update())
				bad = c
				bad.MaxClaims = 1
				require.Error(t, bad.Update())
				c.MaxClaims = 3
				c.Name = "extended welfare"
				require.NoError(t, c.Update())
				c.Status = common.RedemptionCodeStatusDisabled
				require.NoError(t, c.Update())
				u := user(t, 3)
				_, err := Redeem(c.Key, u.Id)
				require.Error(t, err)
				c.Status = common.RedemptionCodeStatusEnabled
				require.NoError(t, c.Update())
				_, err = Redeem(c.Key, u.Id)
				require.NoError(t, err)
				_, err = UpdateUnusedRedemptionQuota([]int{c.Id}, 900)
				require.Error(t, err)
				require.NoError(t, db.First(&c, c.Id).Error)
				require.Equal(t, 500, c.Quota)
				require.EqualValues(t, 3, c.ClaimedCount)
				deleted, err := DeleteInvalidRedemptions()
				require.NoError(t, err)
				require.EqualValues(t, 1, deleted)
				var claims int64
				require.NoError(t, db.Model(&RedemptionClaim{}).Count(&claims).Error)
				require.EqualValues(t, 3, claims)
			})
			t.Run("upgrade_preserves_old_codes_and_reconciles_claims", func(t *testing.T) {
				reset(t)
				c := code(t, 0)
				u := user(t, 0)
				_, err := Redeem(c.Key, u.Id)
				require.NoError(t, err)
				legacy := Redemption{Key: "50000000000000000000000000000002", Name: "old code", Quota: 200, Status: common.RedemptionCodeStatusEnabled}
				require.NoError(t, legacy.Insert())
				require.NoError(t, db.Migrator().DropColumn(&Redemption{}, "MaxClaims"))
				require.NoError(t, db.Migrator().DropColumn(&Redemption{}, "ClaimedCount"))
				for range 2 {
					require.NoError(t, db.AutoMigrate(&Redemption{}))
					require.NoError(t, BackfillRedemptionClaimCounts(db))
				}
				require.NoError(t, db.First(&c, c.Id).Error)
				require.True(t, c.Reusable)
				require.EqualValues(t, 1, c.ClaimedCount)
				require.Zero(t, c.MaxClaims)
				require.NoError(t, db.First(&legacy, legacy.Id).Error)
				require.False(t, legacy.Reusable)
				require.Zero(t, legacy.ClaimedCount)
				_, err = Redeem(legacy.Key, u.Id)
				require.NoError(t, err)
				other := user(t, 1)
				_, err = Redeem(legacy.Key, other.Id)
				require.Error(t, err)
			})
		})
	}
}
