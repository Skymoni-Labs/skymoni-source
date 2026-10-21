package model

import (
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestMergeChannelGroup(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) { testMergeChannelGroup(t, dialect) })
	}
}

func testMergeChannelGroup(t *testing.T, dialect string) {
	var driver gorm.Dialector
	switch dialect {
	case "sqlite":
		driver = sqlite.Open(":memory:")
	case "mysql":
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("TEST_MYSQL_DSN is not configured")
		}
		driver = mysql.Open(dsn)
	case "postgres":
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("TEST_POSTGRES_DSN is not configured")
		}
		driver = postgres.Open(dsn)
	}
	db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "batch_merge_test_"}})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	previousDB, previousType := DB, common.MainDatabaseType()
	DB = db
	common.SetMainDatabaseType(common.DatabaseType(dialect))
	initCol()
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(&Ability{}, &Channel{}))
		DB = previousDB
		common.SetMainDatabaseType(previousType)
		initCol()
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}))
	versionQuery := "SELECT version()"
	if dialect == "sqlite" {
		versionQuery = "SELECT sqlite_version()"
	}
	var version string
	require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
	t.Logf("%s version: %s", dialect, version)
	weight, priority, tag := uint(7), int64(3), "keep-tag"
	channels := []Channel{
		{Id: 1, Key: "never-overwrite", Group: "default,vip", Models: "deepseek-chat,deepseek-reasoner", Status: 1, Weight: &weight, Priority: &priority, Tag: &tag, UsedQuota: 123},
		{Id: 2, Key: "disabled-key", Group: "default", Models: "deepseek-chat", Status: 2},
		{Id: 3, Key: "untouched-key", Group: "default", Models: "gpt-test", Status: 1},
	}
	for _, channel := range channels {
		require.NoError(t, db.Create(&channel).Error)
		require.NoError(t, channel.AddAbilities(db))
	}

	t.Run("append and preserve metadata and disabled status", func(t *testing.T) {
		changed, err := MergeChannelGroup([]int{2, 1, 1}, "deepseek")
		require.NoError(t, err)
		require.Equal(t, 2, changed)
		var channel Channel
		require.NoError(t, db.First(&channel, 1).Error)
		require.Equal(t, "default,vip,deepseek", channel.Group)
		require.Equal(t, "never-overwrite", channel.Key)
		require.EqualValues(t, 123, channel.UsedQuota)
		var abilities []Ability
		require.NoError(t, db.Where("channel_id = ? AND "+commonGroupCol+" = ?", 1, "deepseek").Find(&abilities).Error)
		require.Len(t, abilities, 2)
		for _, ability := range abilities {
			require.True(t, ability.Enabled)
			require.Equal(t, &priority, ability.Priority)
			require.Equal(t, weight, ability.Weight)
			require.Equal(t, &tag, ability.Tag)
		}
		var disabled Ability
		require.NoError(t, db.Where("channel_id = ? AND "+commonGroupCol+" = ?", 2, "deepseek").First(&disabled).Error)
		require.False(t, disabled.Enabled)
		require.NoError(t, db.First(&channel, 1).Error)
		var untouched Channel
		require.NoError(t, db.First(&untouched, 3).Error)
		require.Equal(t, "default", untouched.Group)
	})
	t.Run("repeat is a no-op", func(t *testing.T) {
		changed, err := MergeChannelGroup([]int{1, 2}, "deepseek")
		require.NoError(t, err)
		require.Zero(t, changed)
		var count int64
		require.NoError(t, db.Model(&Ability{}).Where("channel_id = ?", 1).Count(&count).Error)
		require.EqualValues(t, 6, count)
	})
	t.Run("missing channel rejects entire batch", func(t *testing.T) {
		_, err := MergeChannelGroup([]int{3, 99999}, "new-group")
		require.Error(t, err)
		var channel Channel
		require.NoError(t, db.First(&channel, 3).Error)
		require.Equal(t, "default", channel.Group)
	})
	t.Run("routing write failure rolls back memberships and abilities", func(t *testing.T) {
		require.NoError(t, db.Callback().Create().Before("gorm:create").Register("test:reject_ability", func(tx *gorm.DB) {
			if tx.Statement.Table == "batch_merge_test_abilities" {
				tx.AddError(errors.New("fixture ability failure"))
			}
		}))
		defer db.Callback().Create().Remove("test:reject_ability")
		changed, err := MergeChannelGroup([]int{1, 3}, "rollback-group")
		require.Error(t, err)
		require.Zero(t, changed)
		var channel Channel
		require.NoError(t, db.First(&channel, 1).Error)
		require.Equal(t, "default,vip,deepseek", channel.Group)
		var count int64
		require.NoError(t, db.Model(&Ability{}).Where("channel_id = ?", 1).Count(&count).Error)
		require.EqualValues(t, 6, count)
	})
	t.Run("group length limit is atomic", func(t *testing.T) {
		_, err := MergeChannelGroup([]int{1}, strings.Repeat("x", 64))
		require.Error(t, err)
		var channel Channel
		require.NoError(t, db.First(&channel, 1).Error)
		require.Equal(t, "default,vip,deepseek", channel.Group)
	})
	t.Run("reserved business group still restricts models", func(t *testing.T) {
		_, err := MergeChannelGroup([]int{3}, OfficialGPTGroup)
		require.NoError(t, err)
		var count int64
		require.NoError(t, db.Model(&Ability{}).Where("channel_id = ? AND "+commonGroupCol+" = ?", 3, OfficialGPTGroup).Count(&count).Error)
		require.Zero(t, count)
	})
}
