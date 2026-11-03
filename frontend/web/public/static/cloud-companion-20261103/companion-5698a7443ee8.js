/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Skymoni cloud companion. No account, API, or model requests are made here.
 */
;(() => {
  if (document.querySelector('#skymoni-cloud-companion')) return
  const host = document.createElement('div')
  host.id = 'skymoni-cloud-companion'
  host.hidden = true
  const shadow = host.attachShadow({ mode: 'open' })
  const stylesheet = document.createElement('link')
  stylesheet.rel = 'stylesheet'
  stylesheet.href =
    '/static/cloud-companion-20261103/companion-b662c5496304.css'
  const template = document.createElement('template')
  // The template is a static, bundled asset. No user or server HTML is inserted.
  template.innerHTML = String.raw`  <aside class="companion" id="companion" aria-label="云朵伙伴">
    <div class="speech-bubble" id="speech-bubble" role="status" aria-live="polite" hidden></div>
    <button class="support-hint" id="support-hint" type="button" aria-controls="support-panel" aria-expanded="false" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0v5a3 3 0 0 1-3 3h-3M4 11H3v6h4v-6H4Zm16 0h1v6h-4v-6h3Z"/><path d="M11 19h3"/></svg>
      <span><strong>需要帮助？</strong><small>点我联系客服</small></span>
      <span class="support-hint-arrow" aria-hidden="true">↗</span>
    </button>
    <section class="support-panel" id="support-panel" role="dialog" aria-labelledby="support-title" aria-describedby="support-description" hidden>
      <div class="support-heading">
        <span class="support-kicker">SKYMONI SUPPORT</span>
        <h2 id="support-title">小云帮你联系</h2>
        <button class="support-close" id="support-close" type="button" aria-label="关闭客服入口">×</button>
      </div>
      <p id="support-description">使用咨询、问题反馈和售后支持，都可以从这里找到我们。</p>
      <div class="support-group">
        <span>App 内测与售后 QQ 交流群</span>
        <strong>673994374</strong>
        <button id="copy-support-group" type="button">复制群号 <span aria-hidden="true">↗</span></button>
      </div>
      <a class="support-email" href="mailto:792521914@qq.com"><span>客服邮箱<small>792521914@qq.com</small></span><span aria-hidden="true">↗</span></a>
      <p class="support-feedback" id="support-feedback" role="status" aria-live="polite">打开 QQ，搜索群号即可加入。</p>
    </section>
    <section class="size-panel" id="size-panel" role="dialog" aria-labelledby="size-panel-title" hidden>
      <div class="support-heading">
        <span class="support-kicker">MAKE YOURSELF COMFORTABLE</span>
        <h2 id="size-panel-title">小云的大小，你来定</h2>
        <button class="support-close" id="size-panel-close" type="button" aria-label="关闭大小设置">×</button>
      </div>
      <button class="wave-control" id="widget-wave" type="button">挥挥手 ✋</button>
      <label class="widget-size-label" for="widget-size-control">自由调整 <output id="widget-size-value" for="widget-size-control">178 px</output></label>
      <input id="widget-size-control" class="widget-size-control" type="range" min="64" max="300" value="178">
      <div class="size-range-labels" aria-hidden="true"><span>更小巧</span><span>更显眼</span></div>
      <p>自由选择舒服的大小，也可以收成小入口。设置会保存在当前设备。</p>
      <div class="size-panel-actions">
        <button id="compact-button" type="button">收成小入口</button>
        <button id="reset-size-button" type="button">恢复默认大小</button>
      </div>
    </section>
    <section class="reward-panel" id="reward-panel" role="dialog" aria-labelledby="reward-title" hidden>
      <button class="support-close" id="reward-close" type="button" aria-label="收好小惊喜">×</button>
      <span class="reward-star" aria-hidden="true">✦</span>
      <span class="support-kicker">A LITTLE SURPRISE FOR YOU</span>
      <h2 id="reward-title">小云藏了一份小惊喜</h2>
      <p>送你一个兑换码</p>
      <div class="reward-code"><code>caidan</code><button id="copy-reward-code" type="button">复制兑换码 <span aria-hidden="true">↗</span></button></div>
      <p class="reward-feedback" id="reward-feedback" role="status" aria-live="polite">谢谢你来陪小云玩 ✧</p>
    </section>
    <button class="companion-size-button" id="companion-size-button" type="button" aria-label="调整小云大小" aria-controls="size-panel" aria-haspopup="dialog" aria-expanded="false">⚙</button>
    <button class="companion-close" id="companion-close" type="button" aria-label="收起云朵伙伴">×</button>
    <button class="character-button" id="character-button" type="button" aria-label="小云，点击打招呼，也可以拖动位置，方向键移动">
      <span class="character-shadow" aria-hidden="true"></span>
      <span class="character-motion" id="character-motion">
        <svg class="character-art view-front" viewBox="140 30 600 660" aria-hidden="true">
          <defs>
            <clipPath id="front-body-clip"><rect x="140" y="437" width="600" height="250"/></clipPath>
            <clipPath id="front-head-clip"><rect x="140" y="20" width="600" height="442"/></clipPath>
            <path id="right-arm-shape" d="M533 465 C566 478 594 504 608 532 C623 562 605 585 580 580 C559 578 548 559 544 541 L529 495 Z"/>
            <clipPath id="right-arm-clip"><use href="#right-arm-shape"/></clipPath>
            <mask id="body-arm-mask" maskUnits="userSpaceOnUse" x="140" y="437" width="600" height="250"><rect x="140" y="437" width="600" height="250" fill="white"/><path d="M530 462 H650 V604 H543 L548 554 L532 511 Z" fill="black"/></mask>
            <linearGradient id="shoulder-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffefa"/><stop offset="1" stop-color="#e8f8ff"/></linearGradient>
            <radialGradient id="eye-cover"><stop offset="0" stop-color="#fffefa"/><stop offset="1" stop-color="#fbfdfb"/></radialGradient>
          </defs>
          <g class="cloud-body" clip-path="url(#front-body-clip)">
            <g><path d="M514 461 C542 477 551 515 549 554 L545 606 L514 610 Z" fill="url(#shoulder-fill)"/><path d="M534 501 C547 529 551 563 544 602" fill="none" stroke="#35b4ee" stroke-width="10" stroke-linecap="round"/></g>
            <image href="/static/cloud-companion-20261103/cloud-99bd277a80b6.png" width="2172" height="724" mask="url(#body-arm-mask)"/>
          </g>
          <g class="head-look"><g class="cloud-head">
            <g clip-path="url(#front-head-clip)"><image href="/static/cloud-companion-20261103/cloud-99bd277a80b6.png" width="2172" height="724"/></g>
            <g class="blink-lids"><ellipse cx="356" cy="331" rx="39" ry="43" fill="url(#eye-cover)"/><ellipse cx="514" cy="331" rx="40" ry="43" fill="url(#eye-cover)"/><path d="M335 332 Q355 347 377 332 M493 332 Q514 347 535 332" fill="none" stroke="#329dda" stroke-width="8" stroke-linecap="round"/></g>
          </g></g>
          <g class="cloud-body"><g transform="rotate(0 535 486)">
            <animateTransform id="hand-wave-animation" attributeName="transform" type="rotate" begin="indefinite" dur="2s" fill="remove" calcMode="spline" keyTimes="0;.2;.32;.44;.56;.68;1" keySplines=".4 0 .2 1;.4 0 .2 1;.4 0 .2 1;.4 0 .2 1;.4 0 .2 1;.4 0 .2 1" values="0 535 486;-90 535 486;-120 535 486;-82 535 486;-115 535 486;-90 535 486;0 535 486"/>
            <image href="/static/cloud-companion-20261103/cloud-99bd277a80b6.png" width="2172" height="724" clip-path="url(#right-arm-clip)"/>
          </g></g>
        </svg>
      </span>
      <span class="touch-hint" aria-hidden="true">点点我 · 拖着走</span>
    </button>
    <span class="greeting-spark spark-a" aria-hidden="true">✦</span><span class="greeting-spark spark-b" aria-hidden="true">✧</span>
  </aside>
  <button class="restore-companion" id="restore-companion" type="button" aria-label="展开云朵伙伴" title="展开小云" hidden><span aria-hidden="true">☁</span><span class="restore-label">叫小云回来</span></button>`
  shadow.append(stylesheet, template.content.cloneNode(true))
  document.body.append(host)
  const legacyStyle = document.createElement('style')
  legacyStyle.textContent =
    'html[data-skymoni-cloud-companion="enabled"] .sky-cloud-companion { display: none !important; }'
  document.head.append(legacyStyle)
  let stylesheetReady = false

  function readDecorationsEnabled() {
    try {
      return localStorage.getItem('skymoni:sky-decorations:v1') !== 'off'
    } catch {
      return true
    }
  }

  function updateVisibility(enabled) {
    host.hidden = !stylesheetReady || !enabled
    document.documentElement.setAttribute(
      'data-skymoni-cloud-companion',
      host.hidden ? 'disabled' : 'enabled'
    )
    if (host.hidden) stopAction()
    else positionFloatingContent()
  }

  stylesheet.addEventListener('load', () => {
    stylesheetReady = true
    updateVisibility(readDecorationsEnabled())
  })
  stylesheet.addEventListener('error', () => updateVisibility(false))
  window.addEventListener('skymoni:sky-decorations-change', (event) =>
    updateVisibility(event.detail)
  )
  window.addEventListener('storage', (event) => {
    if (event.key === 'skymoni:sky-decorations:v1' || event.key === null) {
      updateVisibility(readDecorationsEnabled())
    }
  })
  const companion = shadow.querySelector('#companion')
  const character = shadow.querySelector('#character-button')
  const speech = shadow.querySelector('#speech-bubble')
  const restoreButton = shadow.querySelector('#restore-companion')
  const supportHint = shadow.querySelector('#support-hint')
  const supportPanel = shadow.querySelector('#support-panel')
  const supportClose = shadow.querySelector('#support-close')
  const supportFeedback = shadow.querySelector('#support-feedback')
  const sizePanel = shadow.querySelector('#size-panel')
  const sizeButton = shadow.querySelector('#companion-size-button')
  const sizePanelClose = shadow.querySelector('#size-panel-close')
  const widgetSizeControl = shadow.querySelector('#widget-size-control')
  const widgetSizeValue = shadow.querySelector('#widget-size-value')
  const rewardPanel = shadow.querySelector('#reward-panel')
  const rewardClose = shadow.querySelector('#reward-close')
  const rewardFeedback = shadow.querySelector('#reward-feedback')
  const handWave = shadow.querySelector('#hand-wave-animation')
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  const mobileLayout = window.matchMedia('(max-width: 760px)')
  const actions = ['wave', 'hop', 'nod', 'wiggle', 'peek', 'spring']
  const greetings = [
    '嗨，我是小云。很高兴见到你 ✦',
    '你慢慢逛，我就在这里陪着你。',
    '今天也捡到一个好点子了吗？',
    '收到你的摸摸啦，给你一颗小星星 ✧',
  ]
  let greetingIndex = 0
  let actionIndex = 0
  let mascotClicks = 0
  let speechTimer
  let greetingTimer
  let blinkTimer
  let blinkEndTimer
  let drag = null
  let suppressClick = false
  let manuallyPositioned = false
  let preferredSize = null
  let compactMode = false
  let activeLayout = mobileLayout.matches ? 'mobile' : 'desktop'

  function savePreferences() {
    try {
      localStorage.setItem(
        `skymoni:cloud-companion:${activeLayout}:v1`,
        JSON.stringify({ size: preferredSize, compact: compactMode })
      )
    } catch {
      // Size controls remain available when device storage is unavailable.
    }
  }

  function defaultSize() {
    return mobileLayout.matches ? 96 : 178
  }

  function applySize(requestedSize, remember = true) {
    const bounds = companion.getBoundingClientRect()
    const maximum = Math.max(
      64,
      Math.floor(
        Math.min(
          300,
          document.documentElement.clientWidth - 40,
          (window.innerHeight - 112) / 1.1
        )
      )
    )
    const size = Math.round(Math.max(64, Math.min(requestedSize, maximum)))
    companion.style.setProperty('--size', `${size}px`)
    widgetSizeControl.max = String(maximum)
    widgetSizeControl.value = String(size)
    widgetSizeValue.value = `${size} px`
    if (manuallyPositioned && !companion.hidden) moveTo(bounds.left, bounds.top)
    positionFloatingContent()
    if (remember) {
      preferredSize = size
      savePreferences()
    }
    return size
  }

  function loadPreferences() {
    activeLayout = mobileLayout.matches ? 'mobile' : 'desktop'
    preferredSize = null
    compactMode = false
    try {
      const saved = JSON.parse(
        localStorage.getItem(`skymoni:cloud-companion:${activeLayout}:v1`)
      )
      if (typeof saved?.size === 'number' && Number.isFinite(saved.size)) {
        preferredSize = saved.size
      }
      compactMode = saved?.compact === true
    } catch {
      // Invalid or unavailable stored preferences use the responsive defaults.
    }
    companion.hidden = compactMode
    restoreButton.hidden = !compactMode
    restoreButton.classList.toggle('is-compact', compactMode)
    applySize(preferredSize ?? defaultSize(), false)
  }

  function positionFloatingContent() {
    if (companion.hidden) return
    const bounds = companion.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    for (const element of [
      speech,
      supportHint,
      supportPanel,
      sizePanel,
      rewardPanel,
    ]) {
      if (element.hidden) continue
      element.style.maxWidth = `${viewportWidth - 24}px`
      const floatingBounds = element.getBoundingClientRect()
      const left = Math.max(
        12,
        Math.min(
          bounds.left + bounds.width / 2 - floatingBounds.width / 2,
          viewportWidth - floatingBounds.width - 12
        )
      )
      const above = bounds.top >= floatingBounds.height + 24
      const top = above
        ? bounds.top - floatingBounds.height - 12
        : bounds.bottom + 12
      const safeTop = Math.max(
        12,
        Math.min(top, window.innerHeight - floatingBounds.height - 12)
      )
      element.style.left = `${left - bounds.left}px`
      element.style.top = `${safeTop - bounds.top}px`
      element.style.bottom = 'auto'
      element.dataset.placement = above ? 'above' : 'below'
    }
  }

  function closeSupport(restoreFocus = true) {
    supportPanel.hidden = true
    supportHint.hidden =
      !speech.hidden || !sizePanel.hidden || !rewardPanel.hidden
    supportHint.setAttribute('aria-expanded', 'false')
    positionFloatingContent()
    if (restoreFocus) supportHint.focus({ preventScroll: true })
  }

  function openSupport() {
    clearTimeout(speechTimer)
    speech.hidden = true
    closeReward(false)
    closeSizeSettings(false)
    supportHint.hidden = true
    supportPanel.hidden = false
    supportHint.setAttribute('aria-expanded', 'true')
    positionFloatingContent()
    supportClose.focus({ preventScroll: true })
  }

  function closeSizeSettings(restoreFocus = true) {
    sizePanel.hidden = true
    sizeButton.setAttribute('aria-expanded', 'false')
    supportHint.hidden =
      !speech.hidden || !supportPanel.hidden || !rewardPanel.hidden
    positionFloatingContent()
    if (restoreFocus) sizeButton.focus({ preventScroll: true })
  }

  function openSizeSettings() {
    clearTimeout(speechTimer)
    speech.hidden = true
    closeReward(false)
    closeSupport(false)
    supportHint.hidden = true
    sizePanel.hidden = false
    sizeButton.setAttribute('aria-expanded', 'true')
    positionFloatingContent()
    widgetSizeControl.focus({ preventScroll: true })
  }

  function resetSize() {
    preferredSize = null
    applySize(defaultSize(), false)
    savePreferences()
  }

  function enterCompactMode() {
    hideCompanion()
    compactMode = true
    restoreButton.classList.add('is-compact')
    savePreferences()
  }

  function closeReward(restoreFocus = true) {
    rewardPanel.hidden = true
    supportHint.hidden =
      !speech.hidden || !supportPanel.hidden || !sizePanel.hidden
    positionFloatingContent()
    if (restoreFocus) character.focus({ preventScroll: true })
  }

  function showReward() {
    clearTimeout(speechTimer)
    speech.hidden = true
    closeSupport(false)
    closeSizeSettings(false)
    supportHint.hidden = true
    rewardFeedback.textContent = '谢谢你来陪小云玩 ✧'
    rewardPanel.hidden = false
    positionFloatingContent()
    rewardClose.focus({ preventScroll: true })
  }

  function speak(message) {
    clearTimeout(speechTimer)
    closeReward(false)
    closeSizeSettings(false)
    closeSupport(false)
    supportHint.hidden = true
    speech.textContent = message
    speech.hidden = false
    positionFloatingContent()
    speechTimer = setTimeout(() => {
      speech.hidden = true
      supportHint.hidden = false
      positionFloatingContent()
    }, 4500)
  }

  function showCompanion() {
    companion.hidden = false
    restoreButton.hidden = true
    restoreButton.classList.remove('is-compact')
    if (compactMode) {
      compactMode = false
      savePreferences()
    }
    if (manuallyPositioned) {
      const bounds = companion.getBoundingClientRect()
      moveTo(bounds.left, bounds.top)
    }
  }

  function stopAction() {
    clearTimeout(greetingTimer)
    if (
      companion.dataset.action === 'wave' &&
      typeof handWave.endElement === 'function'
    ) {
      handWave.endElement()
    }
    companion.classList.remove('is-greeting')
    companion.removeAttribute('data-action')
  }

  function greet(action = actions[actionIndex % actions.length]) {
    showCompanion()
    stopAction()
    void companion.offsetWidth
    companion.dataset.action = action
    actionIndex += 1
    companion.classList.add('is-greeting')
    if (
      action === 'wave' &&
      !motionPreference.matches &&
      typeof handWave.beginElement === 'function'
    ) {
      handWave.beginElement()
    }
    greetingTimer = setTimeout(stopAction, action === 'wave' ? 2100 : 1400)
    speak(greetings[greetingIndex % greetings.length])
    greetingIndex += 1
  }

  function hideCompanion() {
    stopAction()
    companion.hidden = true
    restoreButton.hidden = false
    speech.hidden = true
    clearTimeout(speechTimer)
    closeReward(false)
    closeSizeSettings(false)
    closeSupport(false)
    restoreButton.focus({ preventScroll: true })
  }

  function moveTo(left, top) {
    const bounds = companion.getBoundingClientRect()
    const safeLeft = Math.max(
      22,
      Math.min(left, document.documentElement.clientWidth - bounds.width - 12)
    )
    const safeTop = Math.max(
      88,
      Math.min(top, window.innerHeight - bounds.height - 28)
    )
    companion.style.left = `${safeLeft}px`
    companion.style.top = `${safeTop}px`
    companion.style.right = 'auto'
    companion.style.bottom = 'auto'
    manuallyPositioned = true
    positionFloatingContent()
  }

  function scheduleBlink() {
    clearTimeout(blinkTimer)
    if (document.hidden || motionPreference.matches) return
    blinkTimer = setTimeout(
      () => {
        if (!companion.hidden) {
          companion.classList.add('is-blinking')
          blinkEndTimer = setTimeout(
            () => companion.classList.remove('is-blinking'),
            130
          )
        }
        scheduleBlink()
      },
      3600 + Math.random() * 2600
    )
  }

  shadow
    .querySelector('#companion-close')
    .addEventListener('click', hideCompanion)
  restoreButton.addEventListener('click', () => {
    greet()
    character.focus({ preventScroll: true })
  })
  character.addEventListener('click', () => {
    if (suppressClick) return
    mascotClicks = (mascotClicks + 1) % 5
    greet()
    if (mascotClicks === 0) showReward()
  })
  supportHint.addEventListener('click', openSupport)
  supportClose.addEventListener('click', () => closeSupport())
  sizeButton.addEventListener('click', openSizeSettings)
  sizePanelClose.addEventListener('click', () => closeSizeSettings())
  shadow
    .querySelector('#reset-size-button')
    .addEventListener('click', resetSize)
  shadow
    .querySelector('#compact-button')
    .addEventListener('click', enterCompactMode)
  rewardClose.addEventListener('click', () => closeReward())
  shadow
    .querySelector('#copy-reward-code')
    .addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('caidan')
        rewardFeedback.textContent = '兑换码已复制，惊喜收好啦。'
      } catch {
        rewardFeedback.textContent = '请手动复制兑换码 caidan。'
      }
    })
  shadow
    .querySelector('#copy-support-group')
    .addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('673994374')
        supportFeedback.textContent = '群号已复制，去 QQ 搜索加入吧。'
      } catch {
        supportFeedback.textContent = '请手动复制群号 673994374，再到 QQ 搜索。'
      }
    })
  document.addEventListener('pointerdown', (event) => {
    if (!supportPanel.hidden && !event.composedPath().includes(host)) {
      closeSupport(false)
    }
    if (!sizePanel.hidden && !event.composedPath().includes(host)) {
      closeSizeSettings(false)
    }
    if (!rewardPanel.hidden && !event.composedPath().includes(host)) {
      closeReward(false)
    }
  })
  sizePanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSizeSettings()
    }
  })

  rewardPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeReward()
    }
  })
  supportPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSupport()
    }
  })

  character.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return
    const bounds = companion.getBoundingClientRect()
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: bounds.left,
      top: bounds.top,
      moved: false,
    }
    character.setPointerCapture(event.pointerId)
  })

  character.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 6) return
    if (!drag.moved) stopAction()
    drag.moved = true
    companion.classList.add('is-dragging')
    moveTo(drag.left + dx, drag.top + dy)
  })

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressClick = drag.moved
    if (drag.moved && event.type === 'pointerup') {
      speak('这个位置也很棒，我就在这里啦。')
    }
    drag = null
    companion.classList.remove('is-dragging')
    setTimeout(() => {
      suppressClick = false
    }, 0)
  }

  character.addEventListener('pointerup', finishDrag)
  character.addEventListener('pointercancel', finishDrag)
  character.addEventListener('lostpointercapture', finishDrag)
  character.addEventListener('keydown', (event) => {
    const directions = {
      ArrowLeft: [-20, 0],
      ArrowRight: [20, 0],
      ArrowUp: [0, -20],
      ArrowDown: [0, 20],
    }
    if (event.key === 'Escape') {
      hideCompanion()
      return
    }
    if (!directions[event.key]) return
    event.preventDefault()
    const bounds = companion.getBoundingClientRect()
    const [dx, dy] = directions[event.key]
    moveTo(bounds.left + dx, bounds.top + dy)
  })

  document.addEventListener(
    'pointermove',
    (event) => {
      if (drag || motionPreference.matches || companion.hidden) return
      const bounds = companion.getBoundingClientRect()
      const direction = Math.max(
        -1,
        Math.min(1, (event.clientX - bounds.left - bounds.width / 2) / 350)
      )
      companion.style.setProperty('--look-x', `${direction * 4}px`)
      companion.style.setProperty('--look-angle', `${direction * 1.2}deg`)
    },
    { passive: true }
  )

  widgetSizeControl.addEventListener('input', () =>
    applySize(Number(widgetSizeControl.value))
  )

  window.addEventListener('resize', () => {
    const layout = mobileLayout.matches ? 'mobile' : 'desktop'
    if (layout !== activeLayout) {
      loadPreferences()
      return
    }
    applySize(preferredSize ?? defaultSize(), false)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAction()
    companion.classList.toggle('is-paused', document.hidden)
    clearTimeout(blinkEndTimer)
    companion.classList.remove('is-blinking')
    scheduleBlink()
  })
  motionPreference.addEventListener('change', () => {
    stopAction()
    clearTimeout(blinkEndTimer)
    companion.classList.remove('is-blinking')
    companion.style.removeProperty('--look-x')
    companion.style.removeProperty('--look-angle')
    scheduleBlink()
  })
  loadPreferences()
  scheduleBlink()
  positionFloatingContent()

  shadow
    .querySelector('#widget-wave')
    .addEventListener('click', () => greet('wave'))
})()
