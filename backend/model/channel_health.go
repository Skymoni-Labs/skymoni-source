package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const ChannelHealthConfigKey = "SkymoniChannelHealthConfig"
const channelHealthLeaseSeconds = 1800 // 16 pools * 2 probes * 45 seconds, plus storage overhead.

// Pool configuration contains no credentials. A signature pins the exact route
// approved by the owner; editing a route removes it from automatic management.
type ChannelHealthPool struct {
	ID                      string         `json:"id"`
	Provider                string         `json:"provider"`
	Account                 string         `json:"account"`
	UpstreamModel           string         `json:"upstream_model"`
	UpstreamGroup           string         `json:"upstream_group"`
	GroupID                 int            `json:"group_id"`
	Multiplier              float64        `json:"multiplier"`
	Model                   string         `json:"model"`
	Auto                    bool           `json:"auto"`
	ProbeMaxOutputTokens    int            `json:"probe_max_output_tokens,omitempty"`
	ProbeOutputBudgetTokens int            `json:"probe_output_budget_tokens,omitempty"`
	Channels                map[int]string `json:"channels"`
}

type ChannelHealthConfig struct {
	Enabled bool                `json:"enabled"`
	Pools   []ChannelHealthPool `json:"pools"`
}

type ChannelHealthPoint struct {
	At        int64  `json:"at"`
	Success   bool   `json:"success"`
	LatencyMs int64  `json:"latency_ms"`
	Source    string `json:"source"`
	Count     int    `json:"count"`
	Failures  int    `json:"failures"`
}

type ChannelHealthState struct {
	PolicyVersion int                  `json:"policy_version"`
	LastAttemptAt int64                `json:"last_attempt_at"`
	BudgetPaused  bool                 `json:"budget_paused"`
	LastAt        int64                `json:"last_at"`
	Cursor        int                  `json:"cursor"`
	Successes     int                  `json:"successes"`
	Failures      int                  `json:"failures"`
	Status        string               `json:"status"`
	Action        string               `json:"action"`
	History       []ChannelHealthPoint `json:"history"`
}

func ChannelHealthSignature(c *Channel) string {
	// Priority/status are monitor outputs, not part of upstream identity.
	b, _ := json.Marshal([]any{c.Id, c.Type, c.Key, c.BaseURL, c.Models, c.ModelMapping, c.Group, c.ParamOverride, c.HeaderOverride, c.Setting, c.OtherSettings})
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func ReadChannelHealthJSON(key string, target any) error {
	var o Option
	if err := DB.Where("key = ?", key).First(&o).Error; err != nil {
		return err
	}
	return json.Unmarshal([]byte(o.Value), target)
}

func SaveChannelHealthState(id string, state ChannelHealthState) error {
	b, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "key"}}, DoUpdates: clause.AssignmentColumns([]string{"value"})}).Create(&Option{Key: "SkymoniChannelHealthState:" + id, Value: string(b)}).Error
}

func ReadChannelHealthState(id string) ChannelHealthState {
	var state ChannelHealthState
	_ = ReadChannelHealthJSON("SkymoniChannelHealthState:"+id, &state)
	return state
}

// Lease prevents two master processes from spending quota on the same round.
func ClaimChannelHealthRound(now int64) bool {
	key := "SkymoniChannelHealthLease"
	_ = DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: key, Value: "0"}).Error
	var o Option
	if DB.Where("key = ?", key).First(&o).Error != nil {
		return false
	}
	until, err := strconv.ParseInt(o.Value, 10, 64)
	if err != nil || until > now {
		return false
	}
	return DB.Model(&Option{}).Where("key = ? AND value = ?", key, o.Value).Update("value", strconv.FormatInt(now+channelHealthLeaseSeconds, 10)).RowsAffected == 1
}

func ReleaseChannelHealthRound(now int64) {
	DB.Model(&Option{}).Where("key = ? AND value = ?", "SkymoniChannelHealthLease", strconv.FormatInt(now+channelHealthLeaseSeconds, 10)).Update("value", "0")
}

