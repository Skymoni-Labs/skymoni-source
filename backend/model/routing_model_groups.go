package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// RoutingModelGroupsKey is separate from channel membership and personal
// model-square collections. An explicit empty list denies every model.
const RoutingModelGroupsKey = "RoutingModelGroups"

var routingModelGroups atomic.Value
var routingModelGroupWriteLock sync.Mutex
var ErrRoutingModelGroupConflict = errors.New("分组设置已被其他操作修改，请刷新后重试")
var routingModelGroupOptionKeys = []string{"GroupRatio", RoutingModelGroupsKey, "UserUsableGroups"}

func init() { routingModelGroups.Store(map[string][]string{}) }

type RoutingModelGroupChange struct {
	Name            string   `json:"name"`
	Models          []string `json:"models"`
	Mode            string   `json:"mode"`
	ExpectedVersion string   `json:"expected_version"`
	Ratio           *float64 `json:"ratio,omitempty"`
	Description     string   `json:"description"`
	Selectable      bool     `json:"selectable"`
}

type RoutingModelGroupEntry struct {
	Name        string   `json:"name"`
	Models      []string `json:"models"`
	Managed     bool     `json:"managed"`
	Ratio       float64  `json:"ratio"`
	Description string   `json:"description"`
	Selectable  bool     `json:"selectable"`
}

type RoutingModelGroupCatalog struct {
	Version string                   `json:"version"`
	Groups  []RoutingModelGroupEntry `json:"groups"`
	Models  []string                 `json:"models"`
}

func RoutingModelGroupModels(name string) ([]string, bool) {
	models, exists := routingModelGroups.Load().(map[string][]string)[name]
	return slices.Clone(models), exists
}

func applyRoutingModelGroups(value string) error {
	groups := map[string][]string{}
	if err := common.UnmarshalJsonStr(value, &groups); err != nil || groups == nil {
		return errors.New("模型分组配置无效")
	}
	for name, models := range groups {
		if name == "" || name == "auto" || strings.TrimSpace(name) != name || strings.Contains(name, ",") || utf8.RuneCountInString(name) > 64 || len(models) > 5000 {
			return errors.New("模型分组配置无效")
		}
	}
	routingModelGroups.Store(groups)
	return nil
}

func routingGroupOptions(db *gorm.DB) (map[string]string, error) {
	values := make(map[string]string, len(routingModelGroupOptionKeys))
	common.OptionMapRWMutex.RLock()
	for _, key := range routingModelGroupOptionKeys {
		values[key] = common.OptionMap[key]
	}
	common.OptionMapRWMutex.RUnlock()
	if values[RoutingModelGroupsKey] == "" {
		values[RoutingModelGroupsKey] = "{}"
	}
	var options []Option
	if err := db.Where(map[string]any{"key": routingModelGroupOptionKeys}).Find(&options).Error; err != nil {
		return nil, err
	}
	for _, option := range options {
		values[option.Key] = option.Value
	}
	return values, nil
}

func routingGroupsVersion(options map[string]string) string {
	encoded, _ := common.Marshal(options)
	return fmt.Sprintf("%x", sha256.Sum256(encoded))
}

func GetRoutingModelGroupCatalog() (*RoutingModelGroupCatalog, error) {
	values, err := routingGroupOptions(DB)
	if err != nil {
		return nil, err
	}
	ratios := map[string]float64{}
	usable := map[string]string{}
	groups := map[string][]string{}
	if err := common.UnmarshalJsonStr(values["GroupRatio"], &ratios); err != nil {
		return nil, err
	}
	if err := common.UnmarshalJsonStr(values["UserUsableGroups"], &usable); err != nil {
		return nil, err
	}
	if err := common.UnmarshalJsonStr(values[RoutingModelGroupsKey], &groups); err != nil {
		return nil, err
	}
	var channels []Channel
	if err := DB.Select("models", "group", "status").Find(&channels).Error; err != nil {
		return nil, err
	}
	allModels := map[string]bool{}
	legacyModels := map[string]map[string]bool{}
	for _, channel := range channels {
		for _, name := range channel.GetModels() {
			if name == "" {
				continue
			}
			allModels[name] = true
			for _, group := range channel.GetGroups() {
				if !BusinessGroupSupportsModel(group, name) {
					continue
				}
				if legacyModels[group] == nil {
					legacyModels[group] = map[string]bool{}
				}
				legacyModels[group][name] = true
			}
		}
	}
	catalog := &RoutingModelGroupCatalog{Version: routingGroupsVersion(values), Groups: []RoutingModelGroupEntry{}, Models: []string{}}
	for name := range allModels {
		catalog.Models = append(catalog.Models, name)
	}
	slices.Sort(catalog.Models)
	for name, ratio := range ratios {
		if name == "auto" {
			continue
		}
		members, managed := groups[name]
		if !managed {
			for member := range legacyModels[name] {
				members = append(members, member)
			}
		}
		members = slices.Clone(members)
		if members == nil {
			members = []string{}
		}
		slices.Sort(members)
		description, selectable := usable[name]
		catalog.Groups = append(catalog.Groups, RoutingModelGroupEntry{Name: name, Models: members, Managed: managed, Ratio: ratio, Description: description, Selectable: selectable})
	}
	slices.SortFunc(catalog.Groups, func(a, b RoutingModelGroupEntry) int { return strings.Compare(a.Name, b.Name) })
	return catalog, nil
}

