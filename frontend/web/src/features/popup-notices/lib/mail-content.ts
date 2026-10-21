const mailImageName = /^[a-f0-9]{64}\.(png|jpg|gif)$/
export const popupImageLimit = 4

export function popupImageMarkup(name: string): string {
  if (!mailImageName.test(name)) throw new Error('图片上传结果无效，请重试')
  return `<div data-mail-image="${name}"></div>`
}

// These are the same saved layout tokens used by email drafts. Keep their
// authored source intact; materialize them only in the popup's isolated view.
export function preparePopupMailContent(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('div[data-mail-image]').forEach((block) => {
    const name = block.getAttribute('data-mail-image') ?? ''
    if (!mailImageName.test(name)) {
      block.remove()
      return
    }
    const image = document.createElement('img')
    image.src = `https://skymoni.com/api/admin-mail-images/${name}`
    image.alt = '弹窗配图'
    image.style.cssText =
      'display:block;width:100%;max-width:600px;height:auto;margin:16px auto;border-radius:12px'
    block.replaceChildren(image)
  })
  document.querySelectorAll('[data-mail-template]').forEach((root) => {
    if (
      /^(starry|starry-motion|starry-compact|starry-compact-sky|starry-compact-static|starry-mini-static)$/.test(
        root.getAttribute('data-mail-template') ?? ''
      )
    ) {
      root.classList.add('popup-mail-template')
    }
  })
  document.querySelectorAll('img').forEach((image) => {
    image.setAttribute('loading', 'lazy')
    image.setAttribute('decoding', 'async')
    image.setAttribute('referrerpolicy', 'no-referrer')
  })
  return (
    [...document.head.querySelectorAll('style')]
      .map((style) => style.outerHTML)
      .join('') + document.body.innerHTML
  )
}

export const popupRichContentStyles = `<style>
:where(h1){font-size:26px;font-weight:700;line-height:1.35;margin:0 0 16px}
:where(h2){font-size:21px;font-weight:700;line-height:1.4;margin:0 0 12px}
:where(h3){font-size:18px;font-weight:600;line-height:1.5;margin:0 0 10px}
:where(p){line-height:1.75;margin:0 0 12px}
:where(ul,ol){margin:0 0 14px;padding-left:24px;line-height:1.75}
:where(ul){list-style-type:disc}:where(ol){list-style-type:decimal}
:where(li){margin:0 0 6px}:where(a){color:#38a8ed;text-decoration:underline}
:host{overflow-wrap:anywhere}img,video{max-width:100%!important;height:auto!important}
table,pre{display:block;max-width:100%!important;overflow-x:auto}
.popup-mail-template{box-sizing:border-box;width:100%;max-width:620px;margin:0 auto;padding:22px 18px;border:1px solid #29405f;border-radius:16px;background:linear-gradient(145deg,#10203a,#0b1526);color:#c1cde0;font:14px/1.75 Arial,'Microsoft YaHei',sans-serif}
.popup-mail-template :where(h1,h2,h3,h4,h5,h6){color:#f4f7ff}
.popup-mail-template :where(h1){font-size:28px;margin:6px 0 12px;letter-spacing:.5px}
.popup-mail-template :where(h2){font-size:21px;margin:0 0 10px}
.popup-mail-template :where(h3){font-size:17px}
.popup-mail-template [data-mail-block="hero"]{text-align:center;padding:0 0 18px}
.popup-mail-template [data-mail-block="intro"]{font-size:14px;line-height:1.85;margin:0;color:#c1cde0}
.popup-mail-template [data-mail-block="eyebrow"]{font-size:12px;line-height:1.6;letter-spacing:.6px;font-weight:700;color:#83caff;margin:0 0 8px}
.popup-mail-template [data-mail-block="traffic"],.popup-mail-template [data-mail-block="feature"],.popup-mail-template [data-mail-block="spotlight"]{text-align:center;background:#151e34;border:1px solid #34405b;border-radius:12px;padding:18px 12px;margin:0 0 18px}
.popup-mail-template [data-mail-block="section"]{text-align:center;padding:4px 0 16px}
.popup-mail-template [data-mail-block="signoff"]{text-align:center;padding:18px 0 0;border-top:1px solid #29405f}
.popup-mail-template [data-mail-block="signoff"] p:last-child{margin-bottom:0}
.popup-mail-template [data-mail-block="columns"]{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 18px}
.popup-mail-template [data-mail-block^="column"]:not([data-mail-block="columns"]){flex:1 1 180px;min-width:0}
.popup-mail-template [data-mail-block$="card"]{padding:16px;border:1px solid #345a83;border-radius:12px;background:#122b48;margin-bottom:12px}
.popup-mail-template [data-mail-button]{display:inline-block;padding:9px 14px;border-radius:8px;border:1px solid #36597f;background:#142b45;color:#a0dbff;text-decoration:none;font-weight:700}
.popup-mail-template [data-mail-button="primary"],.popup-mail-template [data-mail-button="app-launch"]{background:#66c5ff;color:#071524;border-color:#66c5ff}
</style>`
