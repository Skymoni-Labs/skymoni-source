package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

const MaxPlaygroundConversations = 50

var (
	ErrPlaygroundConversationNotFound = errors.New("playground conversation not found")
	ErrPlaygroundConversationLimit    = errors.New("playground conversation limit reached")
	ErrPlaygroundConversationConflict = errors.New("playground conversation changed")
)

type PlaygroundMessageJSON string

func (PlaygroundMessageJSON) GormDBDataType(db *gorm.DB, _ *schema.Field) string {
	if db.Dialector.Name() == "mysql" {
		return "LONGTEXT"
	}
	return "TEXT"
}

// PlaygroundConversation belongs to one user. Messages are stored as JSON in
// the primary database so chats follow the account across devices.
type PlaygroundConversation struct {
	Id        int                   `json:"id" gorm:"primaryKey"`
	UserId    int                   `json:"-" gorm:"not null;index:idx_playground_user_updated,priority:1"`
	Title     string                `json:"title" gorm:"type:varchar(200);not null"`
	Model     string                `json:"model" gorm:"type:varchar(200);not null"`
	Group     string                `json:"group" gorm:"type:varchar(100);not null"`
	Messages  PlaygroundMessageJSON `json:"-" gorm:"not null"`
	Revision  int64                 `json:"revision" gorm:"not null;default:1"`
	CreatedAt int64                 `json:"created_at" gorm:"bigint;not null"`
	UpdatedAt int64                 `json:"updated_at" gorm:"bigint;not null;index:idx_playground_user_updated,priority:2"`
}

func ListPlaygroundConversations(userID int) ([]PlaygroundConversation, error) {
	var conversations []PlaygroundConversation
	err := DB.Model(&PlaygroundConversation{}).
		Select("id", "title", "model", "group", "revision", "created_at", "updated_at").
		Where("user_id = ?", userID).
		Order("updated_at desc, id desc").
		Limit(MaxPlaygroundConversations).
		Find(&conversations).Error
	return conversations, err
}

func GetPlaygroundConversation(userID, id int) (*PlaygroundConversation, error) {
	var conversation PlaygroundConversation
	err := DB.Where("user_id = ? AND id = ?", userID, id).First(&conversation).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPlaygroundConversationNotFound
	}
	if err != nil {
		return nil, err
	}
	return &conversation, nil
}

func CreatePlaygroundConversation(userID int, title, modelName, group, messages string) (*PlaygroundConversation, error) {
	now := time.Now().Unix()
	conversation := &PlaygroundConversation{
		UserId: userID, Title: title, Model: modelName, Group: group,
		Messages: PlaygroundMessageJSON(messages), Revision: 1, CreatedAt: now, UpdatedAt: now,
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").First(&user, userID).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&PlaygroundConversation{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
			return err
		}
		if count >= MaxPlaygroundConversations {
			return ErrPlaygroundConversationLimit
		}
		return tx.Create(conversation).Error
	})
	return conversation, err
}

func UpdatePlaygroundConversation(userID, id int, revision int64, modelName, group, messages string) (*PlaygroundConversation, error) {
	now := time.Now().Unix()
	result := DB.Model(&PlaygroundConversation{}).
		Where("user_id = ? AND id = ? AND revision = ?", userID, id, revision).
		Updates(map[string]any{
			"model": modelName, "group": group, "messages": messages,
			"revision": revision + 1, "updated_at": now,
		})
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		if _, err := GetPlaygroundConversation(userID, id); err != nil {
			return nil, err
		}
		return nil, ErrPlaygroundConversationConflict
	}
	return GetPlaygroundConversation(userID, id)
}

func RenamePlaygroundConversation(userID, id int, title string) (*PlaygroundConversation, error) {
	result := DB.Model(&PlaygroundConversation{}).
		Where("user_id = ? AND id = ?", userID, id).
		Updates(map[string]any{"title": title, "updated_at": time.Now().Unix()})
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, ErrPlaygroundConversationNotFound
	}
	return GetPlaygroundConversation(userID, id)
}

func DeletePlaygroundConversation(userID, id int) error {
	result := DB.Where("user_id = ? AND id = ?", userID, id).Delete(&PlaygroundConversation{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrPlaygroundConversationNotFound
	}
	return nil
}
