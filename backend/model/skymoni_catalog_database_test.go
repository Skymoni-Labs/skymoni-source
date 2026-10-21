package model

import (
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestSkymoniCatalogDatabaseMatrix(t *testing.T) {
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
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "catalog_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			previous := DB
			previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
			DB = db
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&UserModelGroup{}, &UpstreamMonitorState{}, &User{}, &Ability{}, &Channel{}))
				DB = previous
				common.SetDatabaseTypes(previousMain, previousLog)
				require.NoError(t, sqlDB.Close())
			})
			var version string
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Log(version)
			// Upgrade the released users schema, then repeat startup migrations.
			require.NoError(t, db.AutoMigrate(&User{}))
			user := &User{Username: "catalog-owner", Password: "fixture", AffCode: "catalog-owner"}
			require.NoError(t, db.Create(user).Error)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&UserModelGroup{}, &UpstreamMonitorState{}))
			}
			group, err := CreateUserModelGroup(user.Id, "常用模型", []string{"gpt-5.5"})
			require.NoError(t, err)
			_, err = CreateUserModelGroup(user.Id, "常用模型", nil)
			require.ErrorIs(t, err, ErrUserModelGroupExists)
			require.ErrorIs(t, DeleteUserModelGroup(user.Id+1, group.Id), ErrUserModelGroupNotFound)
			_, err = UpdateUserModelGroup(user.Id, group.Id, "编程", []string{"gpt-5.6"})
			require.NoError(t, err)
			now := time.Now().UTC().Truncate(time.Second)
			_, err = SaveUpstreamMonitorState("matrix", "[]", "[]", false, now)
			require.NoError(t, err)
			_, err = SaveUpstreamMonitorState("matrix", `[{"name":"new"}]`, `[{"name":"new"}]`, true, now.Add(time.Second))
			require.NoError(t, err)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&UserModelGroup{}, &UpstreamMonitorState{}))
			}
			groups, err := GetUserModelGroups(user.Id)
			require.NoError(t, err)
			require.Len(t, groups, 1)
			require.Equal(t, "编程", groups[0].Name)
			state, err := GetUpstreamMonitorState("matrix")
			require.NoError(t, err)
			require.Equal(t, now.Add(time.Second).Unix(), state.PriceChangedAt)
			require.Error(t, db.Create(&UserModelGroup{UserId: user.Id, Name: "duplicate", NormalizedName: "编程", ModelNames: "[]"}).Error)
			require.NoError(t, DeleteUserModelGroup(user.Id, group.Id))
			for range 2 {
				require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}))
			}
			base := "https://example.com"
			channel := &Channel{Name: "sync-fixture", Key: "private-fixture", Status: 1, Models: "old", Group: "default,metered", BaseURL: &base}
			require.NoError(t, db.Create(channel).Error)
			require.NoError(t, channel.UpdateAbilities(nil))
			require.NoError(t, UpdateUpstreamChannelModels(channel, "old,new", `{"new":"upstream-new"}`))
			var current Channel
			require.NoError(t, db.First(&current, channel.Id).Error)
			require.Equal(t, channel.Key, current.Key)
			require.Equal(t, "old,new", current.Models)
			var count int64
			require.NoError(t, db.Model(&Ability{}).Where("channel_id = ?", channel.Id).Count(&count).Error)
			require.EqualValues(t, 4, count)
			require.Error(t, UpdateUpstreamChannelModels(channel, "stale", "{}"))
			require.NoError(t, db.Model(&current).Update("status", 2).Error)
			require.Error(t, UpdateUpstreamChannelModels(&current, "disabled", "{}"))
			require.NoError(t, db.First(&current, channel.Id).Error)
			require.Equal(t, "old,new", current.Models)
		})
	}
}
