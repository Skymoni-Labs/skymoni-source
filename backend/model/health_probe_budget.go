package model

import (
	"errors"
	"strconv"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const HealthProbeDailyLimit = 300

type HealthProbeBudget struct {
	Limit    int   `json:"limit"`
	Used     int   `json:"used"`
	ResetsAt int64 `json:"resets_at"`
}

func healthProbeBudgetDay(now int64) (string, int64) {
	local := time.Unix(now, 0).In(time.FixedZone("Asia/Shanghai", 8*3600))
	next := time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, local.Location())
	return "SkymoniHealthProbeBudget:" + local.Format("2006-01-02"), next.Unix()
}

func ReadHealthProbeBudget(now int64) (HealthProbeBudget, error) {
	key, reset := healthProbeBudgetDay(now)
	budget := HealthProbeBudget{Limit: HealthProbeDailyLimit, ResetsAt: reset}
	var option Option
	err := DB.Where("key = ?", key).First(&option).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return budget, nil
	}
	if err != nil {
		return budget, err
	}
	budget.Used, err = strconv.Atoi(option.Value)
	return budget, err
}

// Reserve before contacting an upstream. Ambiguous failures retain their
// reservation, so restarts and concurrent workers cannot exceed the cap.
func ReserveHealthProbe(now int64) (bool, error) {
	key, _ := healthProbeBudgetDay(now)
	reserved := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: key, Value: "0"}).Error; err != nil {
			return err
		}
		var option Option
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("key = ?", key).First(&option).Error; err != nil {
			return err
		}
		used, err := strconv.Atoi(option.Value)
		if err != nil {
			return err
		}
		if used >= HealthProbeDailyLimit {
			return nil
		}
		if err := tx.Model(&Option{}).Where("key = ?", key).Update("value", strconv.Itoa(used+1)).Error; err != nil {
			return err
		}
		reserved = true
		return nil
	})
	return reserved, err
}
