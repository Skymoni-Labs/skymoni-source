package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sync"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// This ledger is an administrator estimate. It never changes user/token quota.
type UpstreamWallet struct {
	ID           int     `json:"id" gorm:"primaryKey"`
	Name         string  `json:"name" gorm:"size:100;uniqueIndex"`
	Provider     string  `json:"provider" gorm:"size:40"`
	Unit         string  `json:"unit" gorm:"size:40"`
	Remaining    float64 `json:"remaining"`
	Conversion   float64 `json:"conversion"`
	Threshold    float64 `json:"threshold"`
	CalibratedAt int64   `json:"calibrated_at" gorm:"bigint"`
	StartLogID   int     `json:"-"`
	Revision     int     `json:"revision"`
	Pending      int64   `json:"pending"`
	Note         string  `json:"note" gorm:"size:500"`
}

type UpstreamWalletBinding struct {
	ChannelID int `json:"channel_id" gorm:"primaryKey"`
	WalletID  int `json:"wallet_id" gorm:"index"`
}

type UpstreamWalletEvent struct {
	ID        int     `json:"id" gorm:"primaryKey"`
	LogID     *int    `json:"log_id,omitempty" gorm:"uniqueIndex"`
	WalletID  int     `json:"wallet_id" gorm:"index:idx_wallet_events,priority:1"`
	CreatedAt int64   `json:"created_at" gorm:"index:idx_wallet_events,priority:2"`
	Kind      string  `json:"kind" gorm:"size:30"`
	Amount    float64 `json:"amount"`
	Model     string  `json:"model" gorm:"size:200"`
	ChannelID int     `json:"channel_id"`
	Note      string  `json:"note" gorm:"size:500"`
}

type UpstreamWalletSnapshot struct {
	WalletID int     `json:"wallet_id"`
	Revision int     `json:"revision"`
	Cost     float64 `json:"cost"`
	Status   string  `json:"status"`
	Note     string  `json:"note"`
}

var walletEstimator struct {
	sync.RWMutex
	fn func(*Log) *UpstreamWalletSnapshot
}

func SetUpstreamWalletEstimator(fn func(*Log) *UpstreamWalletSnapshot) {
	walletEstimator.Lock()
	walletEstimator.fn = fn
	walletEstimator.Unlock()
}

func attachUpstreamWalletSnapshot(log *Log) {
	walletEstimator.RLock()
	fn := walletEstimator.fn
	walletEstimator.RUnlock()
	if fn == nil || log == nil {
		return
	}
	snapshot := fn(log)
	if snapshot == nil {
		return
	}
	var other map[string]any
	if json.Unmarshal([]byte(log.Other), &other) != nil || other == nil {
		other = map[string]any{}
	}
	root, _ := other[logOtherRootInfoKey].(map[string]any)
	if root == nil {
		root = map[string]any{}
	}
	root["upstream_wallet_cost"] = snapshot
	other[logOtherRootInfoKey] = root
	if raw, err := json.Marshal(other); err == nil {
		log.Other = string(raw)
	}
}

func snapshotFromWalletLog(log *Log) *UpstreamWalletSnapshot {
	var payload struct {
		Root struct {
			Cost *UpstreamWalletSnapshot `json:"upstream_wallet_cost"`
		} `json:"root_info"`
	}
	if json.Unmarshal([]byte(log.Other), &payload) != nil {
		return nil
	}
	return payload.Root.Cost
}

// Idempotent insertion and balance deduction share one transaction and row lock.
// A calibration revision prevents queued old events from debiting a new baseline.
func ApplyUpstreamWalletLog(log *Log) error {
	s := snapshotFromWalletLog(log)
	if s == nil || s.WalletID <= 0 || log.Id <= 0 {
		return nil
	}
	if math.IsNaN(s.Cost) || math.IsInf(s.Cost, 0) || s.Cost < 0 {
		return errors.New("invalid upstream cost snapshot")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var wallet UpstreamWallet
		if err := lockForUpdate(tx).First(&wallet, s.WalletID).Error; err != nil {
			return err
		}
		event := UpstreamWalletEvent{LogID: &log.Id, WalletID: s.WalletID, CreatedAt: log.CreatedAt, Kind: s.Status, Amount: -s.Cost, Model: log.ModelName, ChannelID: log.ChannelId, Note: s.Note}
		if log.Id <= wallet.StartLogID || log.CreatedAt < wallet.CalibratedAt {
			event.Kind = "before_calibration"
			event.Amount = 0
		} else if s.Revision != wallet.Revision {
			event.Kind = "pending"
			event.Amount = 0
			event.Note = "请求跨过余额核验时点，扣款待核对"
		}
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&event)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil
		}
		if event.Kind == "priced" {
			return tx.Model(&wallet).Update("remaining", gorm.Expr("remaining - ?", s.Cost)).Error
		}
		if event.Kind == "pending" {
			return tx.Model(&wallet).Update("pending", gorm.Expr("pending + 1")).Error
		}
		return nil
	})
}

