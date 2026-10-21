package model

import (
	"os"
	"path/filepath"
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

func TestPlaygroundConversationOwnershipRevisionAndLimit(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			testPlaygroundConversationOwnershipRevisionAndLimit(t, dialect)
		})
	}
}

func testPlaygroundConversationOwnershipRevisionAndLimit(t *testing.T, dialect string) {
	previousDB := DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	var driver gorm.Dialector
	switch dialect {
	case "sqlite":
		driver = sqlite.Open(filepath.Join(t.TempDir(), "playground.db"))
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
	db, err := gorm.Open(driver, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "playground_test_"}})
	require.NoError(t, err)
	common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
	DB = db
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(&PlaygroundConversation{}, &User{}))
		DB = previousDB
		common.SetDatabaseTypes(previousMain, previousLog)
		sqlDB, err := db.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})
	// A preexisting user table receives the new conversation table on upgrade.
	require.NoError(t, db.AutoMigrate(&User{}))
	require.NoError(t, db.AutoMigrate(&PlaygroundConversation{}))
	require.NoError(t, db.AutoMigrate(&PlaygroundConversation{}))
	columns, err := db.Migrator().ColumnTypes(&PlaygroundConversation{})
	require.NoError(t, err)
	for _, column := range columns {
		if column.Name() == "messages" {
			if dialect == "mysql" {
				require.Equal(t, "longtext", strings.ToLower(column.DatabaseTypeName()))
			} else {
				require.Equal(t, "text", strings.ToLower(column.DatabaseTypeName()))
			}
		}
	}
	owner := &User{Username: "playground-owner", Password: "placeholder", AffCode: "playground-owner"}
	other := &User{Username: "playground-other", Password: "placeholder", AffCode: "playground-other"}
	require.NoError(t, db.Create(owner).Error)
	require.NoError(t, db.Create(other).Error)

	created, err := CreatePlaygroundConversation(owner.Id, "First question", "test-model", "default", `[]`)
	require.NoError(t, err)
	require.Equal(t, int64(1), created.Revision)
	_, err = GetPlaygroundConversation(other.Id, created.Id)
	require.ErrorIs(t, err, ErrPlaygroundConversationNotFound)
	_, err = UpdatePlaygroundConversation(other.Id, created.Id, 1, "test-model", "default", `[]`)
	require.ErrorIs(t, err, ErrPlaygroundConversationNotFound)
	_, err = RenamePlaygroundConversation(other.Id, created.Id, "stolen")
	require.ErrorIs(t, err, ErrPlaygroundConversationNotFound)
	require.ErrorIs(t, DeletePlaygroundConversation(other.Id, created.Id), ErrPlaygroundConversationNotFound)

	updated, err := UpdatePlaygroundConversation(owner.Id, created.Id, 1, "second-model", "default", `[]`)
	require.NoError(t, err)
	require.Equal(t, int64(2), updated.Revision)
	_, err = UpdatePlaygroundConversation(owner.Id, created.Id, 1, "stale", "default", `[]`)
	require.ErrorIs(t, err, ErrPlaygroundConversationConflict)
	listed, err := ListPlaygroundConversations(owner.Id)
	require.NoError(t, err)
	require.Len(t, listed, 1)
	require.Equal(t, "", string(listed[0].Messages), "listing should not load message bodies")
	otherList, err := ListPlaygroundConversations(other.Id)
	require.NoError(t, err)
	require.Empty(t, otherList)

	for i := 1; i < MaxPlaygroundConversations; i++ {
		_, err = CreatePlaygroundConversation(owner.Id, "Another chat", "test-model", "default", `[]`)
		require.NoError(t, err)
	}
	_, err = CreatePlaygroundConversation(owner.Id, "Too many", "test-model", "default", `[]`)
	require.ErrorIs(t, err, ErrPlaygroundConversationLimit)
	require.NoError(t, DeletePlaygroundConversation(owner.Id, created.Id))
	_, err = CreatePlaygroundConversation(owner.Id, "Replacement", "test-model", "default", `[]`)
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&PlaygroundConversation{}))
	conversations, err := ListPlaygroundConversations(owner.Id)
	require.NoError(t, err)
	require.Len(t, conversations, MaxPlaygroundConversations)
}
