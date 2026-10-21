package service

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestRenderAdminMailStarryCompact(t *testing.T) {
	body := `<div data-mail-template="starry-compact"><div data-mail-block="columns"><div data-mail-block="column-app"><div data-mail-block="app-card"><h2>安卓 App</h2><a data-mail-button="primary" href="https://skymoni.com/app">下载</a></div></div><div data-mail-block="column-checkin"><div data-mail-block="checkin-card"><h2>签到</h2><p>$1–$3</p></div></div></div><img src="https://tracker.invalid/x"><script>alert(1)</script><p style="position:fixed" onclick="alert(1)">正文</p></div>`
	rendered, err := RenderAdminMail("紧凑版", body, "html")
	require.NoError(t, err)
	require.Contains(t, rendered, common.MailStarBannerPreviewHTML)
	require.Contains(t, rendered, "width:50%;box-sizing:border-box")
	require.Contains(t, rendered, "padding:8px 10px;font-size:13px")
	require.Contains(t, rendered, "$1–$3")
	for _, forbidden := range []string{"<img", "<script", "tracker.invalid", "position:fixed", "onclick", "data-mail-", "min-height:268px", starryMailAnimationURL} {
		require.NotContains(t, rendered, forbidden)
	}
}

func TestRenderAdminMailStarryCompactWholeSky(t *testing.T) {
	body := `<div data-mail-template="starry-compact-sky"><div data-mail-block="column-app"><div data-mail-block="app-card"><h2>App</h2></div></div><div data-mail-block="spotlight"><p>最后一项正文</p></div><img src="https://tracker.invalid/x"><p style="background:url(https://tracker.invalid)">safe</p><script>alert(1)</script></div>`
	rendered, err := RenderAdminMail("整体星空", body, "html")
	require.NoError(t, err)
	require.Contains(t, rendered, common.MailStarSkyPreviewCell)
	require.Contains(t, rendered, "width:50%;box-sizing:border-box")
	require.Contains(t, rendered, "background:rgba(18,43,72,.72)")
	// The background-bearing cell encloses both the final section and footer.
	cell := strings.SplitN(rendered, common.MailStarSkyPreviewCell, 2)
	require.Len(t, cell, 2)
	require.Contains(t, strings.SplitN(cell[1], "</td>", 2)[0], "最后一项正文")
	require.Contains(t, strings.SplitN(cell[1], "</td>", 2)[0], "如需帮助")
	for _, forbidden := range []string{common.MailStarBannerURL, common.MailStarBannerPreviewHTML, "tracker.invalid", "<img", "<script", "data-mail-", "min-height:268px"} {
		require.NotContains(t, rendered, forbidden)
	}
}

func TestRenderAdminMailStaticSkyUsesOrdinaryFullBackground(t *testing.T) {
	content := `<div data-mail-template="starry-compact-static"><div data-mail-block="column-checkin"><div data-mail-block="checkin-card"><h2>签到额度提升</h2><p>$1–$3 站内额度</p></div></div><div data-mail-block="traffic"><h3>流量代理套餐</h3></div><p style="background:url(https://tracker.invalid)">safe</p><img src="https://tracker.invalid/x"><script>alert(1)</script></div>`
	rendered, err := RenderAdminMail("静态整页星空", content, "html")
	require.NoError(t, err)
	require.Contains(t, rendered, common.MailStaticSkyPreviewCell)
	require.Contains(t, rendered, "width:50%;box-sizing:border-box")
	cell := strings.SplitN(rendered, common.MailStaticSkyPreviewCell, 2)
	require.Len(t, cell, 2)
	require.Contains(t, strings.SplitN(cell[1], "</td>", 2)[0], "流量代理套餐")
	require.Contains(t, strings.SplitN(cell[1], "</td>", 2)[0], "如需帮助")
	for _, bad := range []string{"cid:", ".gif", "<img", "<script", "tracker.invalid", "data-mail-", common.MailStarBannerURL, common.MailStarSkyURL} {
		require.NotContains(t, rendered, bad)
	}
}

