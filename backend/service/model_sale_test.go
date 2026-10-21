package service

import (
	"bytes"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"image/gif"
	"strings"
	"testing"
	"time"
)

func TestModelSaleGIFRealFlipNoLoopAndExpiry(t *testing.T) {
	sale := model.ModelSale{ID: strings.Repeat("a", 32), Status: "active", EndAt: time.Now().Unix() + 120, Config: model.ModelSaleConfig{CountdownMode: "end"}}
	data, e := RenderModelSaleCountdownGIF(sale, time.Now())
	require.NoError(t, e)
	decoded, e := gif.DecodeAll(bytes.NewReader(data))
	require.NoError(t, e)
	require.Len(t, decoded.Image, 241)
	require.Equal(t, -1, decoded.LoopCount)
	require.NotEqual(t, decoded.Image[0].Pix, decoded.Image[1].Pix)
	require.NotEqual(t, decoded.Image[0].Pix, decoded.Image[240].Pix)
	elapsed := 0
	for _, d := range decoded.Delay {
		elapsed += d
	}
	require.Equal(t, 6100, elapsed)
	require.Less(t, len(data), 2*1024*1024)
	sale.Status = "ended"
	data, e = RenderModelSaleCountdownGIF(sale, time.Now())
	require.NoError(t, e)
	decoded, e = gif.DecodeAll(bytes.NewReader(data))
	require.NoError(t, e)
	require.Len(t, decoded.Image, 1)
}
func TestModelSaleMailOnlyOwnedImageAndHonestDraft(t *testing.T) {
	db, e := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, e)
	old := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = old; sql, _ := db.DB(); sql.Close() })
	require.NoError(t, db.AutoMigrate(&model.ModelSale{}))
	id := strings.Repeat("b", 32)
	sale := model.ModelSale{ID: id, Title: "<test>", Status: "draft", StartAt: time.Now().Unix() + 3600, EndAt: time.Now().Unix() + 7200, Config: model.ModelSaleConfig{CountdownMode: "end", Discount: 5}}
	require.NoError(t, db.Create(&sale).Error)
	rendered, e := RenderAdminMail("Test", `<div data-mail-template="starry-mini-static"><p>hello</p><div data-model-sale="`+id+`">insert</div><img src="https://evil.example/x"><script>alert(1)</script></div>`, "html")
	require.NoError(t, e)
	require.Contains(t, rendered, "countdown.gif")
	require.Contains(t, rendered, "活动尚未启用")
	require.Contains(t, rendered, "北京时间")
	require.Contains(t, rendered, "&lt;test&gt;")
	require.NotContains(t, rendered, "evil.example")
	require.NotContains(t, rendered, "<script")
	plain, e := RenderAdminMail("Test", "hello", "text")
	require.NoError(t, e)
	require.NotContains(t, plain, "countdown.gif")
	_, e = RenderAdminMail("Test", `<div data-model-sale="`+strings.Repeat("a", 32)+`">x</div>`, "html")
	require.Error(t, e)
}
func TestModelSaleMailMergeReplacesOldCountdownAtTop(t *testing.T) {
	id := strings.Repeat("d", 32)
	source := `<div data-mail-template="starry-mini-static"><h1>App 上新</h1><div data-model-sale="` + strings.Repeat("e", 32) + `">old</div><p>签到福利</p></div>`
	merged, err := InsertModelSaleMail(source, id)
	require.NoError(t, err)
	require.Equal(t, 1, strings.Count(merged, "data-model-sale"))
	require.Contains(t, merged, "App 上新")
	require.Contains(t, merged, "签到福利")
	require.Less(t, strings.Index(merged, "data-model-sale"), strings.Index(merged, "<h1>"))
	_, err = InsertModelSaleMail(source, `<img>`)
	require.Error(t, err)
}
func TestModelSaleInactiveMailRequiresExplicitTestRecipients(t *testing.T) {
	db, e := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, e)
	old := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = old; s, _ := db.DB(); s.Close() })
	require.NoError(t, db.AutoMigrate(&model.ModelSale{}, &model.Option{}))
	id := strings.Repeat("f", 32)
	require.NoError(t, db.Create(&model.ModelSale{ID: id, Title: "真实新标题", Status: "draft", StartAt: time.Now().Unix() + 60, EndAt: time.Now().Unix() + 3600, Config: model.ModelSaleConfig{Models: []string{}, Discount: 3, Policy: model.DefaultModelSalePolicy(), CountdownMode: "end"}}).Error)
	campaign := &model.AdminMailCampaign{Subject: "Test", Format: "html", Audience: "all_users", Content: model.PopupNoticeContent(`<div data-model-sale="` + id + `">stale</div>`), Html: model.PopupNoticeContent("old snapshot")}
	_, e = PrepareModelSaleMailForSend(campaign)
	require.ErrorContains(t, e, "不能向用户群发")
	campaign.Audience = "emails"
	rendered, e := PrepareModelSaleMailForSend(campaign)
	require.NoError(t, e)
	require.Contains(t, rendered, "真实新标题")
	require.Contains(t, rendered, "活动尚未启用")
	require.NotContains(t, rendered, "old snapshot")
}
