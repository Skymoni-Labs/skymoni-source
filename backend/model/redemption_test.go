package model

import (
	"fmt"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm/schema"
	"os"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSearchRedemptionsFiltersAndPaginates(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	})

	now := common.GetTimestamp()
	redemptions := []Redemption{
		{Id: 1, Name: "alpha-active", Key: "00000000000000000000000000000001", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: 0},
		{Id: 2, Name: "alpha-future", Key: "00000000000000000000000000000002", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now + 3600},
		{Id: 3, Name: "alpha-expired", Key: "00000000000000000000000000000003", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now - 10},
		{Id: 4, Name: "beta-disabled", Key: "00000000000000000000000000000004", Status: common.RedemptionCodeStatusDisabled, ExpiredTime: 0},
		{Id: 5, Name: "beta-used", Key: "00000000000000000000000000000005", Status: common.RedemptionCodeStatusUsed, ExpiredTime: 0},
	}
	require.NoError(t, DB.Create(&redemptions).Error)

	tests := []struct {
		name      string
		keyword   string
		status    string
		startIdx  int
		num       int
		wantTotal int64
		wantIds   []int
	}{
		{
			name:      "no filters returns all rows",
			num:       10,
			wantTotal: 5,
			wantIds:   []int{5, 4, 3, 2, 1},
		},
		{
			name:      "keyword filters by name prefix",
			keyword:   "alpha",
			num:       10,
			wantTotal: 3,
			wantIds:   []int{3, 2, 1},
		},
		{
			name:      "enabled status excludes expired rows",
			status:    "1",
			num:       10,
			wantTotal: 2,
			wantIds:   []int{2, 1},
		},
		{
			name:      "expired status returns enabled expired rows",
			status:    "expired",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{3},
		},
		{
			name:      "disabled status",
			status:    "2",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{4},
		},
		{
			name:      "used status",
			status:    "3",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{5},
		},
		{
			name:      "pagination keeps unpaged total",
			startIdx:  1,
			num:       2,
			wantTotal: 5,
			wantIds:   []int{4, 3},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows, total, err := SearchRedemptions(tt.keyword, tt.status, tt.startIdx, tt.num)
			require.NoError(t, err)
			assert.Equal(t, tt.wantTotal, total)
			gotIds := make([]int, 0, len(rows))
			for _, row := range rows {
				gotIds = append(gotIds, row.Id)
			}
			assert.Equal(t, tt.wantIds, gotIds)
		})
	}
}

func setupRedeemFixture(t *testing.T, quota int) (userId int, key string) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
		DB.Exec("DELETE FROM users")
		DB.Exec("DELETE FROM logs")
	})

	user := &User{Username: "redeem-user", Password: "password", Status: common.UserStatusEnabled, Quota: 0}
	require.NoError(t, DB.Create(user).Error)

	key = "10000000000000000000000000000001"
	redemption := &Redemption{
		Name:        "redeem-test",
		Key:         key,
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       quota,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(redemption).Error)
	return user.Id, key
}

func TestRedeemCreditsQuotaExactlyOnce(t *testing.T) {
	userId, key := setupRedeemFixture(t, 500)

	quota, err := Redeem(key, userId)
	require.NoError(t, err)
	assert.Equal(t, 500, quota)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 500, user.Quota)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "name = ?", "redeem-test").Error)
	assert.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	assert.Equal(t, userId, redemption.UsedUserId)

	// Redeeming the same code again must fail and must not credit quota.
	_, err = Redeem(key, userId)
	require.Error(t, err)
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 500, user.Quota)
}

func TestRedeemRejectsWalletOverflow(t *testing.T) {
	userId, key := setupRedeemFixture(t, 11)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", userId).Update("quota", common.MaxWalletQuota-10).Error)

	_, err := Redeem(key, userId)
	require.ErrorIs(t, err, ErrRedeemFailed)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, common.MaxWalletQuota-10, user.Quota)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "key = ?", key).Error)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, redemption.Status)
}

func TestRedemptionQuotaRejectsWalletOverflow(t *testing.T) {
	setupRedeemFixture(t, 500)

	redemption := &Redemption{
		Name:        "overflow-redemption",
		Key:         "10000000000000000000000000000002",
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       common.MaxWalletQuota + 1,
		CreatedTime: common.GetTimestamp(),
	}
	require.Error(t, redemption.Insert())
}

