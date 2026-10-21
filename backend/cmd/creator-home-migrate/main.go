// Additive PostgreSQL migration for a release candidate that runs as a slave.
// Run after a verified database backup; ordinary master startup also registers
// these models. This tool does not migrate unrelated tables or start workers.
package main

import (
	"fmt"
	"os"

	"github.com/QuantumNous/new-api/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func main() {
	dsn := os.Getenv("SQL_DSN")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "SQL_DSN is required")
		os.Exit(1)
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		fmt.Fprintln(os.Stderr, "Database connection failed")
		os.Exit(1)
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		return tx.AutoMigrate(&model.CreatorHomeCard{}, &model.CreatorHomeOrder{}, &model.CreatorHomeConfig{}, &model.CreatorHomeAuthor{})
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "Creator homepage migration failed")
		os.Exit(1)
	}
	fmt.Println("Four creator homepage tables migrated successfully.")
}