// SaveRoutingModelGroup commits membership, the new group's multiplier and its
// user visibility together. Existing multipliers/visibility are never rewritten
// when merging or replacing members. CAS protects against stale browser edits.
func SaveRoutingModelGroup(change RoutingModelGroupChange) error {
	if change.Name == "" || change.Name == "auto" || strings.TrimSpace(change.Name) != change.Name || strings.ContainsAny(change.Name, ",\n\r\t") || utf8.RuneCountInString(change.Name) > 64 || len(change.Models) > 5000 {
		return errors.New("分组名称或模型数量无效")
	}
	if change.Mode != "create" && change.Mode != "merge" && change.Mode != "replace" {
		return errors.New("请选择有效的模型归组操作")
	}
	if change.Mode != "replace" && len(change.Models) == 0 {
		return errors.New("请至少选择一个模型")
	}
	if change.Mode == "create" && (change.Ratio == nil || math.IsNaN(*change.Ratio) || math.IsInf(*change.Ratio, 0) || *change.Ratio < 0 || len(change.Description) > 1000) {
		return errors.New("分组倍率或说明无效")
	}
	routingModelGroupWriteLock.Lock()
	defer routingModelGroupWriteLock.Unlock()
	before, err := routingGroupOptions(DB)
	if err != nil {
		return err
	}
	// Materialize default option rows so all writers lock the same durable rows.
	for _, key := range routingModelGroupOptionKeys {
		if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: key, Value: before[key]}).Error; err != nil {
			return err
		}
	}
	var committed map[string]string
	err = DB.Transaction(func(tx *gorm.DB) error {
		var locked []Option
		if err := lockForUpdate(tx).Where(map[string]any{"key": routingModelGroupOptionKeys}).Order(clause.OrderByColumn{Column: clause.Column{Name: "key"}}).Find(&locked).Error; err != nil {
			return err
		}
		values := make(map[string]string)
		for _, option := range locked {
			values[option.Key] = option.Value
		}
		if change.ExpectedVersion != routingGroupsVersion(values) {
			return ErrRoutingModelGroupConflict
		}
		ratios := map[string]float64{}
		usable := map[string]string{}
		groups := map[string][]string{}
		if err := common.UnmarshalJsonStr(values["GroupRatio"], &ratios); err != nil {
			return err
		}
		if err := common.UnmarshalJsonStr(values["UserUsableGroups"], &usable); err != nil {
			return err
		}
		if err := common.UnmarshalJsonStr(values[RoutingModelGroupsKey], &groups); err != nil {
			return err
		}
		_, exists := ratios[change.Name]
		if change.Mode == "create" && exists {
			return errors.New("分组名称已存在，请选择并入已有模型分组")
		}
		if change.Mode != "create" && !exists {
			return errors.New("目标分组不存在，请刷新后重试")
		}
		var channels []Channel
		if err := tx.Select("models", "group").Find(&channels).Error; err != nil {
			return err
		}
		available := map[string]bool{}
		legacy := []string{}
		for _, channel := range channels {
			for _, name := range channel.GetModels() {
				if name == "" {
					continue
				}
				available[name] = true
				if slices.Contains(channel.GetGroups(), change.Name) && BusinessGroupSupportsModel(change.Name, name) {
					legacy = append(legacy, name)
				}
			}
		}
		previous, managed := groups[change.Name]
		for _, name := range change.Models {
			// Existing members may temporarily have no channel; administrators can keep
			// them while repairing upstreams, but cannot introduce unknown names.
			if name == "" || len(name) > 255 || strings.Contains(name, ",") || (!available[name] && !slices.Contains(previous, name)) || !BusinessGroupSupportsModel(change.Name, name) {
				return fmt.Errorf("模型不可用或不符合分组限制：%s", name)
			}
		}
		models := slices.Clone(change.Models)
		if change.Mode == "merge" {
			if !managed {
				previous = legacy
			}
			models = append(models, previous...)
		}
		slices.Sort(models)
		models = slices.Compact(models)
		if models == nil {
			models = []string{}
		}
		groups[change.Name] = models
		if change.Mode == "create" {
			ratios[change.Name] = *change.Ratio
			if change.Selectable {
				usable[change.Name] = change.Description
			}
		}
		groupJSON, err := common.Marshal(groups)
		if err != nil {
			return err
		}
		ratioJSON, err := common.Marshal(ratios)
		if err != nil {
			return err
		}
		usableJSON, err := common.Marshal(usable)
		if err != nil {
			return err
		}
		committed = map[string]string{RoutingModelGroupsKey: string(groupJSON), "GroupRatio": string(ratioJSON), "UserUsableGroups": string(usableJSON)}
		for _, key := range routingModelGroupOptionKeys {
			if err := tx.Model(&Option{}).Where(map[string]any{"key": key}).Update("value", committed[key]).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	for _, key := range routingModelGroupOptionKeys {
		if err := updateOptionMap(key, committed[key]); err != nil {
			return err
		}
	}
	return nil
}

// channelModelGroupAbilities derives independent routes without modifying the
// channel's membership, credentials, priority or upstream model mapping.
func channelModelGroupAbilities(channel *Channel) []Ability {
	groups := routingModelGroups.Load().(map[string][]string)
	abilities := []Ability{}
	for group, members := range groups {
		for _, name := range channel.GetModels() {
			if !slices.Contains(members, name) || !BusinessGroupSupportsModel(group, name) {
				continue
			}
			abilities = append(abilities, Ability{Group: group, Model: name, ChannelId: channel.Id, Enabled: channel.Status == common.ChannelStatusEnabled, Priority: channel.Priority, Weight: uint(channel.GetWeight()), Tag: channel.Tag})
		}
	}
	return abilities
}

func RoutingModelGroupAllowsModel(group, name string) bool {
	members, managed := routingModelGroups.Load().(map[string][]string)[group]
	return !managed || slices.Contains(members, name)
}
