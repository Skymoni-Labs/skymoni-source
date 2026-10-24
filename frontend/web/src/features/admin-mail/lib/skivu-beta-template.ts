export const SKIVU_POSTER_FILENAME = 'Skivu-promo-20261024.jpg'
export const SKIVU_POSTER_URL = '/skivu/assets/skivu-poster-20261024.jpg'

export function betaMailAmount(value: string): string | null {
  const trimmed = value.trim()
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(trimmed) || Number(trimmed) <= 0) {
    return null
  }
  return Number(trimmed).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// Reuse the existing server-owned starry email blocks and image markers.
// This prepares content only: it never opens an account or allocates credit.
export function skivuBetaTemplate(amount: string, imageName?: string) {
  const display = betaMailAmount(amount)
  if (!display) throw new Error('请输入大于 0、最多两位小数的通知金额')
  if (imageName && !/^[a-f0-9]{64}\.(png|jpg|gif)$/.test(imageName)) {
    throw new Error('海报上传结果无效，请重试')
  }
  return {
    subject: `Skivu 内测已开通｜赠送 $${display} App 专属额度`,
    content: `<div data-mail-template="starry-compact-static">
<div data-mail-block="hero"><p data-mail-block="eyebrow">SKIVU · EARLY ACCESS</p><h1>你的 Skivu 内测，已开通。</h1><p data-mail-block="intro">一个属于你的 AI 空间。</p></div>
<div data-mail-block="feature"><p data-mail-block="eyebrow">APP 专属内测额度</p><h2>赠送 $${display}</h2><p>你的账号已开通 Skivu App 内测，并已获赠 <strong>$${display} App 专属内测额度</strong>。</p><p>内测额度与中转站余额独立计算，仅供 Skivu App 内的内测模型请求使用。余额与可用模型请以 App 和内测中心的实际显示为准。</p></div>
<div data-mail-block="guide"><h3>从这里开始</h3><ol><li>下载并安装 Skivu 安卓 App。</li><li>使用收到本邮件的同一站点账号登录。</li><li>选择模型与角色，开始属于你的对话。</li></ol><p>AI 对话、模型选择、角色陪伴、壁纸与外观配置，让同一个 App，慢慢成为你的样子。</p></div>
<div data-mail-block="actions"><a data-mail-button="primary" href="https://skymoni.com/skivu/download/latest.apk">下载 Skivu 安卓 App</a> <a data-mail-button="secondary" href="https://skymoni.com/creators/skivu-beta">查看内测额度</a></div>
${imageName ? `<div data-mail-image="${imageName}"></div>` : ''}
<div data-mail-block="signoff"><p>感谢你参与 Skivu 内测。欢迎通过社区分享体验与建议。</p><a href="https://skymoni.com/skivu/">探索 Skivu</a></div>
</div>`,
  }
}
