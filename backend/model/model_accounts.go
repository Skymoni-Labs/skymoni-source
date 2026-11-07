package model

import (
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"gorm.io/gorm"
)

// These projections deliberately exclude credentials and connection settings.
type ModelAccountChannel struct {
	ID            int      `json:"id"`
	Name          string   `json:"name"`
	Status        int      `json:"status"`
	Priority      int64    `json:"priority"`
	Weight        int      `json:"weight"`
	Groups        []string `json:"groups"`
	Models        []string `json:"models"`
	UpstreamModel string   `json:"upstream_model"`
}

type ModelAccount struct {
	ID        int                   `json:"id"` // Zero is the explicitly unbound collection, not an account.
	Name      string                `json:"name"`
	Provider  string                `json:"provider"`
	Remaining *float64              `json:"remaining"`
	Unit      string                `json:"unit"`
	Pending   int64                 `json:"pending"`
	Enabled   int                   `json:"enabled"`
	Version   string                `json:"version"`
	Channels  []ModelAccountChannel `json:"channels"`
}

type ModelAccountModel struct {
	Model    string         `json:"model"`
	Channels int            `json:"channels"`
	Enabled  int            `json:"enabled"`
	Accounts []ModelAccount `json:"accounts"`
}

type ModelAccountPriorityRequest struct {
	Model     string `json:"model"`
	AccountID int    `json:"account_id"`
	Version   string `json:"version"`
	Priority  *int64 `json:"priority"`
}

type ModelAccountPriorityChange struct {
	ID       int   `json:"id"`
	Previous int64 `json:"previous"`
	Priority int64 `json:"priority"`
}

var ErrModelAccountChanged = errors.New("渠道或账户配置已变化，请刷新后重新确认")
var ErrModelAccountPriority = errors.New("请选择已绑定账户，并输入 -2147483648 到 2147483647 之间的整数优先级")

func modelAccountValues(raw string) []string {
	seen := map[string]bool{}
	values := make([]string, 0)
	for _, value := range strings.Split(raw, ",") {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			seen[value] = true
			values = append(values, value)
		}
	}
	sort.Strings(values)
	return values
}

