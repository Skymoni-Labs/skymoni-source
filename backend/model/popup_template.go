package model

import (
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"gorm.io/gorm"
)

// Templates are authored content, never deliverable notices. Applying one copies
// its content so later edits or deletion cannot change a published popup.
type PopupTemplate struct {
	ID        int                `json:"id" gorm:"primaryKey"`
	Name      string             `json:"name" gorm:"type:varchar(100);not null"`
	Title     string             `json:"title" gorm:"type:varchar(200);not null"`
	Content   PopupNoticeContent `json:"content" gorm:"not null"`
	Format    string             `json:"format" gorm:"type:varchar(16);not null"`
	Revision  int64              `json:"revision" gorm:"bigint;not null"`
	CreatedAt int64              `json:"created_at" gorm:"bigint;not null"`
	UpdatedAt int64              `json:"updated_at" gorm:"bigint;not null;index"`
	CreatedBy int                `json:"created_by" gorm:"not null"`
}

var ErrPopupTemplateNotFound = errors.New("popup template not found")
var ErrPopupTemplateConflict = errors.New("popup template version changed")

func ValidatePopupTemplate(item *PopupTemplate) error {
	item.Name = strings.TrimSpace(item.Name)
	if item.Name == "" || utf8.RuneCountInString(item.Name) > 100 || strings.IndexFunc(item.Name, unicode.IsControl) >= 0 || !utf8.ValidString(item.Name) {
		return errors.New("模板名称须为 1–100 个字符，且不能含控制字符")
	}
	if item.Format == "" {
		item.Format = "auto"
	}
	notice := PopupNotice{Title: item.Title, Content: item.Content, Format: item.Format, Audience: "all_users", Status: "draft", Frequency: "once"}
	if err := ValidatePopupNotice(&notice); err != nil {
		return err
	}
	item.Title = notice.Title
	return nil
}

func ListPopupTemplates(keyword string, offset, limit int) ([]PopupTemplate, int64, error) {
	query := DB.Model(&PopupTemplate{})
	if keyword != "" {
		query = query.Where("name LIKE ? OR title LIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]PopupTemplate, 0)
	err := query.Order("updated_at DESC, id DESC").Offset(offset).Limit(limit).Find(&items).Error
	return items, total, err
}

func CreatePopupTemplate(item *PopupTemplate, creatorID int) error {
	if err := ValidatePopupTemplate(item); err != nil {
		return err
	}
	item.ID, item.Revision, item.CreatedBy = 0, 1, creatorID
	item.CreatedAt = time.Now().Unix()
	item.UpdatedAt = item.CreatedAt
	return DB.Create(item).Error
}

func UpdatePopupTemplate(id int, item PopupTemplate) (*PopupTemplate, error) {
	if err := ValidatePopupTemplate(&item); err != nil {
		return nil, err
	}
	var stored PopupTemplate
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&stored, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPopupTemplateNotFound
			}
			return err
		}
		if item.Revision != stored.Revision {
			return ErrPopupTemplateConflict
		}
		result := tx.Model(&PopupTemplate{}).Where("id = ? AND revision = ?", id, item.Revision).Updates(map[string]any{
			"name": item.Name, "title": item.Title, "content": item.Content, "format": item.Format,
			"revision": stored.Revision + 1, "updated_at": time.Now().Unix(),
		})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrPopupTemplateConflict
		}
		return tx.First(&stored, id).Error
	})
	return &stored, err
}

func DeletePopupTemplate(id int, revision int64) error {
	result := DB.Where("id = ? AND revision = ?", id, revision).Delete(&PopupTemplate{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrPopupTemplateConflict
	}
	return nil
}
