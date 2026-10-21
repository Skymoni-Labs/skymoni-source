package model

import (
	"errors"
	"slices"
	"strings"
	"unicode/utf8"

	"gorm.io/gorm"
)

// MergeChannelGroup appends one group without replacing memberships or touching
// credentials. Memberships and routing abilities commit together for the batch.
func MergeChannelGroup(ids []int, group string) (int, error) {
	orderedIDs := slices.Clone(ids)
	slices.Sort(orderedIDs)
	orderedIDs = slices.Compact(orderedIDs)
	if len(orderedIDs) == 0 || orderedIDs[0] <= 0 || len(orderedIDs) > 500 ||
		group == "" || group == "auto" || strings.Contains(group, ",") || strings.TrimSpace(group) != group {
		return 0, errors.New("请选择有效的渠道和目标分组")
	}
	changed := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		var channels []Channel
		if err := lockForUpdate(tx).Select("id", "group", "models", "status", "priority", "weight", "tag").
			Where("id IN ?", orderedIDs).Order("id").Find(&channels).Error; err != nil {
			return err
		}
		if len(channels) != len(orderedIDs) {
			return errors.New("部分渠道已不存在，请刷新列表后重试")
		}
		for _, channel := range channels {
			groups := strings.Split(channel.Group, ",")
			if slices.Contains(groups, group) {
				continue
			}
			if channel.Group == "" {
				channel.Group = group
			} else {
				channel.Group += "," + group
			}
			if utf8.RuneCountInString(channel.Group) > 64 {
				return errors.New("并入后分组名称总长度超过 64 个字符，请缩短分组名称或减少已有分组")
			}
			if err := tx.Model(&Channel{}).Where("id = ?", channel.Id).Update("group", channel.Group).Error; err != nil {
				return err
			}
			if err := channel.UpdateAbilities(tx); err != nil {
				return err
			}
			changed++
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return changed, nil
}