func loadModelAccounts(tx *gorm.DB, scope *ModelAccountPriorityRequest) ([]ModelAccountModel, error) {
	var channels []Channel
	var bindings []UpstreamWalletBinding
	var wallets []UpstreamWallet
	channelQuery := tx.Order("id")
	bindingQuery := tx.Order("channel_id")
	walletQuery := tx.Select("id", "name", "provider", "remaining", "unit", "calibrated_at", "pending").Order("id")
	if scope != nil {
		channelQuery = channelQuery.Where("id IN (SELECT channel_id FROM upstream_wallet_bindings WHERE wallet_id = ?)", scope.AccountID)
		bindingQuery = bindingQuery.Where("wallet_id = ?", scope.AccountID)
		walletQuery = walletQuery.Where("id = ?", scope.AccountID)
		channelQuery = lockForUpdate(channelQuery)
		bindingQuery = lockForUpdate(bindingQuery)
		walletQuery = lockForUpdate(walletQuery)
	}
	if err := channelQuery.Find(&channels).Error; err != nil {
		return nil, err
	}
	if err := bindingQuery.Find(&bindings).Error; err != nil {
		return nil, err
	}
	if err := walletQuery.Find(&wallets).Error; err != nil {
		return nil, err
	}
	walletByID := make(map[int]UpstreamWallet, len(wallets))
	for _, wallet := range wallets {
		walletByID[wallet.ID] = wallet
	}
	bindingByChannel := make(map[int]int, len(bindings))
	for _, binding := range bindings {
		bindingByChannel[binding.ChannelID] = binding.WalletID
	}
	grouped := map[string]map[int]*ModelAccount{}
	// The opaque version includes routing identity, state and all aliases. A stale
	// preview cannot silently overwrite a concurrent edit or a changed membership.
	fingerprints := map[string]map[int][]string{}
	for _, channel := range channels {
		accountID := bindingByChannel[channel.Id]
		wallet, bound := walletByID[accountID]
		if !bound {
			accountID = 0
			wallet = UpstreamWallet{Name: "未绑定账户"}
		}
		aliases := modelAccountValues(channel.Models)
		mapping := map[string]string{}
		if channel.ModelMapping != nil {
			_ = json.Unmarshal([]byte(*channel.ModelMapping), &mapping)
		}
		name := channel.Name
		if channel.Key != "" && strings.Contains(name, channel.Key) {
			name = fmt.Sprintf("渠道 #%d", channel.Id)
		}
		for _, alias := range aliases {
			if grouped[alias] == nil {
				grouped[alias] = map[int]*ModelAccount{}
				fingerprints[alias] = map[int][]string{}
			}
			account := grouped[alias][accountID]
			if account == nil {
				account = &ModelAccount{ID: accountID, Name: wallet.Name, Provider: wallet.Provider, Unit: wallet.Unit, Pending: wallet.Pending, Channels: []ModelAccountChannel{}}
				if bound && wallet.CalibratedAt > 0 {
					remaining := wallet.Remaining
					account.Remaining = &remaining
				}
				grouped[alias][accountID] = account
			}
			upstream := mapping[alias]
			if upstream == "" {
				upstream = alias
			}
			account.Channels = append(account.Channels, ModelAccountChannel{
				ID: channel.Id, Name: name, Status: channel.Status, Priority: channel.GetPriority(),
				Weight: channel.GetWeight(), Groups: modelAccountValues(channel.Group), Models: aliases, UpstreamModel: upstream,
			})
			if channel.Status == 1 {
				account.Enabled++
			}
			fingerprints[alias][accountID] = append(fingerprints[alias][accountID], fmt.Sprintf("%s:%d:%d:%d", ChannelHealthSignature(&channel), channel.Status, channel.GetPriority(), channel.GetWeight()))
		}
	}
	result := make([]ModelAccountModel, 0, len(grouped))
	for alias, accounts := range grouped {
		item := ModelAccountModel{Model: alias, Accounts: []ModelAccount{}}
		for id, account := range accounts {
			versionData, _ := json.Marshal([]any{alias, id, account.Name, account.Provider, fingerprints[alias][id]})
			account.Version = fmt.Sprintf("%x", sha256.Sum256(versionData))
			sort.Slice(account.Channels, func(i, j int) bool {
				a, b := account.Channels[i], account.Channels[j]
				if a.Priority != b.Priority {
					return a.Priority > b.Priority
				}
				return a.ID < b.ID
			})
			item.Channels += len(account.Channels)
			item.Enabled += account.Enabled
			item.Accounts = append(item.Accounts, *account)
		}
		sort.Slice(item.Accounts, func(i, j int) bool {
			a, b := item.Accounts[i], item.Accounts[j]
			if a.Channels[0].Priority != b.Channels[0].Priority {
				return a.Channels[0].Priority > b.Channels[0].Priority
			}
			return a.ID < b.ID
		})
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Model < result[j].Model })
	return result, nil
}

func GetModelAccounts() ([]ModelAccountModel, error) {
	var result []ModelAccountModel
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = loadModelAccounts(tx, nil)
		return err
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

// Only priority is written, including every ability of a shared channel. Channel
// state, weights, health signatures and any manual disable remain untouched.
func UpdateModelAccountPriority(request ModelAccountPriorityRequest) ([]ModelAccountPriorityChange, error) {
	if request.Priority == nil || *request.Priority < -2147483648 || *request.Priority > 2147483647 || request.AccountID <= 0 || request.Model == "" || len(request.Version) != 64 {
		return nil, ErrModelAccountPriority
	}
	changes := make([]ModelAccountPriorityChange, 0)
	err := DB.Transaction(func(tx *gorm.DB) error {
		models, err := loadModelAccounts(tx, &request)
		if err != nil {
			return err
		}
		var selected *ModelAccount
		for _, item := range models {
			if item.Model != request.Model {
				continue
			}
			for _, account := range item.Accounts {
				if account.ID == request.AccountID && account.Version == request.Version {
					selected = &account
				}
			}
		}
		if selected == nil {
			return ErrModelAccountChanged
		}
		ids := make([]int, 0, len(selected.Channels))
		changedIDs := make([]int, 0, len(selected.Channels))
		for _, channel := range selected.Channels {
			ids = append(ids, channel.ID)
			if channel.Priority != *request.Priority {
				changedIDs = append(changedIDs, channel.ID)
			}
			changes = append(changes, ModelAccountPriorityChange{ID: channel.ID, Previous: channel.Priority, Priority: *request.Priority})
		}
		if len(changedIDs) > 0 {
			updated := tx.Model(&Channel{}).Where("id IN ?", changedIDs).Update("priority", *request.Priority)
			if updated.Error != nil {
				return updated.Error
			}
			if updated.RowsAffected != int64(len(changedIDs)) {
				return ErrModelAccountChanged
			}
		}
		return tx.Model(&Ability{}).Where("channel_id IN ?", ids).Update("priority", *request.Priority).Error
	}, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	return changes, nil
}