func TestUpdateUnusedRedemptionQuotaIsAtomicAndKeepsRedeemedCodes(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	})

	codes := []Redemption{
		{Name: "active", Key: "20000000000000000000000000000001", Status: common.RedemptionCodeStatusEnabled, Quota: 100},
		{Name: "disabled", Key: "20000000000000000000000000000002", Status: common.RedemptionCodeStatusDisabled, Quota: 100},
		{Name: "redeemed", Key: "20000000000000000000000000000003", Status: common.RedemptionCodeStatusUsed, Quota: 100, RedeemedTime: 1, UsedUserId: 7},
	}
	require.NoError(t, DB.Create(&codes).Error)

	_, err := UpdateUnusedRedemptionQuota([]int{codes[0].Id, codes[2].Id}, 250)
	require.Error(t, err)
	_, err = UpdateUnusedRedemptionQuota([]int{codes[0].Id, codes[1].Id + 10000}, 250)
	require.Error(t, err)
	_, err = UpdateUnusedRedemptionQuota([]int{codes[0].Id, codes[0].Id}, 250)
	require.Error(t, err)

	var before []Redemption
	require.NoError(t, DB.Order("id").Find(&before).Error)
	for _, code := range before {
		assert.Equal(t, 100, code.Quota)
	}

	count, err := UpdateUnusedRedemptionQuota([]int{codes[0].Id, codes[1].Id}, 250)
	require.NoError(t, err)
	assert.EqualValues(t, 2, count)
	count, err = UpdateUnusedRedemptionQuota([]int{codes[0].Id, codes[1].Id}, 250)
	require.NoError(t, err, "reapplying the same quota should succeed")
	assert.EqualValues(t, 2, count)

	var after []Redemption
	require.NoError(t, DB.Order("id").Find(&after).Error)
	assert.Equal(t, 250, after[0].Quota)
	assert.Equal(t, 250, after[1].Quota)
	assert.Equal(t, 100, after[2].Quota)
	assert.Equal(t, common.RedemptionCodeStatusUsed, after[2].Status)

	used := after[2]
	used.Status = common.RedemptionCodeStatusEnabled
	used.Quota = 250
	require.Error(t, used.Update(), "a single edit must not revive or reprice a redeemed code")
}

// Exactly one of several concurrent redeems of the same code may win, and
// quota must be credited exactly once.
func TestRedeemConcurrentSingleSuccess(t *testing.T) {
	userId, key := setupRedeemFixture(t, 300)

	const goroutines = 5
	successes := make([]bool, goroutines)
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := range goroutines {
		go func(idx int) {
			defer wg.Done()
			if _, err := Redeem(key, userId); err == nil {
				successes[idx] = true
			}
		}(i)
	}
	wg.Wait()

	successCount := 0
	for _, ok := range successes {
		if ok {
			successCount++
		}
	}
	assert.Equal(t, 1, successCount, "exactly one concurrent redeem should succeed")

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 300, user.Quota, "quota must be credited exactly once")
}