func ValidChannelHealthChannels(pool ChannelHealthPool) ([]Channel, error) {
	ids := make([]int, 0, len(pool.Channels))
	for id := range pool.Channels {
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil, nil
	}
	var rows []Channel
	if err := DB.Where("id IN ?", ids).Order("id ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	valid := make([]Channel, 0, len(rows))
	for _, c := range rows {
		if pool.Channels[c.Id] == ChannelHealthSignature(&c) {
			valid = append(valid, c)
		}
	}
	return valid, nil
}

// Change status and abilities together. Never publish model metadata, and never
// reverse a manual disable: only rows bearing our reason may be restored.
func ApplyChannelHealth(pool ChannelHealthPool, enable bool) (int, error) {
	if !pool.Auto || pool.Provider != "starway" || pool.GroupID <= 0 {
		return 0, nil
	}
	if enable {
		published, err := IsModelPublished(pool.Model)
		if err != nil {
			return 0, err
		}
		if !published {
			return 0, nil
		}
	}
	changed := 0
	err := DB.Transaction(func(tx *gorm.DB) error {
		var cfg Option
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("key = ?", ChannelHealthConfigKey).First(&cfg).Error; err != nil {
			return err
		}
		var config ChannelHealthConfig
		if json.Unmarshal([]byte(cfg.Value), &config) != nil || !config.Enabled {
			return errors.New("monitor configuration changed")
		}
		found := false
		want, _ := json.Marshal(pool)
		for _, p := range config.Pools {
			b, _ := json.Marshal(p)
			if string(b) == string(want) {
				found = true
				break
			}
		}
		if !found {
			return errors.New("monitor pool changed")
		}
		for id, signature := range pool.Channels {
			var c Channel
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&c, id).Error; err != nil {
				return err
			}
			if ChannelHealthSignature(&c) != signature {
				continue
			}
			reason := "sample-health:" + pool.ID
			status := common.ChannelStatusManuallyDisabled
			if enable {
				if c.Status != common.ChannelStatusManuallyDisabled || c.GetOtherInfo()["status_reason"] != reason {
					continue
				}
				status = 1
			} else if c.Status != 1 {
				continue
			}
			info := c.GetOtherInfo()
			info["status_reason"] = reason
			if enable {
				info["status_reason"] = ""
			}
			c.SetOtherInfo(info)
			values := map[string]any{"status": status, "other_info": c.OtherInfo}
			// Business recovery uses the owner's standby priority. Other groups
			// retain their existing route priorities when availability changes.
			if enable && pool.Multiplier == 0.3 {
				values["priority"] = int64(100)
			}
			if err := tx.Model(&Channel{}).Where("id = ?", id).Updates(values).Error; err != nil {
				return err
			}
			ability := map[string]any{"enabled": enable}
			if enable && pool.Multiplier == 0.3 {
				ability["priority"] = int64(100)
			}
			if err := tx.Model(&Ability{}).Where("channel_id = ?", id).Updates(ability).Error; err != nil {
				return err
			}
			changed++
		}
		if changed > 0 {
			event := AuditLog{EventId: common.NewRequestId(), CreatedAt: time.Now().Unix(), Username: "channel-health-worker", Category: AuditCategoryOperation, Action: "channel.sampled_health_status", AuthMethod: "system", Status: 200, Success: true, Content: "Sampled upstream health changed channel availability", Other: AuditOther{Op: &AuditOperation{Action: "channel.sampled_health_status", Params: AuditFields{"pool": pool.ID, "enabled": enable, "changed": changed}}}}
			if err := tx.Create(&event).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err == nil && changed > 0 {
		InitChannelCache()
	}
	return changed, err
}

func RecentChannelHealthLogs(ids []int, since int64) ([]Log, error) {
	var rows []Log
	err := LOG_DB.Select("id", "channel_id", "type", "content", "other", "completion_tokens", "token_name", "use_time").Where("channel_id IN ? AND created_at > ? AND type IN ?", ids, since, []int{LogTypeConsume, LogTypeError}).Order("id DESC").Limit(500).Find(&rows).Error
	return rows, err
}

// Never treat a refunded/empty stream as healthy merely because it has a
// consume log. Client/business rejections do not decide upstream availability.
func ChannelHealthLogOutcome(log Log) (success bool, counted bool) {
	if log.TokenName == "线路抽样检测" || log.TokenName == "模型测试" {
		return false, false
	}
	var other map[string]any
	_ = json.Unmarshal([]byte(log.Other), &other)
	stream, _ := other["stream_status"].(string)
	if detail, ok := other["stream_status"].(map[string]any); ok {
		stream, _ = detail["status"].(string)
	}
	if log.Type == LogTypeConsume {
		return log.CompletionTokens > 0 && stream != "error" && stream != "failed", true
	}
	if log.Type != LogTypeError {
		return false, false
	}
	text := strings.ToLower(log.Content)
	for _, excluded := range []string{"context_length", "context length", "cancel", "client disconnected", "insufficient_user_quota", "model_not_available", "invalid_request", "sensitive"} {
		if strings.Contains(text, excluded) {
			return false, false
		}
	}
	return false, true
}
