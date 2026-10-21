package model

import (
	"errors"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestRoutingModelGroupsDatabaseMatrix(t *testing.T) {
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
			db, err := gorm.Open(driver, &gorm.Config{})
			require.NoError(t, err)
			previous, oldMemory := DB, common.MemoryCacheEnabled
			oldRatios, oldUsable := ratio_setting.GroupRatio2JSONString(), setting.UserUsableGroups2JSONString()
			oldChannelGroups, oldChannels, oldAdvanced := group2model2channels, channelsIDM, channel2advancedCustomConfig
			oldMain, oldLog := common.MainDatabaseType(), common.LogDatabaseType()
			common.OptionMapRWMutex.Lock()
			oldOptions := common.OptionMap
			common.OptionMap = map[string]string{"GroupRatio": `{"default":1,"legacy":2}`, "UserUsableGroups": `{"default":"Default","legacy":"Legacy"}`, RoutingModelGroupsKey: `{}`}
			common.OptionMapRWMutex.Unlock()
			oldGroups := routingModelGroups.Load()
			routingModelGroups.Store(map[string][]string{})
			DB = db
			common.MemoryCacheEnabled = false
			common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
			initCol()
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&Ability{}, &Channel{}, &Option{}))
				DB, common.MemoryCacheEnabled = previous, oldMemory
				common.SetDatabaseTypes(oldMain, oldLog)
				initCol()
				common.OptionMapRWMutex.Lock()
				common.OptionMap = oldOptions
				common.OptionMapRWMutex.Unlock()
				routingModelGroups.Store(oldGroups)
				require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(oldRatios))
				require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(oldUsable))
				channelSyncLock.Lock()
				group2model2channels, channelsIDM, channel2advancedCustomConfig = oldChannelGroups, oldChannels, oldAdvanced
				channelSyncLock.Unlock()
				sqlDB, _ := db.DB()
				_ = sqlDB.Close()
			})
			var version string
			query := "SELECT version()"
			if dialect == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Log(version)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&Option{}, &Channel{}, &Ability{}))
			}
			channels := []Channel{
				{Name: "mixed", Key: "private-fixture", Models: "deepseek,gpt", Group: "default,legacy", Status: 1},
				{Name: "other", Key: "other-private-fixture", Models: "deepseek", Group: "default", Status: 1},
				{Name: "disabled", Key: "disabled-private-fixture", Models: "gpt", Group: "default", Status: 2},
			}
			for i := range channels {
				require.NoError(t, db.Create(&channels[i]).Error)
				require.NoError(t, channels[i].AddAbilities(nil))
			}
			save := func(change RoutingModelGroupChange) error {
				options, err := routingGroupOptions(db)
				require.NoError(t, err)
				change.ExpectedVersion = routingGroupsVersion(options)
				return SaveRoutingModelGroup(change)
			}
			t.Run("selected models create an independent group without changing channel credentials or memberships", func(t *testing.T) {
				ratio := 1.0
				require.NoError(t, save(RoutingModelGroupChange{Mode: "create", Name: "only-deepseek", Models: []string{"deepseek"}, Ratio: &ratio, Selectable: true, Description: "DeepSeek"}))
				found, err := GetChannel("only-deepseek", "deepseek", 0, nil)
				require.NoError(t, err)
				require.NotNil(t, found)
				forbidden, err := GetChannel("only-deepseek", "gpt", 0, nil)
				require.NoError(t, err)
				require.Nil(t, forbidden)
				var current Channel
				require.NoError(t, db.First(&current, channels[0].Id).Error)
				require.Equal(t, channels[0].Group, current.Group)
				require.Equal(t, channels[0].Key, current.Key)
				catalog, err := GetRoutingModelGroupCatalog()
				require.NoError(t, err)
				require.Contains(t, catalog.Models, "gpt")
				abilities, err := GetAllEnableAbilityWithChannels()
				require.NoError(t, err)
				count := 0
				for _, ability := range abilities {
					if ability.Group == "only-deepseek" {
						count++
						require.Equal(t, "deepseek", ability.Model)
					}
				}
				require.Equal(t, 2, count)
				require.True(t, IsChannelEnabledForGroupModel("only-deepseek", "deepseek", channels[0].Id))
				require.False(t, IsChannelEnabledForGroupModel("only-deepseek", "gpt", channels[0].Id))
			})
			t.Run("cached routes follow channel disable and re-enable without changing group members", func(t *testing.T) {
				common.MemoryCacheEnabled = true
				InitChannelCache()
				found, err := GetRandomSatisfiedChannel("only-deepseek", "deepseek", 0, nil)
				require.NoError(t, err)
				require.NotNil(t, found)
				CacheUpdateChannelStatus(channels[0].Id, 2)
				CacheUpdateChannelStatus(channels[1].Id, 2)
				found, err = GetRandomSatisfiedChannel("only-deepseek", "deepseek", 0, nil)
				require.NoError(t, err)
				require.Nil(t, found)
				CacheUpdateChannelStatus(channels[0].Id, 1)
				found, err = GetRandomSatisfiedChannel("only-deepseek", "deepseek", 0, nil)
				require.NoError(t, err)
				require.NotNil(t, found)
				require.Equal(t, channels[0].Id, found.Id)
				common.MemoryCacheEnabled = false
			})
			t.Run("merge keeps existing models and deduplicates repeated selections", func(t *testing.T) {
				require.NoError(t, save(RoutingModelGroupChange{Mode: "merge", Name: "only-deepseek", Models: []string{"gpt", "gpt"}}))
				require.NoError(t, save(RoutingModelGroupChange{Mode: "merge", Name: "only-deepseek", Models: []string{"gpt"}}))
				models, managed := RoutingModelGroupModels("only-deepseek")
				require.True(t, managed)
				require.Equal(t, []string{"deepseek", "gpt"}, models)
			})
			t.Run("replacing members immediately blocks removed models in both cache modes", func(t *testing.T) {
				require.NoError(t, save(RoutingModelGroupChange{Mode: "replace", Name: "only-deepseek", Models: []string{"deepseek"}}))
				for _, enabled := range []bool{false, true} {
					common.MemoryCacheEnabled = enabled
					// A stale cache must still deny a model removed from the group.
					forbidden, err := GetRandomSatisfiedChannel("only-deepseek", "gpt", 0, nil)
					require.NoError(t, err)
					require.Nil(t, forbidden)
				}
				common.MemoryCacheEnabled = false
			})
			t.Run("a failed option write rolls back both memberships and pricing metadata", func(t *testing.T) {
				options, err := routingGroupOptions(db)
				require.NoError(t, err)
				require.NoError(t, db.Callback().Update().Before("gorm:update").Register("reject_model_group_fixture", func(tx *gorm.DB) {
					if tx.Statement.Table == "options" {
						tx.AddError(errors.New("fixture write failure"))
					}
				}))
				ratio := 1.0
				require.Error(t, save(RoutingModelGroupChange{Name: "failed-group", Mode: "create", Models: []string{"deepseek"}, Ratio: &ratio, Selectable: true}))
				require.NoError(t, db.Callback().Update().Remove("reject_model_group_fixture"))
				after, err := routingGroupOptions(db)
				require.NoError(t, err)
				require.Equal(t, options, after)
				_, exists := RoutingModelGroupModels("failed-group")
				require.False(t, exists)
			})
			t.Run("adopting an existing group preserves its current models and multiplier", func(t *testing.T) {
				require.NoError(t, save(RoutingModelGroupChange{Mode: "merge", Name: "legacy", Models: []string{"deepseek"}}))
				models, managed := RoutingModelGroupModels("legacy")
				require.True(t, managed)
				require.Equal(t, []string{"deepseek", "gpt"}, models)
				options, err := routingGroupOptions(db)
				require.NoError(t, err)
				require.Contains(t, options["GroupRatio"], `"legacy":2`)
			})
			t.Run("stale versions and unknown model names leave all group settings unchanged", func(t *testing.T) {
				options, err := routingGroupOptions(db)
				require.NoError(t, err)
				require.ErrorIs(t, SaveRoutingModelGroup(RoutingModelGroupChange{Name: "legacy", Mode: "merge", Models: []string{"deepseek"}, ExpectedVersion: "stale"}), ErrRoutingModelGroupConflict)
				require.Error(t, save(RoutingModelGroupChange{Name: "legacy", Mode: "merge", Models: []string{"unknown"}}))
				after, err := routingGroupOptions(db)
				require.NoError(t, err)
				require.Equal(t, options, after)
			})
			t.Run("an empty explicit group never falls back to legacy channel membership", func(t *testing.T) {
				require.NoError(t, save(RoutingModelGroupChange{Name: "legacy", Mode: "replace", Models: []string{}}))
				found, err := GetChannel("legacy", "deepseek", 0, nil)
				require.NoError(t, err)
				require.Nil(t, found)
				found, err = GetChannel("default", "gpt", 0, nil)
				require.NoError(t, err)
				require.NotNil(t, found)
			})
			for range 2 {
				require.NoError(t, db.AutoMigrate(&Option{}, &Channel{}, &Ability{}))
			}
		})
	}
}
