package model

import (
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	kitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestDistinctUpstreamRetryDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var driver gorm.Dialector
			switch dialect {
			case "sqlite":
				driver = sqlite.Open(":memory:")
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN not configured")
				}
				driver = mysql.Open(dsn)
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
				driver = postgres.Open(dsn)
			}
			db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "retry_test_"}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			previousDB, previousType, previousCache := DB, common.MainDatabaseType(), common.MemoryCacheEnabled
			DB = db
			common.SetMainDatabaseType(common.DatabaseType(dialect))
			initCol()
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&Ability{}, &Channel{}))
				DB = previousDB
				common.SetMainDatabaseType(previousType)
				initCol()
				common.MemoryCacheEnabled = true
				InitChannelCache()
				common.MemoryCacheEnabled = previousCache
				require.NoError(t, sqlDB.Close())
			})
			require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}))
			versionQuery := "SELECT version()"
			if dialect == "sqlite" {
				versionQuery = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
			t.Logf("database version: %s", version)
			for _, ch := range []Channel{
				{Id: 1, Name: "first", Models: "retry-model", Group: "default", Status: common.ChannelStatusEnabled},
				{Id: 2, Name: "second", Models: "retry-model", Group: "default", Status: common.ChannelStatusEnabled},
				{Id: 3, Name: "other-group", Models: "retry-model", Group: "private", Status: common.ChannelStatusEnabled},
				{Id: 4, Name: "multi", Models: "multi-model", Group: "default", Status: common.ChannelStatusEnabled, ChannelInfo: ChannelInfo{IsMultiKey: true}},
			} {
				require.NoError(t, ch.Insert())
			}

			discount := Channel{Id: 5, Name: "discount", Models: "gpt-6-sol-token,gpt-6.1-sol-token,gpt-5.5-token,gpt-6-sol-token-pro,gpt-6.1-sol-token-pro,gpt-image-2-moni-codex,codex-auto-review-token", Group: "metered," + OfficialGPTGroup, Status: common.ChannelStatusEnabled}
			require.NoError(t, discount.Insert())
			devin := Channel{Id: 6, Name: "pending-devin", Type: constant.ChannelTypeDevinGateway, Key: "fixture", Models: "devin-test-model", Group: "default", Status: common.ChannelStatusManuallyDisabled}
			require.NoError(t, devin.Insert())
			for iteration := range 2 {
				if iteration == 1 {
					// Simulate a catalog sync regenerating abilities.
					require.NoError(t, discount.UpdateAbilities(nil))
				}
				common.MemoryCacheEnabled = true
				InitChannelCache()
				for _, cached := range []bool{true, false} {
					common.MemoryCacheEnabled = cached
					pending, err := GetRandomSatisfiedChannel("default", "devin-test-model", 0, nil)
					require.NoError(t, err)
					require.Nil(t, pending, "new Devin accounts remain unavailable until the operator enables them")
					for _, name := range discount.GetModels() {
						found, err := GetRandomSatisfiedChannel(OfficialGPTGroup, name, 0, nil)
						require.NoError(t, err)
						if BusinessGroupSupportsModel(OfficialGPTGroup, name) {
							require.NotNil(t, found)
						} else {
							require.Nil(t, found)
						}
						ordinary, err := GetRandomSatisfiedChannel("metered", name, 0, nil)
						require.NoError(t, err)
						require.NotNil(t, ordinary, "existing keys retain access")
					}
				}
			}
			t.Cleanup(func() {
				for _, id := range []int{1, 2, 4} {
					ClearChannelCooldown(id)
				}
			})
			common.MemoryCacheEnabled = true
			InitChannelCache()
			for _, cached := range []bool{true, false} {
				common.MemoryCacheEnabled = cached
				first, err := GetRandomSatisfiedChannel("default", "retry-model", 0, nil)
				require.NoError(t, err)
				require.NotNil(t, first)
				filters := []dto.ChannelFilter{{Kind: dto.FilterAttemptedChannels, AttemptedChannelIDs: []string{strconv.Itoa(first.Id)}}}
				second, err := GetRandomSatisfiedChannel("default", "retry-model", 1, filters)
				require.NoError(t, err)
				require.NotNil(t, second)
				assert.NotEqual(t, first.Id, second.Id)
				assert.Contains(t, []int{1, 2}, second.Id)
				filters[0].AttemptedChannelIDs = append(filters[0].AttemptedChannelIDs, strconv.Itoa(second.Id))
				exhausted, err := GetRandomSatisfiedChannel("default", "retry-model", 2, filters)
				require.NoError(t, err)
				assert.Nil(t, exhausted, "must not retry failed single-key channels or cross group boundaries")
				multi, err := GetRandomSatisfiedChannel("default", "multi-model", 1, []dto.ChannelFilter{{Kind: dto.FilterAttemptedChannels, AttemptedChannelIDs: []string{"4"}}})
				require.NoError(t, err)
				require.NotNil(t, multi, "multi-key channels must retain internal key rotation")
				assert.Equal(t, 4, multi.Id)
				RecordChannelCooldown(first.Id, 30*time.Second)
				alternative, err := GetRandomSatisfiedChannel("default", "retry-model", 0, nil)
				require.NoError(t, err)
				require.NotNil(t, alternative)
				assert.NotEqual(t, first.Id, alternative.Id, "a rate-limited channel must be skipped across requests")
				RecordChannelCooldown(alternative.Id, 30*time.Second)
				_, err = GetRandomSatisfiedChannel("default", "retry-model", 0, nil)
				var cooling *ChannelCoolingDownError
				require.ErrorAs(t, err, &cooling)
				assert.Greater(t, cooling.RetryAfter, time.Duration(0))
				ClearChannelCooldown(first.Id)
				ClearChannelCooldown(alternative.Id)
				RecordChannelCooldown(4, 30*time.Second)
				_, err = GetRandomSatisfiedChannel("default", "multi-model", 0, nil)
				require.ErrorAs(t, err, &cooling, "a multi-key channel still respects a channel-level 429 cooldown")
				ClearChannelCooldown(4)
			}
		})
	}
}

