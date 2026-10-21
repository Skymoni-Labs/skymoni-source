package model

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestRenameDeepSeekLowAliasAtomicPricesAndDraft(t *testing.T) {
	now, _ := setupSaleTest(t)
	const oldName = "deepseek-flash-low"
	const newName = "deepseek-v4.1-flash-low"
	expression := `hour("Asia/Shanghai") < 12 ? tier("peak",p*0.3+c*1.2+cr*0.006) : tier("off_peak",p*0.15+c*0.6+cr*0.003)`
	require.NoError(t, UpdateModelPricing([]ModelPricingChange{{ModelName: oldName, ExpectedVersion: ModelPricingVersion(PricingValues{"pricing": PricingValues{}, "source": "upstream"}), Pricing: PricingValues{"billing_setting.billing_mode": "tiered_expr", "billing_setting.billing_expr": expression}}}))
	require.NoError(t, DB.Create(&Model{ModelName: oldName, Status: 1, NameRule: NameRuleExact}).Error)
	mapping := `{"deepseek-flash-low":"deepseek-v4.1-flash"}`
	url := "https://oranexa.top"
	require.NoError(t, DB.Create(&Channel{Id: 2, Status: 1, Models: oldName, ModelMapping: &mapping, BaseURL: &url, Group: "default", Key: "synthetic-private-key"}).Error)
	require.NoError(t, DB.Create(&Ability{Model: oldName, Group: "default", ChannelId: 2, Enabled: true}).Error)
	sale, err := CreateModelSale(ModelSaleInput{Title: "DeepSeek Low 固定成本方案（待成本核验）", StartAt: now.Unix() + 60, EndAt: now.Unix() + 60 + 7*86400, Config: ModelSaleConfig{Basis: "official", Models: []string{oldName}, Multipliers: map[string]float64{oldName: .09}, Policy: DefaultModelSalePolicy(), CountdownMode: "end"}}, now)
	require.NoError(t, err)
	before, err := GetModelPricingSnapshot([]string{oldName})
	require.NoError(t, err)
	require.NoError(t, RenameDeepSeekLowAlias(before.Entries[0].Version, now))
	after, err := GetModelPricingSnapshot([]string{oldName, newName})
	require.NoError(t, err)
	require.Equal(t, after.Entries[0].Configured, after.Entries[1].Configured)
	require.Equal(t, ModelPricingSourceManual, after.Entries[1].PricingSource)
	var channel Channel
	require.NoError(t, DB.First(&channel, 2).Error)
	require.Equal(t, "synthetic-private-key", channel.Key)
	require.Equal(t, oldName+","+newName, channel.Models)
	var aliases map[string]string
	require.NoError(t, common.UnmarshalJsonStr(*channel.ModelMapping, &aliases))
	require.Equal(t, "deepseek-v4.1-flash", aliases[newName])
	var legacy Model
	require.NoError(t, DB.Where("model_name = ?", oldName).First(&legacy).Error)
	require.Equal(t, 0, legacy.Status)
	var current Model
	require.NoError(t, DB.Where("model_name = ?", newName).First(&current).Error)
	require.Equal(t, 1, current.Status)
	var saved ModelSale
	require.NoError(t, DB.First(&saved, "id = ?", sale.ID).Error)
	require.Equal(t, "draft", saved.Status)
	require.False(t, saved.AnnouncementEnabled)
	require.Equal(t, sale.StartAt, saved.StartAt)
	require.Equal(t, sale.EndAt, saved.EndAt)
	require.Equal(t, .09, saved.Config.Multipliers[newName])
	require.NotContains(t, saved.Config.Multipliers, oldName)
	require.Len(t, ModelSaleTimePriceDisplay(saved, now), 1)
}
func TestRenameDeepSeekLowAliasConflictChangesNothing(t *testing.T) {
	now, _ := setupSaleTest(t)
	before, err := GetModelPricingSnapshot(nil)
	require.NoError(t, err)
	require.ErrorIs(t, RenameDeepSeekLowAlias("stale", now), ErrModelPricingConflict)
	after, err := GetModelPricingSnapshot(nil)
	require.NoError(t, err)
	require.Equal(t, before.OptionsVersion, after.OptionsVersion)
}
func TestRenameDeepSeekLowAliasRejectsLiveSale(t *testing.T) {
	now, _ := setupSaleTest(t)
	name := "deepseek-flash-low"
	require.NoError(t, DB.Create(&Model{ModelName: name, Status: 1}).Error)
	require.NoError(t, DB.Create(&ModelSale{ID: "live-alias", Status: "active", Config: ModelSaleConfig{Models: []string{name}}}).Error)
	before, err := GetModelPricingSnapshot([]string{name})
	require.NoError(t, err)
	require.ErrorContains(t, RenameDeepSeekLowAlias(before.Entries[0].Version, now), "先停止旧模型活动")
	after, err := GetModelPricingSnapshot(nil)
	require.NoError(t, err)
	require.Equal(t, before.OptionsVersion, after.OptionsVersion)
	var count int64
	require.NoError(t, DB.Model(&Model{}).Where("model_name = ?", "deepseek-v4.1-flash-low").Count(&count).Error)
	require.Zero(t, count)
}