func TestRenderAdminMailStarry(t *testing.T) {
	content := `<div data-mail-template="starry"><div data-mail-block="hero"><h1>安卓 App 全面上新</h1><p>签到福利提升</p></div><div data-mail-block="feature"><h2>下载</h2><a data-mail-button="primary" href="https://skymoni.com/app">下载安卓 App</a></div></div>`
	rendered, err := RenderAdminMail("通知 <测试>", content, "html")
	require.NoError(t, err)
	require.Contains(t, rendered, `bgcolor="#080f20"`)
	require.Contains(t, rendered, `background:#37aaff;color:#071120`)
	require.Contains(t, rendered, `border-radius:16px;padding:22px`)
	require.Contains(t, rendered, `<title>通知 &lt;测试&gt;</title>`)
	require.Contains(t, rendered, `href="https://skymoni.com/app"`)
	require.Contains(t, rendered, "安卓 App 全面上新")
	require.NotContains(t, rendered, "data-mail-")
	// Sanitization precedes every server-owned style, even in the new preset.
	malicious := strings.Replace(content, "签到福利提升", `<script>alert(1)</script><img src="https://tracker.invalid/pixel"><p style="color:red;background:url(https://tracker.invalid/x)" onclick="alert(2)">safe</p><a data-mail-button="primary" href="javascript:alert(3)">unsafe</a>`, 1)
	rendered, err = RenderAdminMail("服务更新", malicious, "html")
	require.NoError(t, err)
	for _, forbidden := range []string{"<script", "<img", "onclick", "javascript:", "tracker.invalid", "color:red"} {
		require.NotContains(t, rendered, forbidden)
	}
	require.Contains(t, rendered, "safe")
}

func TestRenderAdminMailStarryRequiresExactRoot(t *testing.T) {
	for _, body := range []string{
		`<div data-mail-template="unknown"><h1>Hello</h1></div>`,
		`<div data-mail-template="starry-extra"><h1>Hello</h1></div>`,
		`<p>outside</p><div data-mail-template="starry"><h1>Hello</h1></div>`,
		`<div><div data-mail-template="starry"><h1>Hello</h1></div></div>`,
	} {
		rendered, err := RenderAdminMail("通知", body, "html")
		require.NoError(t, err)
		require.NotContains(t, rendered, `bgcolor="#080f20"`)
		require.Contains(t, rendered, "background:#f3f8fb")
	}
	for _, format := range []string{"markdown", "text"} {
		rendered, err := RenderAdminMail("常规通知", "Hello\n\n**world**", format)
		require.NoError(t, err)
		require.Contains(t, rendered, "background:#f3f8fb")
		require.NotContains(t, rendered, `bgcolor="#080f20"`)
	}
}

func TestRenderAdminMailStarryResponsiveBlocks(t *testing.T) {
	content := `<div data-mail-template="starry"><div data-mail-block="hero"><h1>上新</h1></div><div data-mail-block="columns" style="position:fixed"><div data-mail-block="column-app"><div data-mail-block="app-card">App</div></div><div data-mail-block="column-checkin"><div data-mail-block="checkin-card">签到</div></div></div><p data-mail-block="column-app-extra" style="width:9999px">其他</p></div>`
	rendered, err := RenderAdminMail("上新", content, "html")
	require.NoError(t, err)
	// Hybrid columns can shrink to 100% of a phone viewport without relying on
	// media-query style tags, which are removed by the administration preview.
	require.Contains(t, rendered, "width:100%;max-width:281px;box-sizing:border-box")
	require.Contains(t, rendered, "width:100%;max-width:281px;box-sizing:border-box")
	require.Contains(t, rendered, "text-align:center;padding:4px 0 26px")
	require.Contains(t, rendered, "background:#211d3d")
	for _, forbidden := range []string{"data-mail-", "position:fixed", "9999px", "<style", "<script"} {
		require.NotContains(t, rendered, forbidden)
	}
}

func TestRenderAdminMailStarryMotionUsesOnlyOwnedBackground(t *testing.T) {
	content := `<div data-mail-template="starry-motion"><div data-mail-block="hero" style="background:url(https://tracker.invalid/pixel)"><h1>上新</h1><script>alert(1)</script><img src="https://tracker.invalid/image"></div></div>`
	rendered, err := RenderAdminMail("动态星空", content, "html")
	require.NoError(t, err)
	require.Contains(t, rendered, "background-image:url('"+starryMailAnimationURL+"'),radial-gradient")
	require.Contains(t, rendered, "background-size:100% auto")
	require.Contains(t, rendered, "background-color:#0c1527")
	require.Contains(t, rendered, "<h1")
	for _, forbidden := range []string{"tracker.invalid", "<img", "<script", "data-mail-"} {
		require.NotContains(t, rendered, forbidden)
	}
	for _, marker := range []string{"starry", "starry-motion-extra"} {
		static, err := RenderAdminMail("静态", strings.Replace(content, "starry-motion", marker, 1), "html")
		require.NoError(t, err)
		require.NotContains(t, static, starryMailAnimationURL)
	}
}