func TestFilterCandidateIDs(t *testing.T) {
	alphaSetting := `{"task_plugin_key":"alpha"}`
	betaSetting := `{"task_plugin_key":"beta"}`
	alpha := &Channel{Id: 900001, Type: constant.ChannelTypeTaskPlugin, Status: common.ChannelStatusEnabled, Setting: &alphaSetting}
	beta := &Channel{Id: 900002, Type: constant.ChannelTypeTaskPlugin, Status: common.ChannelStatusEnabled, Setting: &betaSetting}
	ordinary := &Channel{Id: 900003, Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled}
	kling := &Channel{Id: 900004, Type: constant.ChannelTypeKling, Status: common.ChannelStatusEnabled}
	jimeng := &Channel{Id: 900005, Type: constant.ChannelTypeJimeng, Status: common.ChannelStatusEnabled}
	matchingCustom := &Channel{Id: 900010, Type: constant.ChannelTypeAdvancedCustom, Status: common.ChannelStatusEnabled}
	matchingCustom.SetOtherSettings(kitdto.ChannelOtherSettings{
		AdvancedCustom: &kitdto.AdvancedCustomConfig{
			Routes: []kitdto.AdvancedCustomRoute{{
				IncomingPath: "/v1/chat/completions",
				Models:       []string{"gpt-4"},
			}},
		},
	})
	otherCustom := &Channel{Id: 900011, Type: constant.ChannelTypeAdvancedCustom, Status: common.ChannelStatusEnabled}
	otherCustom.SetOtherSettings(kitdto.ChannelOtherSettings{
		AdvancedCustom: &kitdto.AdvancedCustomConfig{
			Routes: []kitdto.AdvancedCustomRoute{{
				IncomingPath: "/v1/responses",
				Models:       []string{"gpt-4"},
			}},
		},
	})

	pathFilter := dto.ChannelFilter{Kind: dto.FilterRequestPath, RequestPath: "/v1/chat/completions"}
	emptyPathFilter := dto.ChannelFilter{Kind: dto.FilterRequestPath, RequestPath: ""}

	tests := []struct {
		name      string
		ids       []int
		modelName string
		filters   []dto.ChannelFilter
		wantKept  []int
		wantEmpty dto.ChannelFilterKind
	}{
		{
			name:      "identity keeps matching type-59 key",
			ids:       []int{900001, 900002},
			modelName: "shared",
			filters:   identityFilters("alpha", nil),
			wantKept:  []int{900001},
		},
		{
			name:      "identity empty key drops all type-59",
			ids:       []int{900001, 900002},
			modelName: "shared",
			filters:   identityFilters("", nil),
			wantKept:  []int{},
			wantEmpty: dto.FilterTaskPluginIdentity,
		},
		{
			name:      "identity empty key keeps ordinary channel",
			ids:       []int{900003},
			modelName: "ordinary",
			filters:   identityFilters("", nil),
			wantKept:  []int{900003},
		},
		{
			name:      "identity keeps matching legacy type",
			ids:       []int{900004, 900005},
			modelName: "legacy",
			filters:   identityFilters("legacy-alpha", []int{constant.ChannelTypeKling}),
			wantKept:  []int{900004},
		},
		{
			name:      "identity keeps all listed legacy types",
			ids:       []int{900004, 900005},
			modelName: "legacy",
			filters:   identityFilters("legacy-alpha", []int{constant.ChannelTypeKling, constant.ChannelTypeJimeng}),
			wantKept:  []int{900004, 900005},
		},
		{
			name:      "identity keyed with no types drops legacy",
			ids:       []int{900004, 900005},
			modelName: "legacy",
			filters:   identityFilters("legacy-alpha", nil),
			wantKept:  []int{},
			wantEmpty: dto.FilterTaskPluginIdentity,
		},
		{
			name:      "identity drops missing cache entry",
			ids:       []int{900004, 999999},
			modelName: "legacy",
			filters:   identityFilters("legacy-alpha", []int{constant.ChannelTypeKling}),
			wantKept:  []int{900004},
		},
		{
			name:      "empty request path is a passthrough including missing ids",
			ids:       []int{900003, 900010, 999999},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{emptyPathFilter},
			wantKept:  []int{900003, 900010, 999999},
		},
		{
			name:      "request path keeps missing cache entry for consistency",
			ids:       []int{900003, 999999},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{pathFilter},
			wantKept:  []int{900003, 999999},
		},
		{
			name:      "request path keeps matching type-58 and ordinary",
			ids:       []int{900003, 900010, 900011},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{pathFilter},
			wantKept:  []int{900003, 900010},
		},
		{
			name:      "request path empties when only unmatched type-58 remains",
			ids:       []int{900011},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{pathFilter},
			wantKept:  []int{},
			wantEmpty: dto.FilterRequestPath,
		},
		{
			name:      "intersection attributes empty set to identity after path keeps candidates",
			ids:       []int{900001, 900010},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{pathFilter, identityFilters("missing", nil)[0]},
			wantKept:  []int{},
			wantEmpty: dto.FilterTaskPluginIdentity,
		},
		{
			name:      "intersection attributes empty set to path when path runs first",
			ids:       []int{900011},
			modelName: "gpt-4",
			filters:   []dto.ChannelFilter{identityFilters("", nil)[0], pathFilter},
			wantKept:  []int{},
			wantEmpty: dto.FilterRequestPath,
		},
	}

	channelSyncLock.Lock()
	previous := channelsIDM
	channelsIDM = map[int]*Channel{
		900001: alpha,
		900002: beta,
		900003: ordinary,
		900004: kling,
		900005: jimeng,
		900010: matchingCustom,
		900011: otherCustom,
	}
	t.Cleanup(func() {
		channelsIDM = previous
		channelSyncLock.Unlock()
	})

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			kept, emptiedBy := filterCandidateIDs(testCase.ids, testCase.modelName, testCase.filters)
			if testCase.wantKept == nil {
				assert.Nil(t, kept)
			} else {
				assert.Equal(t, testCase.wantKept, kept)
			}
			assert.Equal(t, testCase.wantEmpty, emptiedBy)
		})
	}
}

