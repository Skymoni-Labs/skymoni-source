package service

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestScheduledSaleMailStartsPricesBeforeRenderingAndBlocksHigherCost(t *testing.T) {
	for _, layout := range []string{"full", "compact"} {
		for _, costChanged := range []bool{false, true} {
			t.Run(layout+"/"+map[bool]string{false: "starts-and-renders", true: "cost-blocks-both"}[costChanged], func(t *testing.T) {
				oldDB, oldType, oldOptions := model.DB, common.MainDatabaseType(), common.OptionMap
				oldPath, oldMaster, oldLogType := common.SQLitePath, common.IsMasterNode, common.LogDatabaseType()
				t.Setenv("SQL_DSN", "local")
				t.Setenv("LOG_SQL_DSN", "")
				common.SQLitePath, common.IsMasterNode = t.TempDir()+"/mail.db", false
				require.NoError(t, model.InitDB())
				db := model.DB
				common.OptionMap = map[string]string{}
				t.Cleanup(func() {
					model.DB = oldDB
					common.SetMainDatabaseType(oldType)
					common.OptionMap = oldOptions
					common.SQLitePath, common.IsMasterNode = oldPath, oldMaster
					common.SetLogDatabaseType(oldLogType)
					sql, _ := db.DB()
					sql.Close()
				})
				require.NoError(t, db.AutoMigrate(&model.ModelSale{}, &model.Option{}, &model.Channel{}, &model.AdminMailCampaign{}, &model.AdminMailDelivery{}))
				now := time.Now().Truncate(time.Second).Add(-61 * time.Second)
				url := "https://api.yylx.io"
				channel := model.Channel{Id: 1, Status: 1, Key: "fixture", BaseURL: &url, Models: "sale-test", Group: "default"}
				require.NoError(t, db.Create(&channel).Error)
				cost := map[string]any{"provider": "yylx", "observed_at": now.Format(time.RFC3339), "billing_type": "token", "group_ratio": 1, "input_usd_per_million": 1, "output_usd_per_million": 2, "channel_id": 1, "source_model": "sale-test", "channel_version": model.ModelSaleCostChannelVersion(channel, "sale-test")}
				costRaw, _ := json.Marshal(map[string]any{"sale-test": []any{cost}})
				options := []model.Option{{Key: "GroupRatio", Value: `{"default":1}`}, {Key: "billing_setting.billing_mode", Value: `{"sale-test":"tiered_expr"}`}, {Key: "billing_setting.billing_expr", Value: `{"sale-test":"tier(\"standard\",p*200+c*400)"}`}, {Key: "SkymoniUpstreamCosts", Value: string(costRaw)}}
				require.NoError(t, db.Create(&options).Error)
				in := model.ModelSaleInput{Title: "七天降价", StartAt: now.Unix() + 60, EndAt: now.Unix() + 3600, Config: model.ModelSaleConfig{Models: []string{"sale-test"}, Discount: 10, Policy: model.DefaultModelSalePolicy(), CountdownMode: "end"}}
				sale, e := model.CreateModelSale(in, now)
				require.NoError(t, e)
				sale, e = model.EnableModelSale(sale.ID, sale.Revision, now)
				require.NoError(t, e)
				c := model.AdminMailCampaign{RequestKey: "fixture-mail", Subject: "优惠", Format: "html", Audience: "all_users", Status: "draft", Content: model.PopupNoticeContent(`<div data-model-sale="` + sale.ID + `" data-model-sale-layout="` + layout + `">old</div>`), Html: "old preview"}
				require.NoError(t, db.Create(&c).Error)
				require.NoError(t, ValidateAdminMailSchedule(&c, in.StartAt, now))
				require.NoError(t, model.ScheduleAdminMailCampaign(c.Id, in.StartAt, now, c.ScheduleSaleFingerprint))
				require.NoError(t, QueueDueAdminMailCampaigns(now.Add(59*time.Second)))
				require.NoError(t, db.First(&c, c.Id).Error)
				require.Equal(t, "scheduled", c.Status)
				if costChanged {
					cost["input_usd_per_million"], cost["output_usd_per_million"] = 100, 200
					costRaw, _ = json.Marshal(map[string]any{"sale-test": []any{cost}})
					require.NoError(t, db.Model(&model.Option{}).Where("key = ?", "SkymoniUpstreamCosts").Update("value", string(costRaw)).Error)
				}
				require.NoError(t, QueueDueAdminMailCampaigns(time.Now()))
				require.NoError(t, db.First(&c, c.Id).Error)
				require.NoError(t, db.First(sale, "id = ?", sale.ID).Error)
				if costChanged {
					require.Equal(t, "blocked", sale.Status)
					require.Equal(t, "schedule_failed", c.Status)
					require.Equal(t, int64(0), c.QueuedAt)
				} else {
					require.Equal(t, "active", sale.Status)
					require.Equal(t, "queued", c.Status)
					if layout == "compact" {
						require.NotContains(t, string(c.Html), "countdown.gif")
					} else {
						require.Contains(t, string(c.Html), "countdown.gif")
					}
					require.NotContains(t, string(c.Html), "活动尚未启用")
					require.NotEqual(t, "old preview", string(c.Html))
				}
			})
		}
	}
}

func TestScheduledMailRejectsInactiveLinkAndPastDeadline(t *testing.T) {
	c := model.AdminMailCampaign{Status: "scheduled", SendAt: time.Now().Unix() + 60, Content: `<div data-model-sale="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">`}
	_, e := PrepareScheduledAdminMail(&c, time.Now())
	require.ErrorContains(t, e, "尚未到")
	c.SendAt = time.Now().Unix() - 3601
	_, e = PrepareScheduledAdminMail(&c, time.Now())
	require.ErrorContains(t, e, "延误")
}
