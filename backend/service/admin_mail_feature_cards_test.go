package service

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRenderAdminMailFeatureCardsKeepSanitizerBoundary(t *testing.T) {
	body := `<div data-mail-template="starry-mini-static"><div data-mail-block="columns"><div data-mail-block="column-app"><div data-mail-block="app-launch-card" style="width:9999px" onclick="alert(1)"><p data-mail-block="app-kicker">安卓 App · 新版</p><p data-mail-block="feature-metric">Android</p><p data-mail-block="feature-note">全新版已上线<br>常用功能随身用</p><div data-mail-block="feature-action"><a data-mail-button="app-launch" href="https://skymoni.com/app">下载新版 ↗</a></div></div></div><div data-mail-block="column-checkin"><div data-mail-block="daily-reward-card"><p data-mail-block="reward-kicker">签到福利 · 已提升</p><p data-mail-block="feature-metric">$1–$3</p><p data-mail-block="feature-note">站内可用额度<br>每天签到随机领</p><div data-mail-block="feature-action"><a data-mail-button="daily-reward" href="https://skymoni.com/profile">签到领取 ↗</a></div></div></div></div><img src="https://tracker.invalid/x"><a data-mail-button="daily-reward" href="javascript:alert(1)">unsafe</a></div>`
	rendered, err := RenderAdminMail("卡片预览", body, "html")
	require.NoError(t, err)
	for _, expected := range []string{"Android", "$1–$3", `href="https://skymoni.com/app"`, `href="https://skymoni.com/profile"`} {
		require.Contains(t, rendered, expected)
	}
	for _, forbidden := range []string{"9999px", "onclick", "javascript:", "tracker.invalid", "<img", "<script", "data-mail-", "display:flex", "display:grid"} {
		require.NotContains(t, rendered, forbidden)
	}
	// The opt-in pair never changes the established card appearance.
	legacy, err := RenderAdminMail("原卡片", `<div data-mail-template="starry-mini-static"><div data-mail-block="app-card"><h3>旧卡片</h3></div></div>`, "html")
	require.NoError(t, err)
	require.False(t, strings.Contains(legacy, "border-top:2px solid #66c5ff"))
}
