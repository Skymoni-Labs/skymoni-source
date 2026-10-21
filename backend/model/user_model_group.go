package model

import (
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	MaxUserModelGroups      = 50
	MaxUserModelGroupModels = 100
)

var (
	ErrUserModelGroupNotFound = errors.New("model group not found")
	ErrUserModelGroupExists   = errors.New("model group name already exists")
	ErrUserModelGroupLimit    = errors.New("model group limit reached")
)

// UserModelGroup is a private presentation-only collection. It must never be
// used as a channel group, token group, permission, or billing multiplier.
type UserModelGroup struct {
	Id             int    `json:"id" gorm:"primaryKey"`
	UserId         int    `json:"-" gorm:"not null;uniqueIndex:idx_user_model_group_name,priority:1;index"`
	Name           string `json:"name" gorm:"type:varchar(200);not null"`
	NormalizedName string `json:"-" gorm:"type:varchar(100);not null;uniqueIndex:idx_user_model_group_name,priority:2"`
	ModelNames     string `json:"-" gorm:"type:text;not null"`
	CreatedAt      int64  `json:"created_at" gorm:"bigint;not null"`
	UpdatedAt      int64  `json:"updated_at" gorm:"bigint;not null"`
}

func normalizeUserModelGroupName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func (group *UserModelGroup) GetModelNames() ([]string, error) {
	var names []string
	if err := common.UnmarshalJsonStr(group.ModelNames, &names); err != nil {
		return nil, err
	}
	return names, nil
}

func GetUserModelGroups(userID int) ([]UserModelGroup, error) {
	var groups []UserModelGroup
	err := DB.Where("user_id = ?", userID).Order("id asc").Find(&groups).Error
	return groups, err
}

func CreateUserModelGroup(userID int, name string, modelNames []string) (*UserModelGroup, error) {
	encoded, err := common.Marshal(modelNames)
	if err != nil {
		return nil, err
	}
	group := &UserModelGroup{
		UserId:         userID,
		Name:           name,
		NormalizedName: normalizeUserModelGroupName(name),
		ModelNames:     string(encoded),
		CreatedAt:      time.Now().Unix(),
		UpdatedAt:      time.Now().Unix(),
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").First(&user, userID).Error; err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&UserModelGroup{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
			return err
		}
		if count >= MaxUserModelGroups {
			return ErrUserModelGroupLimit
		}
		if err := tx.Model(&UserModelGroup{}).Where("user_id = ? AND normalized_name = ?", userID, group.NormalizedName).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrUserModelGroupExists
		}
		return tx.Create(group).Error
	})
	if err != nil {
		return nil, err
	}
	return group, nil
}

func UpdateUserModelGroup(userID, id int, name string, modelNames []string) (*UserModelGroup, error) {
	encoded, err := common.Marshal(modelNames)
	if err != nil {
		return nil, err
	}
	var group UserModelGroup
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", id, userID).First(&group).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUserModelGroupNotFound
			}
			return err
		}
		normalizedName := normalizeUserModelGroupName(name)
		var count int64
		if err := tx.Model(&UserModelGroup{}).Where("user_id = ? AND normalized_name = ? AND id <> ?", userID, normalizedName, id).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrUserModelGroupExists
		}
		group.Name = name
		group.NormalizedName = normalizedName
		group.ModelNames = string(encoded)
		group.UpdatedAt = time.Now().Unix()
		return tx.Model(&UserModelGroup{}).Where("id = ? AND user_id = ?", id, userID).Updates(map[string]any{
			"name":            group.Name,
			"normalized_name": group.NormalizedName,
			"model_names":     group.ModelNames,
			"updated_at":      group.UpdatedAt,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return &group, nil
}

func DeleteUserModelGroup(userID, id int) error {
	result := DB.Where("id = ? AND user_id = ?", id, userID).Delete(&UserModelGroup{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrUserModelGroupNotFound
	}
	return nil
}
