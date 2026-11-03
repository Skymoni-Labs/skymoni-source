package model

import (
	"errors"
	"math/rand"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const ModelHealthEnabledKey = "SkymoniModelHealthEnabled"

func ReadModelHealthState(name string) ChannelHealthState {
	var state ChannelHealthState
	_ = ReadChannelHealthJSON("SkymoniModelHealthState:"+name, &state)
	return state
}

func SaveModelHealthState(name string, state ChannelHealthState) error {
	return saveHealthState("SkymoniModelHealthState:"+name, state)
}

func ClaimModelHealthRound(now int64) bool {
	return claimHealthRound("SkymoniModelHealthLease", now, 300)
}

func ReleaseModelHealthRound(now int64) {
	releaseHealthRound("SkymoniModelHealthLease", now, 300)
}

func RecentModelHealthLogs(name string, since int64) ([]Log, error) {
	var logs []Log
	err := LOG_DB.Select("created_at", "type", "content", "other", "completion_tokens", "token_name", "use_time").
		Where("model_name = ? AND created_at > ? AND type IN ?", name, since, []int{LogTypeConsume, LogTypeError}).
		Order("id DESC").Limit(30).Find(&logs).Error
	return logs, err
}

// Abilities can repeat a channel across user groups. Each enabled channel gets
// one entry, so the random sample is independent of its number of groups.
func RandomModelHealthChannel(name string) (*Channel, error) {
	var ids []int
	err := DB.Model(&Ability{}).Distinct("abilities.channel_id").
		Joins("JOIN channels ON channels.id = abilities.channel_id").
		Where("abilities.model = ? AND abilities.enabled = ? AND channels.status = ?", name, true, common.ChannelStatusEnabled).
		Pluck("abilities.channel_id", &ids).Error
	if err != nil || len(ids) == 0 {
		return nil, err
	}
	var channel Channel
	err = DB.Where("id = ? AND status = ?", ids[rand.Intn(len(ids))], common.ChannelStatusEnabled).First(&channel).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &channel, err
}
