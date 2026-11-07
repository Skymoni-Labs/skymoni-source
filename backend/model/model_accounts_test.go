package model

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func modelAccountTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}, &UpstreamWallet{}, &UpstreamWalletBinding{}))
	previous := DB
	previousType := common.MainDatabaseType()
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() { DB = previous; common.SetMainDatabaseType(previousType); _ = sqlDB.Close() })
	priority, weight := int64(300), uint(7)
	mapping := `{"flash-s":"gpt-sol","other":"gpt-terra"}`
	for _, channel := range []Channel{
		{Id: 1, Key: "private-key", Name: "First", Models: "flash-s,other,flash-s", ModelMapping: &mapping, Group: "default,deepseek", Status: 1, Priority: &priority, Weight: &weight},
		{Id: 2, Key: "another-key", Name: "Disabled", Models: "flash-s", Group: "default", Status: 2, Priority: &priority, Weight: &weight},
		{Id: 3, Key: "private-name", Name: "private-name", Models: "flash-s-low", Group: "default", Status: 1, Priority: &priority, Weight: &weight},
	} {
		require.NoError(t, db.Create(&channel).Error)
		for _, alias := range modelAccountValues(channel.Models) {
			for _, group := range modelAccountValues(channel.Group) {
				require.NoError(t, db.Create(&Ability{ChannelId: channel.Id, Model: alias, Group: group, Enabled: channel.Status == 1, Priority: &priority, Weight: weight}).Error)
			}
		}
	}
	require.NoError(t, db.Create(&UpstreamWallet{ID: 10, Name: "Oranexa example", Provider: "oranexa", Note: "private-note", Remaining: 987.65, Unit: "CNY", CalibratedAt: 1000, Pending: 2}).Error)
	require.NoError(t, db.Create(&[]UpstreamWalletBinding{{ChannelID: 1, WalletID: 10}, {ChannelID: 2, WalletID: 10}}).Error)
	return db
}

func accountPreview(t *testing.T) ModelAccount {
	t.Helper()
	models, err := GetModelAccounts()
	require.NoError(t, err)
	for _, item := range models {
		if item.Model == "flash-s" {
			require.Len(t, item.Accounts, 1)
			return item.Accounts[0]
		}
	}
	t.Fatal("model missing")
	return ModelAccount{}
}

func TestModelAccountsGroupsExactAliasesAndRedactsCredentials(t *testing.T) {
	modelAccountTestDB(t)
	models, err := GetModelAccounts()
	require.NoError(t, err)
	require.Len(t, models, 3)
	account := accountPreview(t)
	require.Len(t, account.Channels, 2, "duplicate aliases are deduplicated and flash-s-low is excluded")
	require.Equal(t, 1, account.Enabled)
	require.NotNil(t, account.Remaining)
	require.Equal(t, 987.65, *account.Remaining)
	require.Equal(t, "CNY", account.Unit)
	require.EqualValues(t, 2, account.Pending)
	require.Equal(t, "gpt-sol", account.Channels[0].UpstreamModel)
	require.Equal(t, []string{"flash-s", "other"}, account.Channels[0].Models)
	encoded, err := json.Marshal(models)
	require.NoError(t, err)
	for _, secret := range []string{"private-key", "another-key", "private-name", "private-note", "header_override", "base_url"} {
		require.NotContains(t, string(encoded), secret)
	}
	require.Equal(t, 0, models[1].Accounts[0].ID)
	require.Nil(t, models[1].Accounts[0].Remaining)
}

func TestModelAccountPriorityUpdatesAllAbilitiesAndPreservesState(t *testing.T) {
	db := modelAccountTestDB(t)
	account := accountPreview(t)
	var before []Channel
	require.NoError(t, db.Order("id").Find(&before).Error)
	priority := int64(400)
	changes, err := UpdateModelAccountPriority(ModelAccountPriorityRequest{Model: "flash-s", AccountID: 10, Version: account.Version, Priority: &priority})
	require.NoError(t, err)
	require.Len(t, changes, 2)
	var after []Channel
	require.NoError(t, db.Order("id").Find(&after).Error)
	for i := range before {
		if i < 2 {
			require.Equal(t, priority, after[i].GetPriority())
			before[i].Priority = &priority
		}
		require.Equal(t, before[i], after[i], "only priority may change")
	}
	var abilities []Ability
	require.NoError(t, db.Order("channel_id").Find(&abilities).Error)
	for _, ability := range abilities {
		if ability.ChannelId < 3 {
			require.Equal(t, priority, *ability.Priority, "shared other-model abilities must agree")
		}
		require.Equal(t, ability.ChannelId != 2, ability.Enabled)
		require.Equal(t, uint(7), ability.Weight)
	}
	_, err = UpdateModelAccountPriority(ModelAccountPriorityRequest{Model: "flash-s", AccountID: 10, Version: account.Version, Priority: &priority})
	require.ErrorIs(t, err, ErrModelAccountChanged, "old previews cannot be replayed")
}

