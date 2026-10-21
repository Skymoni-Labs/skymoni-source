package model

import (
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

var (
	ErrInventoryConflict  = errors.New("库存已变化，请刷新后重试；已交付库存不能删除或重新出售，待交付库存请先交付或退款")
	ErrInventoryDuplicate = errors.New("存在重复账号或重复库存，请检查后重试；重复导入不会覆盖原库存")
	ErrInventoryInvalid   = errors.New("库存字段或操作无效；修正已交付内容时请填写原因并确认同步到买家仓库")
)

// Reasons are encrypted; neither this history nor the management audit stores credentials.
type BenefitInventoryEvent struct {
	ID          int    `gorm:"primaryKey"`
	InventoryID int    `gorm:"not null;index"`
	ActorID     int    `gorm:"not null"`
	Action      string `gorm:"type:varchar(16);not null"`
	Encrypted   string `gorm:"type:text;not null" json:"-"`
	CreatedAt   int64  `gorm:"not null"`
}

type InventoryEventView struct {
	ID        int    `json:"id"`
	ActorID   int    `json:"actorId"`
	Action    string `json:"action"`
	Reason    string `json:"reason"`
	CreatedAt int64  `json:"createdAt"`
}

type InventoryView struct {
	ID          string               `json:"id"`
	BenefitID   string               `json:"benefitId"`
	BenefitName string               `json:"benefitName"`
	Fields      []BenefitField       `json:"fields"`
	Claimed     bool                 `json:"claimed"`
	Status      string               `json:"status"`
	Revision    int64                `json:"revision"`
	CreatedAt   int64                `json:"createdAt"`
	UpdatedAt   int64                `json:"updatedAt"`
	History     []InventoryEventView `json:"history,omitempty"`
	UserID      int                  `json:"userId,omitempty"`
	OrderID     int                  `json:"orderId,omitempty"`
	ReceivedAt  int64                `json:"receivedAt,omitempty"`
}

type InventoryPage struct {
	Items  []InventoryView `json:"items"`
	Total  int             `json:"total"`
	Counts map[string]int  `json:"counts"`
}

// Account identity ignores password changes; other resources compare all values.
func benefitInventoryIdentity(fields []BenefitField, category string) string {
	if category == "account" {
		for _, f := range fields {
			if f.Kind == "text" {
				return strings.ToLower(strings.TrimSpace(f.Value))
			}
		}
	}
	values := make([]string, len(fields))
	for i, f := range fields {
		values[i] = f.Value
	}
	data, _ := common.Marshal(values)
	return string(data)
}

func benefitInventoryIdentities(tx *gorm.DB, benefitID int, category string, excludeID int) (map[string]bool, error) {
	seen := map[string]bool{}
	var rows []BenefitInventory
	err := tx.Where("benefit_id = ? AND id <> ? AND removed = ?", benefitID, excludeID, false).FindInBatches(&rows, 200, func(_ *gorm.DB, _ int) error {
		for _, r := range rows {
			var fields []BenefitField
			if err := decryptBenefit(r.Encrypted, "stock", &fields); err != nil {
				return err
			}
			seen[benefitInventoryIdentity(fields, category)] = true
		}
		return nil
	}).Error
	return seen, err
}

func inventorySummary(row BenefitInventory) InventoryView {
	view := InventoryView{ID: strconv.Itoa(row.ID), BenefitID: strconv.Itoa(row.BenefitID), Fields: []BenefitField{}, Claimed: row.Claimed, Revision: row.Revision, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, Status: "available"}
	if row.Disabled {
		view.Status = "disabled"
	}
	if row.Removed {
		view.Status = "removed"
	}
	if row.Claimed {
		view.Status = "delivered"
	}
	return view
}

func BenefitInventoryView(row BenefitInventory, detail bool) (InventoryView, error) {
	view := inventorySummary(row)
	var benefit Benefit
	if err := DB.Select("name").First(&benefit, row.BenefitID).Error; err != nil {
		return view, err
	}
	view.BenefitName = benefit.Name
	if row.Claimed {
		view.Status = "delivered"
		if DB.Migrator().HasTable(&ShopOrder{}) {
			var order ShopOrder
			if err := DB.Where("inventory_id = ? AND status <> ?", row.ID, "refunded").Order("id DESC").Limit(1).Find(&order).Error; err != nil {
				return view, err
			}
			if order.ID > 0 {
				view.OrderID, view.UserID = order.ID, order.UserID
				if order.Status == "pending" {
					view.Status = "reserved"
				}
			}
		}
		var receipt BenefitReceipt
		if err := DB.Where("inventory_id = ?", row.ID).Order("id DESC").Limit(1).Find(&receipt).Error; err != nil {
			return view, err
		}
		if receipt.ID > 0 {
			view.UserID, view.ReceivedAt = receipt.UserID, receipt.ReceivedAt
		}
	}
	if err := decryptBenefit(row.Encrypted, "stock", &view.Fields); err != nil {
		return view, err
	}
	if !detail {
		for i := range view.Fields {
			if view.Fields[i].Kind == "secret" {
				view.Fields[i].Value = ""
			}
		}
		return view, nil
	}
	var events []BenefitInventoryEvent
	if err := DB.Where("inventory_id = ?", row.ID).Order("id DESC").Limit(100).Find(&events).Error; err != nil {
		return view, err
	}
	view.History = []InventoryEventView{}
	for _, event := range events {
		var reason string
		if err := decryptBenefit(event.Encrypted, "stock-event", &reason); err != nil {
			return view, err
		}
		view.History = append(view.History, InventoryEventView{ID: event.ID, ActorID: event.ActorID, Action: event.Action, Reason: reason, CreatedAt: event.CreatedAt})
	}
	return view, nil
}

// Search only non-secret fields, in bounded batches; no plaintext search index is persisted.
func ListBenefitInventory(benefitID int, status, keyword string, offset, size int) (InventoryPage, error) {
	page := InventoryPage{Items: []InventoryView{}, Counts: map[string]int{"all": 0, "available": 0, "disabled": 0, "reserved": 0, "delivered": 0, "removed": 0}}
	if !slices.Contains([]string{"all", "available", "disabled", "reserved", "delivered", "removed"}, status) || len(keyword) > 200 {
		return page, ErrInventoryInvalid
	}
	query := DB.Model(&BenefitInventory{})
	if benefitID > 0 {
		query = query.Where("benefit_id = ?", benefitID)
	}
	var rows []BenefitInventory
	lastID := 0
	keyword = strings.ToLower(strings.TrimSpace(keyword))
	var resources []Benefit
	if err := DB.Select("id", "name").Find(&resources).Error; err != nil {
		return page, err
	}
	names := map[int]string{}
	for _, resource := range resources {
		names[resource.ID] = resource.Name
	}
	hasOrders := DB.Migrator().HasTable(&ShopOrder{})
	for {
		if err := query.Session(&gorm.Session{}).Where("id > ?", lastID).Order("id").Limit(200).Find(&rows).Error; err != nil {
			return page, err
		}
		if len(rows) == 0 {
			break
		}
		ids := make([]int, len(rows))
		for i := range rows {
			ids[i] = rows[i].ID
		}
		orders := map[int]ShopOrder{}
		if hasOrders {
			var values []ShopOrder
			if err := DB.Select("id", "inventory_id", "status", "user_id").Where("inventory_id IN ? AND status <> ?", ids, "refunded").Order("id DESC").Find(&values).Error; err != nil {
				return page, err
			}
			for _, value := range values {
				if orders[value.InventoryID].ID == 0 {
					orders[value.InventoryID] = value
				}
			}
		}
		var receipts []BenefitReceipt
		if err := DB.Select("id", "inventory_id", "user_id", "received_at").Where("inventory_id IN ?", ids).Order("id DESC").Find(&receipts).Error; err != nil {
			return page, err
		}
		owners := map[int]BenefitReceipt{}
		for _, receipt := range receipts {
			if owners[receipt.InventoryID].ID == 0 {
				owners[receipt.InventoryID] = receipt
			}
		}
		for _, row := range rows {
			lastID = row.ID
			view := inventorySummary(row)
			view.BenefitName = names[row.BenefitID]
			if row.Claimed {
				order := orders[row.ID]
				view.OrderID, view.UserID = order.ID, order.UserID
				if order.Status == "pending" {
					view.Status = "reserved"
				}
				if receipt := owners[row.ID]; receipt.ID > 0 {
					view.UserID, view.ReceivedAt = receipt.UserID, receipt.ReceivedAt
				}
			}
			if err := decryptBenefit(row.Encrypted, "stock", &view.Fields); err != nil {
				return page, err
			}
			for i := range view.Fields {
				if view.Fields[i].Kind == "secret" {
					view.Fields[i].Value = ""
				}
			}
			matches := keyword == "" || strings.Contains(strings.ToLower(view.BenefitName), keyword) || view.ID == keyword
			for _, f := range view.Fields {
				if f.Kind != "secret" && strings.Contains(strings.ToLower(f.Value), keyword) {
					matches = true
				}
			}
			if !matches {
				continue
			}
			page.Counts[view.Status]++
			if view.Status != "removed" {
				page.Counts["all"]++
			}
			if status == "all" && view.Status == "removed" || status != "all" && view.Status != status {
				continue
			}
			if page.Total >= offset && len(page.Items) < size {
				page.Items = append(page.Items, view)
			}
			page.Total++
		}
	}
	return page, nil
}

type InventoryEditRequest struct {
	Revision      int64          `json:"revision"`
	Fields        []BenefitField `json:"fields"`
	Reason        string         `json:"reason"`
	SyncDelivered bool           `json:"syncDelivered"`
}

func EditBenefitInventory(id, actorID int, request InventoryEditRequest) error {
	if request.Revision < 1 || !utf8.ValidString(request.Reason) || utf8.RuneCountInString(request.Reason) > 500 {
		return ErrInventoryInvalid
	}
	if err := validateBenefitFields(request.Fields, false); err != nil {
		return ErrInventoryInvalid
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var stock BenefitInventory
		if err := tx.First(&stock, id).Error; err != nil {
			return err
		}
		var benefit Benefit
		if err := lockForUpdate(tx).First(&benefit, stock.BenefitID).Error; err != nil {
			return err
		}
		if err := lockForUpdate(tx).First(&stock, id).Error; err != nil {
			return err
		}
		if stock.Revision != request.Revision || stock.Removed {
			return ErrInventoryConflict
		}
		if tx.Migrator().HasTable(&ShopOrder{}) {
			var pending int64
			if err := tx.Model(&ShopOrder{}).Where("inventory_id = ? AND status = ?", id, "pending").Count(&pending).Error; err != nil {
				return err
			}
			if pending > 0 {
				return ErrInventoryConflict
			}
		}
		if stock.Claimed && (!request.SyncDelivered || strings.TrimSpace(request.Reason) == "") {
			return ErrInventoryInvalid
		}
		var config BenefitConfig
		if err := decryptBenefit(benefit.Encrypted, "config", &config); err != nil {
			return err
		}
		expected := config.Fields
		if stock.Claimed {
			if err := decryptBenefit(stock.Encrypted, "stock", &expected); err != nil {
				return err
			}
		}
		if len(expected) != len(request.Fields) {
			return ErrInventoryInvalid
		}
		for i := range expected {
			if expected[i].ID != request.Fields[i].ID || expected[i].Kind != request.Fields[i].Kind {
				return ErrInventoryInvalid
			}
			request.Fields[i].Label = expected[i].Label
		}
		seen, err := benefitInventoryIdentities(tx, stock.BenefitID, config.Category, id)
		if err != nil {
			return err
		}
		if seen[benefitInventoryIdentity(request.Fields, config.Category)] {
			return ErrInventoryDuplicate
		}
		encrypted, err := encryptBenefit(request.Fields, "stock")
		if err != nil {
			return err
		}
		result := tx.Model(&stock).Where("revision = ?", request.Revision).Updates(map[string]any{"encrypted": encrypted, "revision": gorm.Expr("revision + 1"), "updated_at": time.Now().Unix()})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrInventoryConflict
		}
		if stock.Claimed {
			var receipts []BenefitReceipt
			if err := tx.Where("inventory_id = ?", id).Find(&receipts).Error; err != nil {
				return err
			}
			for _, r := range receipts {
				var snapshot BenefitConfig
				if err := decryptBenefit(r.Encrypted, "receipt", &snapshot); err != nil {
					return err
				}
				snapshot.Fields = request.Fields
				value, err := encryptBenefit(snapshot, "receipt")
				if err != nil {
					return err
				}
				if err := tx.Model(&r).Update("encrypted", value).Error; err != nil {
					return err
				}
			}
			// Keep the fulfilled order snapshot consistent; refunded orders remain historical snapshots.
			if tx.Migrator().HasTable(&ShopOrder{}) {
				var orders []ShopOrder
				if err := tx.Where("inventory_id = ? AND status = ?", id, "delivered").Find(&orders).Error; err != nil {
					return err
				}
				for _, o := range orders {
					var snapshot BenefitConfig
					if err := decryptBenefit(o.Encrypted, "shop-order", &snapshot); err != nil {
						return err
					}
					snapshot.Fields = request.Fields
					value, err := encryptBenefit(snapshot, "shop-order")
					if err != nil {
						return err
					}
					if err := tx.Model(&o).Update("encrypted", value).Error; err != nil {
						return err
					}
				}
			}
		}
		return recordInventoryEvent(tx, id, actorID, "edit", request.Reason)
	})
}

