package controller

import (
	"errors"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"strings"
)

// Refresh only cost provenance, never channels, billing prices or sale status.
func RefreshModelSaleCosts(c *gin.Context) {
	oranexaUpdated, oranexaErr := refreshOranexaSaleCosts(c.Request.Context())
	if oranexaErr != nil {
		modelSaleError(c, oranexaErr)
		return
	}
	cfg, err := loadUpstreamSyncConfig()
	if err != nil {
		modelSaleError(c, err)
		return
	}
	if !cfg.Enabled {
		modelSaleError(c, errors.New("请先配置上游成本同步来源"))
		return
	}
	snapshot, err := runUpstreamMonitor(c.Request.Context(), true)
	if err != nil {
		modelSaleError(c, err)
		return
	}
	var option model.Option
	if err = model.DB.Where("key = ?", "SkymoniUpstreamCosts").First(&option).Error; err != nil {
		modelSaleError(c, err)
		return
	}
	costs := map[string][]UpstreamCost{}
	if err = common.UnmarshalJsonStr(option.Value, &costs); err != nil {
		modelSaleError(c, err)
		return
	}
	updated := 0
	for _, binding := range cfg.Bindings {
		channel, e := model.GetChannelById(binding.ChannelID, true)
		if e != nil || channel.Status != common.ChannelStatusEnabled || channel.ChannelInfo.IsMultiKey {
			continue
		}
		base := "https://app.yylx.io"
		if binding.Provider == "2000run" {
			base = "https://api.2000.run"
		}
		if channel.BaseURL == nil || strings.TrimRight(*channel.BaseURL, "/") != base {
			continue
		}
		var provider *upstreamMonitorProvider
		for i := range snapshot.Providers {
			if snapshot.Providers[i].Provider == binding.Provider {
				provider = &snapshot.Providers[i]
				break
			}
		}
		if provider == nil || provider.Stale || provider.Status != "ok" {
			continue
		}
		mapping := map[string]string{}
		if channel.ModelMapping != nil && strings.TrimSpace(*channel.ModelMapping) != "" {
			if common.UnmarshalJsonStr(*channel.ModelMapping, &mapping) != nil {
				continue
			}
		}
		for _, alias := range strings.Split(channel.Models, ",") {
			alias = strings.TrimSpace(alias)
			up := mapping[alias]
			if up == "" {
				up = alias
			}
			if !binding.allowsModel(up) {
				continue
			}
			for _, quote := range provider.Models {
				group := quote.Group
				if binding.Provider == "yylx" {
					group = quote.GroupID
				}
				if quote.Name != up || group != binding.Group || quote.PriceStatus != "known" || (quote.PeakRateMultiplier != nil && *quote.PeakRateMultiplier != 1) {
					continue
				}
				cost := syncCostRecord(*provider, quote)
				cost.ChannelID = channel.Id
				cost.ChannelVersion = model.ModelSaleCostChannelVersion(*channel, up)
				kept := []UpstreamCost{}
				for _, old := range costs[alias] {
					if old.Provider != cost.Provider || old.Group != cost.Group || (old.ChannelID != 0 && old.ChannelID != cost.ChannelID) {
						kept = append(kept, old)
					}
				}
				costs[alias] = append(kept, cost)
				updated++
				break
			}
		}
	}
	if updated == 0 {
		modelSaleError(c, errors.New("没有获取到与渠道绑定匹配的新成本，未改变价格"))
		return
	}
	encoded, err := common.Marshal(costs)
	if err == nil {
		err = model.StoreModelSaleCosts(string(encoded), "")
	}
	if err != nil {
		modelSaleError(c, err)
		return
	}
	updated += oranexaUpdated
	recordManageAudit(c, "model.sale.cost_refresh", map[string]any{"quotes": updated})
	common.ApiSuccess(c, gin.H{"updated_quotes": updated, "prices_changed": false})
}
