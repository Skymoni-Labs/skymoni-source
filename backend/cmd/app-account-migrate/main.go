// One-shot additive deployment migration. No HTTP or periodic workers.
package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	dsn := os.Getenv("SQL_DSN")
	if !strings.HasPrefix(dsn, "postgres://") && !strings.HasPrefix(dsn, "postgresql://") {
		os.Exit(1)
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		fmt.Fprintln(os.Stderr, "Migration database unavailable")
		os.Exit(1)
	}
	sql, err := db.DB()
	if err != nil {
		os.Exit(1)
	}
	defer sql.Close()
	if err := db.AutoMigrate(&model.AppAccountGrant{}, &model.AppAccountSession{}); err != nil {
		fmt.Fprintln(os.Stderr, "App account additive migration failed")
		os.Exit(1)
	}
	fmt.Println("App account schema ready")
}