type InventoryTarget struct {
	ID       int   `json:"id"`
	Revision int64 `json:"revision"`
}
type InventoryActionRequest struct {
	Items  []InventoryTarget `json:"items"`
	Action string            `json:"action"`
	Reason string            `json:"reason"`
}

// Resource locks are acquired in a stable order, matching allocation and import.
// Every item must be current and unclaimed; a failure rolls back the entire batch.
func ManageBenefitInventory(actorID int, request InventoryActionRequest) error {
	if len(request.Items) < 1 || len(request.Items) > 100 || !slices.Contains([]string{"disable", "enable", "remove", "restore"}, request.Action) || utf8.RuneCountInString(request.Reason) > 500 || !utf8.ValidString(request.Reason) {
		return ErrInventoryInvalid
	}
	ids := make([]int, 0, len(request.Items))
	revisions := map[int]int64{}
	for _, item := range request.Items {
		if item.ID < 1 || item.Revision < 1 || revisions[item.ID] > 0 {
			return ErrInventoryInvalid
		}
		ids = append(ids, item.ID)
		revisions[item.ID] = item.Revision
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var rows []BenefitInventory
		if err := tx.Where("id IN ?", ids).Order("benefit_id,id").Find(&rows).Error; err != nil {
			return err
		}
		if len(rows) != len(ids) {
			return ErrInventoryConflict
		}
		last := 0
		for _, r := range rows {
			if r.BenefitID != last {
				var b Benefit
				if err := lockForUpdate(tx).First(&b, r.BenefitID).Error; err != nil {
					return err
				}
				last = r.BenefitID
			}
		}
		for _, previous := range rows {
			var row BenefitInventory
			if err := lockForUpdate(tx).First(&row, previous.ID).Error; err != nil {
				return err
			}
			if row.Claimed || row.Revision != revisions[row.ID] || (row.Removed && request.Action != "restore") || (!row.Removed && request.Action == "restore") {
				return ErrInventoryConflict
			}
			changes := map[string]any{"revision": gorm.Expr("revision + 1"), "updated_at": time.Now().Unix()}
			switch request.Action {
			case "disable":
				changes["disabled"] = true
			case "enable":
				changes["disabled"] = false
			case "remove":
				changes["removed"] = true
				changes["disabled"] = true
			case "restore":
				var config BenefitConfig
				var fields []BenefitField
				var b Benefit
				if err := tx.First(&b, row.BenefitID).Error; err != nil {
					return err
				}
				if err := decryptBenefit(b.Encrypted, "config", &config); err != nil {
					return err
				}
				if err := decryptBenefit(row.Encrypted, "stock", &fields); err != nil {
					return err
				}
				if len(fields) != len(config.Fields) {
					return ErrInventoryInvalid
				}
				for i := range fields {
					if fields[i].ID != config.Fields[i].ID || fields[i].Kind != config.Fields[i].Kind {
						return ErrInventoryInvalid
					}
				}
				seen, err := benefitInventoryIdentities(tx, row.BenefitID, config.Category, row.ID)
				if err != nil {
					return err
				}
				if seen[benefitInventoryIdentity(fields, config.Category)] {
					return ErrInventoryDuplicate
				}
				changes["removed"] = false
				changes["disabled"] = true // Restored items require an explicit enable before selling.
			}
			result := tx.Model(&row).Where("revision = ? AND claimed = ?", revisions[row.ID], false).Updates(changes)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrInventoryConflict
			}
			if err := recordInventoryEvent(tx, row.ID, actorID, request.Action, request.Reason); err != nil {
				return err
			}
		}
		return nil
	})
}

func recordInventoryEvent(tx *gorm.DB, id, actorID int, action, reason string) error {
	value, err := encryptBenefit(strings.TrimSpace(reason), "stock-event")
	if err != nil {
		return err
	}
	return tx.Create(&BenefitInventoryEvent{InventoryID: id, ActorID: actorID, Action: action, Encrypted: value, CreatedAt: time.Now().Unix()}).Error
}