// Production uses the same database for usage logs and the ledger. This local
// anti-join also repairs a crash between log insertion and ledger insertion.
func RepairUpstreamWalletLogs() error {
	if DB != LOG_DB {
		return nil
	}
	var earliest int64
	if err := DB.Model(&UpstreamWallet{}).Where("calibrated_at > 0").Select("COALESCE(MIN(calibrated_at),0)").Scan(&earliest).Error; err != nil || earliest == 0 {
		return err
	}
	var logs []Log
	err := LOG_DB.Table("logs").Select("logs.*").
		Joins("JOIN upstream_wallet_bindings b ON b.channel_id = logs.channel_id").
		Joins("LEFT JOIN upstream_wallet_events e ON e.log_id = logs.id").
		Where("logs.created_at >= ? AND logs.type IN ? AND e.id IS NULL", earliest, []int{LogTypeConsume, LogTypeError, LogTypeRefund}).
		Where("logs.other LIKE ?", "%upstream_wallet_cost%").Order("logs.id ASC").Limit(500).Find(&logs).Error
	if err != nil {
		return err
	}
	for i := range logs {
		if err = ApplyUpstreamWalletLog(&logs[i]); err != nil {
			return err
		}
	}
	return nil
}

// Recharges use additive accounting and do not invalidate pending usage. Only
// a new measured baseline advances the revision and clears unknown costs.
func AdjustUpstreamWallet(id, revision int, kind string, amount float64, checkedAt int64, note string) error {
	if !finiteWalletValue(amount) || (kind == "recharge" && amount <= 0) || (kind != "recharge" && kind != "calibrate") {
		return errors.New("invalid wallet adjustment")
	}
	var maxLogID int
	if kind == "calibrate" {
		if err := LOG_DB.Model(&Log{}).Select("COALESCE(MAX(id),0)").Scan(&maxLogID).Error; err != nil {
			return err
		}
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var wallet UpstreamWallet
		if err := lockForUpdate(tx).First(&wallet, id).Error; err != nil {
			return err
		}
		if wallet.Revision != revision {
			return errors.New("余额已更新，请刷新后重试")
		}
		updates := map[string]any{}
		delta := amount
		if kind == "calibrate" {
			delta = amount - wallet.Remaining
			updates = map[string]any{"remaining": amount, "calibrated_at": checkedAt, "start_log_id": maxLogID, "revision": wallet.Revision + 1, "pending": 0}
		} else {
			updates["remaining"] = gorm.Expr("remaining + ?", amount)
		}
		if err := tx.Model(&wallet).Updates(updates).Error; err != nil {
			return err
		}
		event := UpstreamWalletEvent{WalletID: id, CreatedAt: time.Now().Unix(), Kind: kind, Amount: delta, Note: note}
		return tx.Create(&event).Error
	})
}

func finiteWalletValue(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 && v <= 1e12
}

func SaveUpstreamWallet(wallet *UpstreamWallet, channels []int) error {
	if wallet.ID != 0 || wallet.Name == "" || len(wallet.Name) > 100 || len(wallet.Note) > 500 || !finiteWalletValue(wallet.Remaining) || !finiteWalletValue(wallet.Conversion) || wallet.Conversion == 0 || !finiteWalletValue(wallet.Threshold) {
		return errors.New("invalid wallet configuration")
	}
	if len(channels) == 0 || len(channels) > 3000 {
		return errors.New("请选择该上游账户对应的渠道")
	}
	var count int64
	if err := DB.Model(&Channel{}).Where("id IN ?", channels).Count(&count).Error; err != nil {
		return err
	}
	if int(count) != len(channels) {
		return errors.New("渠道不存在或重复")
	}
	if err := LOG_DB.Model(&Log{}).Select("COALESCE(MAX(id),0)").Scan(&wallet.StartLogID).Error; err != nil {
		return err
	}
	wallet.Revision = 1
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(wallet).Error; err != nil {
			return err
		}
		for _, id := range channels {
			if err := tx.Create(&UpstreamWalletBinding{ChannelID: id, WalletID: wallet.ID}).Error; err != nil {
				return fmt.Errorf("渠道 %d 已绑定账户或无法保存", id)
			}
		}
		return nil
	})
}