// Exercise both a fresh installation and an upgrade of the released redemption table.
func TestReusableRedemptionDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "promo_test_"}})
			require.NoError(t, err)
			raw, err := db.DB()
			require.NoError(t, err)
			if dialect == "sqlite" {
				raw.SetMaxOpenConns(1)
			} else {
				raw.SetMaxOpenConns(8)
			}
			prev, prevLog := DB, LOG_DB
			prevType, prevLogType := common.MainDatabaseType(), common.LogDatabaseType()
			prevGift := common.QuotaForNewUser
			common.QuotaForNewUser = 0
			DB, LOG_DB = db, db
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			initCol()
			t.Cleanup(func() {
				DB, LOG_DB = prev, prevLog
				common.SetDatabaseTypes(prevType, prevLogType)
				initCol()
				common.QuotaForNewUser = prevGift
				raw.Close()
			})
			var version string
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Log(version)
			for _, upgrade := range []bool{false, true} {
				t.Run(fmt.Sprintf("upgrade=%v", upgrade), func(t *testing.T) {
					tables := []any{&RedemptionClaim{}, &Redemption{}, &User{}, &Log{}}
					require.NoError(t, db.Migrator().DropTable(tables...))
					t.Cleanup(func() { require.NoError(t, db.Migrator().DropTable(tables...)) })
					require.NoError(t, db.AutoMigrate(&User{}, &Log{}, &Redemption{}))
					legacy := Redemption{Name: "legacy", Key: "20000000000000000000000000000001", Quota: 500, Status: common.RedemptionCodeStatusEnabled}
					if upgrade {
						require.NoError(t, db.Migrator().DropColumn(&Redemption{}, "Reusable"))
						require.NoError(t, db.Omit("Reusable").Create(&legacy).Error)
					}
					for range 2 {
						require.NoError(t, db.AutoMigrate(tables...))
					}
					// A released application restarts after migration; discard
					// driver prepared statements from the prior schema fixture.
					if dialect == "postgres" {
						raw.SetMaxIdleConns(0)
						raw.SetMaxIdleConns(8)
					}

					if upgrade {
						var old Redemption
						require.NoError(t, db.First(&old, legacy.Id).Error)
						require.False(t, old.Reusable)
						require.Equal(t, 500, old.Quota)
					} else {
						require.NoError(t, legacy.Insert())
					}
					promo := Redemption{Name: "shared", Key: "20000000000000000000000000000002", Quota: 2500000, Status: common.RedemptionCodeStatusEnabled, Reusable: true}
					require.NoError(t, promo.Insert())
					u := User{Username: "promo-user", Password: "test-pass-123", Role: common.RoleCommonUser}
					require.NoError(t, u.InsertWithRedemption(0, promo.Key))
					var got User
					require.NoError(t, db.First(&got, u.Id).Error)
					require.Equal(t, promo.Quota, got.Quota)
					_, err = Redeem(promo.Key, u.Id)
					require.ErrorIs(t, err, ErrRedemptionAlreadyClaimed)
					second := User{Username: "promo-second", Password: "test-pass-123", Role: common.RoleCommonUser}
					require.NoError(t, second.InsertWithRedemption(0, ""))
					require.NoError(t, db.First(&got, "id = ?", u.Id).Error)
					var wg sync.WaitGroup
					outcomes := make(chan error, 8)
					for range 8 {
						wg.Go(func() { _, e := Redeem(promo.Key, second.Id); outcomes <- e })
					}
					wg.Wait()
					close(outcomes)
					successes := 0
					for e := range outcomes {
						if e == nil {
							successes++
						}
					}
					require.Equal(t, 1, successes)
					var secondAfter User
					require.NoError(t, db.First(&secondAfter, second.Id).Error)
					require.Equal(t, promo.Quota, secondAfter.Quota)
					var claims int64
					require.NoError(t, db.Model(&RedemptionClaim{}).Count(&claims).Error)
					require.EqualValues(t, 2, claims)
					require.Error(t, db.Create(&RedemptionClaim{RedemptionId: promo.Id, UserId: u.Id, Quota: promo.Quota}).Error)
					_, err = Redeem(legacy.Key, u.Id)
					require.NoError(t, err)
					_, err = Redeem(legacy.Key, second.Id)
					require.Error(t, err)
					bad := User{Username: "invalid-promo", Password: "test-pass-123"}
					require.Error(t, bad.InsertWithRedemption(0, "invalid"))
					var n int64
					require.NoError(t, db.Model(&User{}).Where("username = ?", bad.Username).Count(&n).Error)
					require.Zero(t, n)
					for i, change := range []map[string]any{{"status": common.RedemptionCodeStatusDisabled}, {"status": common.RedemptionCodeStatusEnabled, "expired_time": common.GetTimestamp() - 1}} {
						require.NoError(t, db.Model(&promo).Updates(change).Error)
						invalid := User{Username: fmt.Sprintf("unavailable-%d", i), Password: "test-pass-123"}
						require.Error(t, invalid.InsertWithRedemption(0, promo.Key))
						require.NoError(t, db.Model(&User{}).Where("username = ?", invalid.Username).Count(&n).Error)
						require.Zero(t, n)
					}
					require.NoError(t, db.Model(&promo).Updates(map[string]any{"status": common.RedemptionCodeStatusEnabled, "expired_time": 0}).Error)
					rich := User{Username: "overflow-promo", Password: "test-pass-123"}
					require.NoError(t, rich.Insert(0))
					require.NoError(t, db.Model(&rich).Update("quota", common.MaxWalletQuota).Error)
					_, err = Redeem(promo.Key, rich.Id)
					require.Error(t, err)
					require.NoError(t, db.Model(&RedemptionClaim{}).Where("user_id = ?", rich.Id).Count(&n).Error)
					require.Zero(t, n)
					require.NoError(t, db.Model(&rich).Update("quota", 0).Error)
					_, err = Redeem(promo.Key, rich.Id)
					require.NoError(t, err)
				})
			}
		})
	}
}
