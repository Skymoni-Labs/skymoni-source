package controller

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const oranexaSaleCostURL = "https://oranexa.top/api/v1/model-plaza"

type oranexaSaleBinding struct {
	ChannelID      int    `json:"channel_id"`
	SourceModel    string `json:"source_model"`
	ChannelVersion string `json:"channel_version"`
	GroupID        int    `json:"group_id"`
}
type oranexaSaleConfig struct {
	Costs    map[string]float64   `json:"costs"`
	Bindings []oranexaSaleBinding `json:"oranexa_sale_cost_bindings"`
}
type oranexaSaleModel struct {
	Name        string                          `json:"name"`
	Pricing     yylxPrice                       `json:"pricing"`
	TimePricing *model.ModelSaleCostTimePricing `json:"time_pricing"`
}
type oranexaSaleGroup struct {
	ID          int                `json:"id"`
	Name        string             `json:"name"`
	Rate        float64            `json:"rate_multiplier"`
	PeakEnabled bool               `json:"peak_rate_enabled"`
	Models      []oranexaSaleModel `json:"models"`
}

func oranexaCostRecord(binding oranexaSaleBinding, group oranexaSaleGroup, quote oranexaSaleModel, stamp string) (UpstreamCost, error) {
	p := quote.Pricing
	if group.ID != binding.GroupID || quote.Name != binding.SourceModel || group.PeakEnabled || !syncFinite(group.Rate) || group.Rate <= 0 || p.BillingMode != "token" || len(p.Intervals) > 0 {
		return UpstreamCost{}, errors.New("Oranexa 分组或计费成本规则未核验")
	}
	if quote.TimePricing == nil {
		return UpstreamCost{}, errors.New("Oranexa 缺少分时成本规则")
	}
	if _, _, err := quote.TimePricing.Condition(); err != nil {
		return UpstreamCost{}, err
	}
	for i, v := range []*float64{p.InputPrice, p.OutputPrice, p.CacheReadPrice, p.CacheWritePrice, p.CacheWrite1hPrice} {
		if v == nil || !syncFinite(*v) || *v < 0 || (i < 2 && *v == 0) {
			return UpstreamCost{}, errors.New("Oranexa 缺少可核验的成本分项")
		}
	}
	return UpstreamCost{ChannelID: binding.ChannelID, ChannelVersion: binding.ChannelVersion, SourceModel: binding.SourceModel,
		Provider: "oranexa", Source: oranexaSaleCostURL, ObservedAt: stamp, Group: group.Name, GroupRatio: monitorNumber(group.Rate), BillingType: "token",
		InputUSDPerMillion: monitorMillion(p.InputPrice), OutputUSDPerMillion: monitorMillion(p.OutputPrice), CacheRead: monitorMillion(p.CacheReadPrice), CacheWrite: monitorMillion(p.CacheWritePrice), CacheWrite1h: monitorMillion(p.CacheWrite1hPrice), TimePricing: quote.TimePricing}, nil
}

// Cost-only refresh. Channel fingerprints bind each supplier group to the exact
// key/model verified when it was created; changing a route never inherits costs.
// This runs inside the website's existing leased fifteen-minute upstream task.
func refreshOranexaSaleCosts(ctx context.Context) (int, error) {
	path := os.Getenv("SKYMONI_UPSTREAM_SYNC_CONFIG")
	if path == "" {
		return 0, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0, errors.New("Oranexa 成本绑定配置无法读取")
	}
	var cfg oranexaSaleConfig
	if common.Unmarshal(raw, &cfg) != nil {
		return 0, errors.New("Oranexa 成本绑定配置无效")
	}
	if len(cfg.Bindings) == 0 {
		return 0, nil
	}
	if !syncFinite(cfg.Costs["oranexa"]) || cfg.Costs["oranexa"] <= 0 {
		return 0, errors.New("Oranexa 采购现金换算未核验")
	}
	var source struct {
		Code int `json:"code"`
		Data struct {
			Groups []oranexaSaleGroup `json:"groups"`
		} `json:"data"`
	}
	if err = fetchUpstreamMonitorJSON(ctx, newUpstreamMonitorClient(), oranexaSaleCostURL, "", &source); err != nil {
		return 0, err
	}
	if source.Code != 0 || len(source.Data.Groups) == 0 {
		return 0, errors.New("Oranexa 成本源未返回可核验分组")
	}
	groups := map[int]oranexaSaleGroup{}
	for _, g := range source.Data.Groups {
		if _, ok := groups[g.ID]; ok {
			return 0, errors.New("Oranexa 成本分组重复")
		}
		groups[g.ID] = g
	}
	var option model.Option
	if err = model.DB.Where("key = ?", "SkymoniUpstreamCosts").First(&option).Error; err != nil {
		return 0, err
	}
	costs := map[string][]UpstreamCost{}
	if common.UnmarshalJsonStr(option.Value, &costs) != nil {
		return 0, errors.New("成本记录无效")
	}
	var channels []model.Channel
	if err = model.DB.Select("id", "key", "base_url", "models", "group", "model_mapping", "channel_info").Where("status = ?", common.ChannelStatusEnabled).Find(&channels).Error; err != nil {
		return 0, err
	}
	updated := 0
	seen := map[string]bool{}
	stamp := time.Now().UTC().Format(time.RFC3339)
	for _, binding := range cfg.Bindings {
		id := fmt.Sprintf("%d/%s", binding.ChannelID, binding.SourceModel)
		if binding.ChannelID <= 0 || binding.SourceModel == "" || binding.ChannelVersion == "" || seen[id] {
			return 0, errors.New("Oranexa 成本绑定重复或无效")
		}
		seen[id] = true
		for _, ch := range channels {
			if ch.Id != binding.ChannelID || ch.BaseURL == nil || strings.TrimRight(*ch.BaseURL, "/") != "https://oranexa.top" || ch.ChannelInfo.IsMultiKey || model.ModelSaleCostChannelVersion(ch, binding.SourceModel) != binding.ChannelVersion {
				continue
			}
			mapping := map[string]string{}
			if ch.ModelMapping != nil && strings.TrimSpace(*ch.ModelMapping) != "" && common.UnmarshalJsonStr(*ch.ModelMapping, &mapping) != nil {
				continue
			}
			for _, alias := range strings.Split(ch.Models, ",") {
				alias = strings.TrimSpace(alias)
				up := mapping[alias]
				if up == "" {
					up = alias
				}
				if up != binding.SourceModel {
					continue
				}
				group := groups[binding.GroupID]
				var cost UpstreamCost
				recordErr := errors.New("Oranexa 模型或分组已移除")
				for _, q := range group.Models {
					if q.Name == up {
						cost, recordErr = oranexaCostRecord(binding, group, q, stamp)
						break
					}
				}
				if recordErr != nil {
					cost = UpstreamCost{ChannelID: ch.Id, ChannelVersion: binding.ChannelVersion, Provider: "oranexa", SourceModel: up, Source: oranexaSaleCostURL, ObservedAt: stamp, Note: recordErr.Error()}
				}
				kept := []UpstreamCost{}
				for _, old := range costs[alias] {
					if old.Provider != "oranexa" || old.ChannelID != ch.Id {
						kept = append(kept, old)
					}
				}
				costs[alias] = append(kept, cost)
				updated++
			}
		}
	}
	if updated == 0 {
		return 0, errors.New("Oranexa 成本绑定与当前渠道不匹配")
	}
	encoded, err := common.Marshal(costs)
	if err == nil {
		err = model.StoreModelSaleCosts(string(encoded), "oranexa")
	}
	return updated, err
}
