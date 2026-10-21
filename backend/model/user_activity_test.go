package model

import (
	"context"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestUserActivity(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				if os.Getenv("TEST_MYSQL_DSN") == "" {
					t.Skip("TEST_MYSQL_DSN is not configured")
				}
				driver = mysql.Open(os.Getenv("TEST_MYSQL_DSN"))
			case "postgres":
				if os.Getenv("TEST_POSTGRES_DSN") == "" {
					t.Skip("TEST_POSTGRES_DSN is not configured")
				}
				driver = postgres.Open(os.Getenv("TEST_POSTGRES_DSN"))
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "activity_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			previousDB, previousType, previousRedis := DB, common.MainDatabaseType(), common.RedisEnabled
			DB, common.RedisEnabled = db, false
			common.SetMainDatabaseType(common.DatabaseType(dialect))
			initCol()
			userActivity.pending = make(map[int]int64)
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&UserSession{}, &Token{}, &User{}))
				DB, common.RedisEnabled = previousDB, previousRedis
				common.SetMainDatabaseType(previousType)
				initCol()
				userActivity.pending = make(map[int]int64)
				require.NoError(t, sqlDB.Close())
			})
			versionQuery := "SELECT version()"
			if dialect == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("%s version: %s", dialect, version)

			// Fresh schema and repeated startup retain the same column and defaults.
			for range 2 {
				require.NoError(t, db.AutoMigrate(&User{}, &UserSession{}, &Token{}))
				require.NoError(t, InitializeUserActivity())
			}
			require.True(t, db.Migrator().HasColumn(&User{}, "last_active_at"))
			// The released schema is identical except for this added column.
			require.NoError(t, db.Migrator().DropColumn(&User{}, "last_active_at"))
			for _, row := range []map[string]any{
				{"id": 1, "username": "activity-used", "password": "retained-hash", "aff_code": "activity1", "status": 1, "last_login_at": 100, "created_at": 50, "quota": 123},
				{"id": 2, "username": "activity-never-used", "password": "retained-hash", "aff_code": "activity2", "status": 1, "last_login_at": 0, "created_at": 50},
			} {
				require.NoError(t, db.Model(&User{}).Create(row).Error)
			}
			require.NoError(t, db.Create(&UserSession{SID: "activity-history", UserID: 1, LastActiveAt: 200, CreatedAt: 100, RefreshHash: "synthetic", ExpiresAt: 500}).Error)
			require.NoError(t, db.Create(&UserSession{SID: "failed-issue", UserID: 2, LastActiveAt: 999, CreatedAt: 999, RefreshHash: "synthetic2", ExpiresAt: 1000, RevokedReason: "token_issue_failed"}).Error)
			require.NoError(t, db.Create(&Token{UserId: 1, Key: "activity-used-key", CreatedTime: 100, AccessedTime: 300}).Error)
			require.NoError(t, db.Create(&Token{UserId: 2, Key: "activity-unused-key", CreatedTime: 400, AccessedTime: 400}).Error)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&User{}, &UserSession{}, &Token{}))
				require.NoError(t, InitializeUserActivity())
			}
			var used, unused User
			require.NoError(t, db.First(&used, 1).Error)
			require.NoError(t, db.First(&unused, 2).Error)
			assert.EqualValues(t, 300, used.LastActiveAt)
			assert.EqualValues(t, 100, used.LastLoginAt)
			assert.Equal(t, "retained-hash", used.Password)
			assert.EqualValues(t, 123, used.Quota)
			assert.Zero(t, unused.LastActiveAt, "key creation / failed login must not fabricate usage")
			duplicateErr := db.Create(&User{Id: 3, Username: used.Username, Password: "synthetic", AffCode: "duplicate-aff"}).Error
			require.Error(t, duplicateErr, "upgrade retains username uniqueness")
			assert.Contains(t, duplicateErr.Error(), "username")

			writes := 0
			require.NoError(t, db.Callback().Update().Before("gorm:update").Register("activity-count-updates", func(*gorm.DB) { writes++ }))
			queueUserActivity(1, 600)
			queueUserActivity(1, 700)
			queueUserActivity(1, 650)
			queueUserActivity(-1, 900)
			queueUserActivity(2, 0)
			assert.Zero(t, writes, "requests do not perform synchronous database writes")
			require.NoError(t, FlushUserActivity(context.Background()))
			assert.Equal(t, 1, writes, "requests from the same user are merged")
			require.NoError(t, db.First(&used, 1).Error)
			assert.EqualValues(t, 700, used.LastActiveAt)
			queueUserActivity(1, 500)
			require.NoError(t, FlushUserActivity(context.Background()))
			require.NoError(t, db.First(&used, 1).Error)
			assert.EqualValues(t, 700, used.LastActiveAt, "late writes from another instance cannot move time backwards")
			queueUserActivity(1, 800)
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			require.Error(t, FlushUserActivity(ctx))
			require.NoError(t, FlushUserActivity(context.Background()))
			require.NoError(t, db.First(&used, 1).Error)
			assert.EqualValues(t, 800, used.LastActiveAt, "failed writes retry without losing observations")

			stale := used
			queueUserActivity(1, 900)
			require.NoError(t, FlushUserActivity(context.Background()))
			stale.DisplayName = "updated name"
			require.NoError(t, stale.Update(false))
			require.NoError(t, InitializeUserActivity())
			users, _, err := GetAllUsers(&common.PageInfo{Page: 1, PageSize: 10}, NewUserSortOptions("id", "asc"))
			require.NoError(t, err)
			require.Len(t, users, 2)
			assert.EqualValues(t, 900, users[0].LastActiveAt)
			assert.EqualValues(t, 100, users[0].LastLoginAt)
			assert.Empty(t, users[0].Password)
			assert.Zero(t, users[1].LastActiveAt)
			stop := StartUserActivityRecorder()
			queueUserActivity(1, 1000)
			stop()
			stop()
			require.NoError(t, db.First(&used, 1).Error)
			assert.EqualValues(t, 1000, used.LastActiveAt, "graceful shutdown persists the final activity without waiting for a timer")
		})
	}
}