func TestChannelSatisfiesFilters(t *testing.T) {
	alphaSetting := `{"task_plugin_key":"alpha"}`
	alpha := &Channel{Id: 1, Type: constant.ChannelTypeTaskPlugin, Setting: &alphaSetting}
	ordinary := &Channel{Id: 2, Type: constant.ChannelTypeOpenAI}
	custom := &Channel{Id: 3, Type: constant.ChannelTypeAdvancedCustom}
	custom.SetOtherSettings(kitdto.ChannelOtherSettings{
		AdvancedCustom: &kitdto.AdvancedCustomConfig{
			Routes: []kitdto.AdvancedCustomRoute{{
				IncomingPath: "/v1/chat/completions",
				Models:       []string{"gpt-4"},
			}},
		},
	})

	ok, kind := ChannelSatisfiesFilters(nil, "gpt-4", nil)
	assert.False(t, ok)
	assert.Equal(t, dto.ChannelFilterKind(""), kind)

	ok, kind = ChannelSatisfiesFilters(alpha, "shared", identityFilters("alpha", nil))
	require.True(t, ok)
	assert.Equal(t, dto.ChannelFilterKind(""), kind)

	ok, kind = ChannelSatisfiesFilters(alpha, "shared", identityFilters("beta", nil))
	assert.False(t, ok)
	assert.Equal(t, dto.FilterTaskPluginIdentity, kind)

	ok, kind = ChannelSatisfiesFilters(ordinary, "gpt-4", []dto.ChannelFilter{{
		Kind:        dto.FilterRequestPath,
		RequestPath: "/v1/chat/completions",
	}})
	require.True(t, ok)
	assert.Equal(t, dto.ChannelFilterKind(""), kind)

	ok, kind = ChannelSatisfiesFilters(custom, "gpt-4", []dto.ChannelFilter{{
		Kind:        dto.FilterRequestPath,
		RequestPath: "/v1/responses",
	}})
	assert.False(t, ok)
	assert.Equal(t, dto.FilterRequestPath, kind)
}