func TestModelAccountPriorityRejectsChangedMembership(t *testing.T) {
	db := modelAccountTestDB(t)
	account := accountPreview(t)
	require.NoError(t, db.Where("channel_id = ?", 2).Delete(&UpstreamWalletBinding{}).Error)
	priority := int64(400)
	_, err := UpdateModelAccountPriority(ModelAccountPriorityRequest{Model: "flash-s", AccountID: 10, Version: account.Version, Priority: &priority})
	require.ErrorIs(t, err, ErrModelAccountChanged)
	var channel Channel
	require.NoError(t, db.First(&channel, 1).Error)
	require.Equal(t, int64(300), channel.GetPriority())
}

func TestModelAccountPriorityRollsBackWhenAbilityWriteFails(t *testing.T) {
	db := modelAccountTestDB(t)
	account := accountPreview(t)
	require.NoError(t, db.Exec(`CREATE TRIGGER fail_priority BEFORE UPDATE ON abilities BEGIN SELECT RAISE(ABORT, 'test failure'); END`).Error)
	priority := int64(0)
	_, err := UpdateModelAccountPriority(ModelAccountPriorityRequest{Model: "flash-s", AccountID: 10, Version: account.Version, Priority: &priority})
	require.Error(t, err)
	require.Equal(t, account.Version, accountPreview(t).Version, "channel updates must roll back with abilities")
}

func TestModelAccountPriorityValidation(t *testing.T) {
	modelAccountTestDB(t)
	account := accountPreview(t)
	for _, request := range []ModelAccountPriorityRequest{
		{Model: "flash-s", AccountID: 10, Version: account.Version},
		{Model: "flash-s", AccountID: 0, Version: account.Version, Priority: new(int64)},
	} {
		_, err := UpdateModelAccountPriority(request)
		require.ErrorIs(t, err, ErrModelAccountPriority)
	}
}

func TestModelAccountPriorityAcceptsUnchangedAndZeroPriority(t *testing.T) {
	modelAccountTestDB(t)
	for _, priority := range []int64{300, 0, -900} {
		account := accountPreview(t)
		changes, err := UpdateModelAccountPriority(ModelAccountPriorityRequest{Model: "flash-s", AccountID: 10, Version: account.Version, Priority: &priority})
		require.NoError(t, err)
		require.Len(t, changes, 2)
		require.Equal(t, priority, accountPreview(t).Channels[0].Priority)
	}
}

func TestModelAccountPriorityRejectsRoutingChangesButIgnoresUsage(t *testing.T) {
	db := modelAccountTestDB(t)
	account := accountPreview(t)
	require.NoError(t, db.Model(&Channel{}).Where("id = ?", 1).Update("used_quota", 1234).Error)
	require.Equal(t, account.Version, accountPreview(t).Version, "normal traffic must not invalidate a preview")
	require.NoError(t, db.Model(&UpstreamWallet{}).Where("id = ?", 10).Update("remaining", 0).Error)
	require.Equal(t, account.Version, accountPreview(t).Version, "balance updates must not invalidate a priority confirmation")
	require.Zero(t, *accountPreview(t).Remaining, "known zero balance must remain distinct from unknown")
	require.NoError(t, db.Model(&Channel{}).Where("id = ?", 1).Update("models", "flash-s,other,new-shared-model").Error)
	priority := int64(400)
	_, err := UpdateModelAccountPriority(ModelAccountPriorityRequest{Model: "flash-s", AccountID: 10, Version: account.Version, Priority: &priority})
	require.ErrorIs(t, err, ErrModelAccountChanged, "new shared aliases require a fresh confirmation")
}
