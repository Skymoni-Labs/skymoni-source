package service

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestMailCapsulesOnlyUseServerOwnedIllustration(t *testing.T) {
	body := `<div data-mail-template="starry-mini-static"><div data-mail-block="pocket-card"><div data-mail-block="pocket-mascot"><img src="https://tracker.invalid/a"><script>alert(1)</script></div><p>安卓 App</p><a data-mail-button="pocket" href="https://skymoni.com/app">下载</a></div><div data-mail-block="supply-card"><p data-mail-block="supply-orbit">$1–$3 ✦</p><a data-mail-button="supply" href="https://skymoni.com/profile">签到</a></div></div>`
	html, err := RenderAdminMail("上新", body, "html")
	require.NoError(t, err)
	require.Contains(t, html, `https://skymoni.com/branding/skymoni-cloud-friend-transparent.png`)
	require.Contains(t, html, `$1–$3`)
	require.Contains(t, html, `border-radius:18px 18px 5px 18px`)
	for _, bad := range []string{"tracker.invalid", "<script", "data-mail-", "display:flex", "display:grid"} {
		require.NotContains(t, html, bad)
	}
}
