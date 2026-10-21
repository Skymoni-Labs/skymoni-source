package model

import (
	"fmt"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupUserModelGroupTestDB(t *testing.T) (*gorm.DB, int, int) {
	t.Helper()
	previousDB := DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "model-groups.db")), &gorm.Config{})
	require.NoError(t, err)
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	DB = db
	// Start from the released schema containing users but no private groups.
	require.NoError(t, db.AutoMigrate(&User{}))
	owner := &User{Username: "model-group-owner", Password: "placeholder", AffCode: "model-group-owner"}
	other := &User{Username: "model-group-other", Password: "placeholder", AffCode: "model-group-other"}
	require.NoError(t, db.Create(owner).Error)
	require.NoError(t, db.Create(other).Error)
	require.NoError(t, db.AutoMigrate(&UserModelGroup{}))
	require.NoError(t, db.AutoMigrate(&UserModelGroup{}))
	t.Cleanup(func() {
		DB = previousDB
		common.SetDatabaseTypes(previousMain, previousLog)
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})
	return db, owner.Id, other.Id
}

func TestUserModelGroupCRUDOwnershipAndMigration(t *testing.T) {
	db, ownerID, otherID := setupUserModelGroupTestDB(t)
	created, err := CreateUserModelGroup(ownerID, "常用模型", []string{"gpt-5.6-sol", "jev"})
	require.NoError(t, err)
	require.Positive(t, created.Id)
	groups, err := GetUserModelGroups(ownerID)
	require.NoError(t, err)
	require.Len(t, groups, 1)
	names, err := groups[0].GetModelNames()
	require.NoError(t, err)
	require.Equal(t, []string{"gpt-5.6-sol", "jev"}, names)
	otherGroups, err := GetUserModelGroups(otherID)
	require.NoError(t, err)
	require.Empty(t, otherGroups)

	_, err = UpdateUserModelGroup(otherID, created.Id, "stolen", nil)
	require.ErrorIs(t, err, ErrUserModelGroupNotFound)
	require.ErrorIs(t, DeleteUserModelGroup(otherID, created.Id), ErrUserModelGroupNotFound)
	_, err = CreateUserModelGroup(ownerID, " 常用模型 ", nil)
	require.ErrorIs(t, err, ErrUserModelGroupExists)

	updated, err := UpdateUserModelGroup(ownerID, created.Id, "写代码", []string{"gpt-5.6-sol"})
	require.NoError(t, err)
	require.Equal(t, "写代码", updated.Name)
	names, err = updated.GetModelNames()
	require.NoError(t, err)
	require.Equal(t, []string{"gpt-5.6-sol"}, names)

	// Re-running the migration preserves rows and the owner/name uniqueness rule.
	require.NoError(t, db.AutoMigrate(&UserModelGroup{}))
	require.NoError(t, db.AutoMigrate(&UserModelGroup{}))
	groups, err = GetUserModelGroups(ownerID)
	require.NoError(t, err)
	require.Len(t, groups, 1)
	require.Equal(t, "写代码", groups[0].Name)
	require.NoError(t, DeleteUserModelGroup(ownerID, created.Id))
	require.ErrorIs(t, DeleteUserModelGroup(ownerID, created.Id), ErrUserModelGroupNotFound)
	groups, err = GetUserModelGroups(ownerID)
	require.NoError(t, err)
	require.Empty(t, groups)
}

func TestUserModelGroupLimitAndDatabaseUniqueness(t *testing.T) {
	db, ownerID, _ := setupUserModelGroupTestDB(t)
	for i := range MaxUserModelGroups {
		_, err := CreateUserModelGroup(ownerID, fmt.Sprintf("group-%d", i), nil)
		require.NoError(t, err)
	}
	_, err := CreateUserModelGroup(ownerID, "extra", nil)
	require.ErrorIs(t, err, ErrUserModelGroupLimit)
	// The composite index protects against concurrent or non-controller writes.
	duplicate := &UserModelGroup{UserId: ownerID, Name: "duplicate", NormalizedName: "group-0", ModelNames: "[]"}
	require.Error(t, db.Create(duplicate).Error)
}
