// One-shot additive deployment migration. It never starts HTTP/relay/workers.
package main

import (
	"fmt"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"os"
	"strings"
)

func main() {
	dsn := os.Getenv("SQL_DSN")
	if !strings.HasPrefix(dsn, "postgres://") && !strings.HasPrefix(dsn, "postgresql://") {
		fmt.Fprintln(os.Stderr, "PostgreSQL SQL_DSN required")
		os.Exit(1)
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		fmt.Fprintln(os.Stderr, "Could not open migration database")
		os.Exit(1)
	}
	sql, err := db.DB()
	if err != nil {
		os.Exit(1)
	}
	defer sql.Close()
	if err := db.AutoMigrate(&model.AppBetaAccount{}, &model.AppBetaLedger{}, &model.AppBetaCharge{}, &model.AppBetaDevice{}, &model.AppBetaChallenge{}, &model.AppBetaNonce{}); err != nil {
		fmt.Fprintln(os.Stderr, "App beta schema migration failed")
		os.Exit(1)
	}
	fmt.Println("App beta schema ready")
}
