/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Skymoni cloud companion. Website help is relayed through the server-only AI service.
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
    '/static/cloud-companion-20261103/companion-7f0b40720c18.css'
  const template = document.createElement('template')
  // The template is a static, bundled asset. No user or server HTML is inserted.
  template.innerHTML = String.raw`  <aside class="companion" id="companion" aria-label="云朵伙伴">
    <div class="speech-bubble" id="speech-bubble" role="status" aria-live="polite" hidden></div>
    <button class="support-hint" id="support-hint" type="button" aria-controls="support-panel" aria-expanded="false" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11a8 8 0 0 1 16 0v5a3 3 0 0 1-3 3h-3M4 11H3v6h4v-6H4Zm16 0h1v6h-4v-6h3Z"/><path d="M11 19h3"/></svg>
      <span><strong>想问怎么用？</strong><small>和小云聊聊</small></span>
      <span class="support-hint-arrow" aria-hidden="true">↗</span>
    </button>
    <section class="support-panel" id="support-panel" role="dialog" aria-labelledby="support-title" hidden>
      <div class="chat-heading">
        <span class="chat-avatar" aria-hidden="true">☁</span>
        <div><h2 id="support-title">小云 · 网站助手</h2><span>一起把下一步弄明白</span></div>
        <button id="chat-new" type="button" aria-label="开始新对话" title="开始新对话">↺</button>
        <button class="support-close" id="support-close" type="button" aria-label="关闭小云对话">×</button>
      </div>
      <div id="chat-auth-gate" class="chat-auth-gate">
        <strong id="chat-auth-title">正在确认登录状态…</strong>
        <a id="chat-login" hidden>登录后开始对话 ↗</a>
        <button id="chat-auth-retry" type="button" hidden>重新检查</button>
        <a href="https://skymoni.com/docs" target="_blank" rel="noopener">查看使用文档 ↗</a>
      </div>
      <div class="chat-transcript" id="chat-transcript" role="log" aria-label="与小云的对话" aria-live="polite" aria-relevant="additions text"></div>
      <div class="chat-suggestions" id="chat-suggestions">
        <button type="button">如何创建 API 密钥？</button>
        <button type="button">API 地址怎么填？</button>
        <button type="button">充值后去哪里兑换？</button>
      </div>
      <div class="chat-feedback" id="chat-feedback" role="status" aria-live="polite"></div>
      <div class="chat-retry-row" id="chat-retry-row" hidden><button id="chat-retry" type="button">重试这条问题</button><a href="https://skymoni.com/docs" target="_blank" rel="noopener">查看使用文档 ↗</a></div>
      <form class="chat-form" id="chat-form">
        <label class="chat-input-label" for="chat-input">想了解什么？</label>
        <textarea id="chat-input" rows="2" maxlength="1000" placeholder="例如：怎么在手机上使用？" aria-label="输入想问小云的问题"></textarea>
        <div class="chat-compose-actions"><span id="chat-quota">网站使用咨询免费</span><button id="chat-send" type="submit">发送 <span aria-hidden="true">↑</span></button></div>
      </form>
      <details class="chat-human"><summary>联系人工客服 <span aria-hidden="true">↗</span></summary>
        <div class="support-group"><span>QQ 交流群</span><strong>673994374</strong><button id="copy-support-group" type="button">复制群号</button></div>
        <a class="support-email" href="mailto:792521914@qq.com"><span>客服邮箱<small>792521914@qq.com</small></span><span aria-hidden="true">↗</span></a>
        <p class="support-feedback" id="support-feedback" role="status" aria-live="polite">打开 QQ，搜索群号即可加入。</p>
      </details>
    </section>
    <section class="size-panel" id="size-panel" role="dialog" aria-labelledby="size-panel-title" hidden>
      <div class="support-heading">
        <span class="support-kicker">MAKE YOURSELF COMFORTABLE</span>
        <h2 id="size-panel-title">小云的大小，你来定</h2>
        <button class="support-close" id="size-panel-close" type="button" aria-label="关闭大小设置">×</button>
      </div>
      <button class="wave-control" id="widget-wave" type="button">挥挥手 ✋</button>
      <button class="wave-control chat-open-control" id="widget-open-chat" type="button" aria-controls="support-panel" aria-haspopup="dialog">和小云对话 <span aria-hidden="true">↗</span></button>
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
  <button class="restore-companion" id="restore-companion" type="button" aria-label="展开云朵伙伴，也可以拖动位置，方向键移动" title="点击展开小云，拖动调整位置" hidden><span aria-hidden="true">☁</span><span class="restore-label">叫小云回来</span></button>`
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
  let restorePosition = null
  let compactMode = false
  let activeLayout = mobileLayout.matches ? 'mobile' : 'desktop'

  function savePreferences() {
    try {
      localStorage.setItem(
        `skymoni:cloud-companion:${activeLayout}:v1`,
        JSON.stringify({
          size: preferredSize,
          compact: compactMode,
          restorePosition,
        })
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
    restorePosition = null
    compactMode = false
    try {
      const saved = JSON.parse(
        localStorage.getItem(`skymoni:cloud-companion:${activeLayout}:v1`)
      )
      if (typeof saved?.size === 'number' && Number.isFinite(saved.size)) {
        preferredSize = saved.size
      }
      compactMode = saved?.compact === true
      if (
        Number.isFinite(saved?.restorePosition?.left) &&
        Number.isFinite(saved?.restorePosition?.top)
      ) {
        restorePosition = saved.restorePosition
      }
    } catch {
      // Invalid or unavailable stored preferences use the responsive defaults.
    }
    companion.hidden = compactMode
    restoreButton.hidden = !compactMode
    restoreButton.classList.toggle('is-compact', compactMode)
    applySize(preferredSize ?? defaultSize(), false)
    for (const property of ['left', 'top', 'right', 'bottom']) {
      restoreButton.style.removeProperty(property)
    }
    positionRestoreButton()
  }

  function positionFloatingContent() {
    if (companion.hidden) return
    const bounds = companion.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const viewportTop = window.visualViewport?.offsetTop ?? 0
    const chatGutter = mobileLayout.matches ? 24 : 12
    const availableChatHeight = Math.max(0, viewportHeight - chatGutter * 2)
    supportPanel.style.maxHeight = `${availableChatHeight}px`
    const chatHeight = mobileLayout.matches
      ? Math.min(
          420,
          Math.max(260, window.innerHeight * 0.56),
          availableChatHeight
        )
      : viewportHeight
    supportPanel.dataset.smallHeight = String(
      chatHeight < (mobileLayout.matches ? 400 : 480)
    )
    for (const element of [
      speech,
      supportHint,
      supportPanel,
      sizePanel,
      rewardPanel,
    ]) {
      if (element.hidden) continue
      const gutter = element === supportPanel && mobileLayout.matches ? 20 : 12
      element.style.maxWidth = `${viewportWidth - gutter * 2}px`
      const floatingBounds = element.getBoundingClientRect()
      const left = Math.max(
        gutter,
        Math.min(
          bounds.left + bounds.width / 2 - floatingBounds.width / 2,
          viewportWidth - floatingBounds.width - gutter
        )
      )
      const above = bounds.top >= floatingBounds.height + 24
      const top = above
        ? bounds.top - floatingBounds.height - 12
        : bounds.bottom + 12
      const safeTop = Math.max(
        viewportTop + gutter,
        Math.min(
          top,
          viewportTop + viewportHeight - floatingBounds.height - gutter
        )
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
    if (!mobileLayout.matches) {
      shadow.querySelector('#chat-input').focus({ preventScroll: true })
    }
    void loadChatStatus()
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
    positionRestoreButton()
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
    positionRestoreButton()
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

  function moveRestoreTo(left, top) {
    const bounds = restoreButton.getBoundingClientRect()
    const safeLeft = Math.max(
      12,
      Math.min(left, document.documentElement.clientWidth - bounds.width - 12)
    )
    const safeTop = Math.max(
      12,
      Math.min(top, window.innerHeight - bounds.height - 12)
    )
    restoreButton.style.left = `${safeLeft}px`
    restoreButton.style.top = `${safeTop}px`
    restoreButton.style.right = 'auto'
    restoreButton.style.bottom = 'auto'
    restorePosition = { left: safeLeft, top: safeTop }
  }

  function positionRestoreButton() {
    if (restorePosition && !restoreButton.hidden) {
      moveRestoreTo(restorePosition.left, restorePosition.top)
    }
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

  restoreButton.addEventListener('click', () => {
    if (suppressClick) return
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

  function startDrag(event) {
    if (event.button !== 0 || !event.isPrimary || drag) return
    const handle = event.currentTarget
    const element = handle === restoreButton ? restoreButton : companion
    const bounds = element.getBoundingClientRect()
    drag = {
      handle,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: bounds.left,
      top: bounds.top,
      moved: false,
    }
    handle.setPointerCapture(event.pointerId)
  }

  function updateDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 6) return
    if (!drag.moved && drag.handle === character) stopAction()
    drag.moved = true
    drag.handle.classList.add('is-dragging')
    if (drag.handle === restoreButton) {
      moveRestoreTo(drag.left + dx, drag.top + dy)
    } else {
      companion.classList.add('is-dragging')
      moveTo(drag.left + dx, drag.top + dy)
    }
  }

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressClick = drag.moved
    if (drag.moved) {
      if (drag.handle === restoreButton) savePreferences()
      else if (event.type === 'pointerup') {
        speak('这个位置也很棒，我就在这里啦。')
      }
    }
    drag.handle.classList.remove('is-dragging')
    drag = null
    companion.classList.remove('is-dragging')
    setTimeout(() => {
      suppressClick = false
    }, 0)
  }

  function moveWithKeyboard(event) {
    const directions = {
      ArrowLeft: [-20, 0],
      ArrowRight: [20, 0],
      ArrowUp: [0, -20],
      ArrowDown: [0, 20],
    }
    if (event.key === 'Escape' && event.currentTarget === character) {
      hideCompanion()
      return
    }
    if (!directions[event.key]) return
    event.preventDefault()
    const element =
      event.currentTarget === restoreButton ? restoreButton : companion
    const bounds = element.getBoundingClientRect()
    const [dx, dy] = directions[event.key]
    if (element === restoreButton) {
      moveRestoreTo(bounds.left + dx, bounds.top + dy)
      savePreferences()
    } else {
      moveTo(bounds.left + dx, bounds.top + dy)
    }
  }

  for (const handle of [character, restoreButton]) {
    handle.addEventListener('pointerdown', startDrag)
    handle.addEventListener('pointermove', updateDrag)
    handle.addEventListener('pointerup', finishDrag)
    handle.addEventListener('pointercancel', finishDrag)
    handle.addEventListener('lostpointercapture', finishDrag)
    handle.addEventListener('keydown', moveWithKeyboard)
  }

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
    positionRestoreButton()
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

  const transcript = shadow.querySelector('#chat-transcript')
  const chatForm = shadow.querySelector('#chat-form')
  const chatInput = shadow.querySelector('#chat-input')
  const chatSend = shadow.querySelector('#chat-send')
  const chatNew = shadow.querySelector('#chat-new')
  const chatFeedback = shadow.querySelector('#chat-feedback')
  const chatQuota = shadow.querySelector('#chat-quota')
  const chatSuggestions = shadow.querySelector('#chat-suggestions')
  const chatRetryRow = shadow.querySelector('#chat-retry-row')
  const chatHistory = []
  let chatSession = null
  let chatPending = null
  let chatPartialBubble = null
  let chatBusy = false
  let chatIdentity = ''
  let chatAccess = 'checking'
  let chatAbort = null
  let chatAuthEpoch = 0

  function setChatAccess(state) {
    chatAccess = state
    const allowed = state === 'authenticated'
    shadow.querySelector('#chat-auth-gate').hidden = allowed
    const titles = {
      anonymous: '登录后才能和小云对话',
      error: '暂时无法确认登录状态，请重试',
    }
    shadow.querySelector('#chat-auth-title').textContent =
      titles[state] ?? '正在确认登录状态…'
    const login = shadow.querySelector('#chat-login')
    login.hidden = state !== 'anonymous'
    login.href = `/sign-in?redirect=${encodeURIComponent(
      window.location.pathname + window.location.search + window.location.hash
    )}`
    shadow.querySelector('#chat-auth-retry').hidden = state !== 'error'
    transcript.hidden = !allowed
    chatForm.hidden = !allowed
    chatSuggestions.hidden = !allowed || chatHistory.length > 0 || chatBusy
    chatRetryRow.hidden = true
    chatNew.disabled = !allowed || chatBusy
    if (allowed && !supportPanel.hidden && !chatBusy && !mobileLayout.matches) {
      chatInput.focus({ preventScroll: true })
    }
    positionFloatingContent()
  }

  function safeChatLink(value) {
    try {
      const url = new URL(value, 'https://skymoni.com')
      const paths = [
        '/',
        '/docs',
        '/keys',
        '/pricing',
        '/wallet',
        '/warehouse',
        '/benefits',
        '/usage-logs/common',
        '/software',
        '/app',
        '/playground',
        '/channel-status',
        '/sign-in',
        '/sign-up',
        '/forgot-password',
        '/security',
        '/profile',
        '/creators',
        '/creators/new',
        '/creators/guidelines',
        '/creators/workspace',
      ]
      return url.origin === 'https://skymoni.com' &&
        !url.username &&
        !url.password &&
        !url.hash &&
        (!url.search ||
          (url.pathname === '/docs' &&
            /^\?doc=[a-z0-9-]{1,64}(?:&edit=false)?$/.test(url.search))) &&
        paths.includes(url.pathname)
        ? url.href
        : null
    } catch {
      return null
    }
  }

  function chatMessage(role, text, sources = []) {
    const bubble = document.createElement('div')
    bubble.className = `chat-message chat-message-${role}`
    const label = document.createElement('span')
    label.className = 'chat-speaker'
    label.textContent = role === 'user' ? '你' : '小云'
    const body = document.createElement('div')
    body.className = 'chat-message-body'
    const content = text.replaceAll(/\*\*([^*]+)\*\*/g, '$1')
    const links = /\[([^\]]{1,100})\]\(([^\s)]+)\)/g
    let cursor = 0
    for (const match of content.matchAll(links)) {
      body.append(document.createTextNode(content.slice(cursor, match.index)))
      const href = safeChatLink(match[2])
      if (href) {
        const link = document.createElement('a')
        link.href = href
        link.target = '_blank'
        link.rel = 'noopener'
        link.textContent = match[1]
        body.append(link)
      } else {
        body.append(document.createTextNode(match[1]))
      }
      cursor = match.index + match[0].length
    }
    body.append(document.createTextNode(content.slice(cursor)))
    bubble.append(label, body)
    if (sources.length) {
      const references = document.createElement('div')
      references.className = 'chat-sources'
      for (const source of sources.slice(0, 3)) {
        const href = safeChatLink(source.url)
        if (!href || typeof source.title !== 'string') continue
        const link = document.createElement('a')
        link.href = href
        link.target = '_blank'
        link.rel = 'noopener'
        link.textContent = `${source.title} ↗`
        references.append(link)
      }
      bubble.append(references)
    }
    transcript.append(bubble)
    transcript.scrollTop = transcript.scrollHeight
    return bubble
  }

  async function readChatStream(response, onText) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    try {
      while (true) {
        const { value, done } = await reader.read()
        pending += decoder.decode(value, { stream: !done })
        pending = pending.replaceAll('\r\n', '\n')
        let boundary
        while ((boundary = pending.indexOf('\n\n')) >= 0) {
          const frame = pending.slice(0, boundary)
          pending = pending.slice(boundary + 2)
          const lines = frame.split('\n')
          const kind = lines
            .find((line) => line.startsWith('event:'))
            ?.slice(6)
            .trim()
          const raw = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n')
          if (!raw) continue
          const data = JSON.parse(raw)
          if (kind === 'delta' && typeof data.text === 'string') {
            if (data.text.length > 6000) {
              throw new Error('回复过长，请新建对话。')
            }
            onText(data.text)
          } else if (kind === 'done') {
            return data
          } else if (kind === 'error') {
            throw Object.assign(
              new Error(data.message || '回复中断，请重试。'),
              { code: data.error }
            )
          }
        }
        if (pending.length > 32768) throw new Error('回复格式异常，请重试。')
        if (done) throw new Error('连接中断，可以重试获取这条问题的完整回复。')
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
  }

  function welcomeChat() {
    chatMessage(
      'assistant',
      '你好，我是小云 ☁\n想了解创建密钥、软件接入，还是充值兑换？告诉我你要做什么，我一步步带你。'
    )
  }

  async function loadChatStatus() {
    if (typeof window.fetch !== 'function') return
    if (!chatSession) {
      chatSession = (async () => {
        const auth = await window.skymoniCloudAssistantAuth?.resolve()
        if (!auth || auth.kind === 'unavailable') {
          setChatAccess('error')
          return null
        }
        if (auth.kind !== 'authenticated') {
          setChatAccess('anonymous')
          return null
        }
        chatIdentity = auth.identity
        const epoch = chatAuthEpoch
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)
        try {
          const response = await window.fetch('/api/cloud-assistant/status', {
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
            headers: auth.headers,
          })
          if (epoch !== chatAuthEpoch) return null
          if (response.status === 401 || response.status === 403) {
            setChatAccess('anonymous')
            return null
          }
          if (!response.ok) {
            throw new Error('小云暂时无法准备咨询，请稍后再试。')
          }
          const status = await response.json()
          if (!status.ready) {
            throw new Error('小云暂时无法回复，可以先查看教程或联系人工。')
          }
          if (Number.isInteger(status.remaining)) {
            chatQuota.textContent = `今天还可提问 ${status.remaining} 次`
          }
          setChatAccess('authenticated')
          return { ...status, headers: auth.headers }
        } finally {
          clearTimeout(timer)
        }
      })()
        .catch(() => {
          setChatAccess('error')
          return null
        })
        .finally(() => {
          chatSession = null
        })
    }
    try {
      return await chatSession
    } catch (error) {
      if (!chatBusy) chatFeedback.textContent = error.message
      return null
    }
  }

  function redactChatInput(text) {
    return text
      .replaceAll(
        /\bsk-[a-z0-9_-]{12,}|\bbearer\s+[a-z0-9_.-]{12,}/gi,
        '[密钥已隐去]'
      )
      .replaceAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[邮箱已隐去]')
  }

  async function sendChat(retry = false) {
    if (chatBusy) return
    const question =
      retry && chatPending
        ? chatPending.message
        : redactChatInput(chatInput.value.trim())
    if (!question) {
      chatInput.focus()
      return
    }
    if (question.length > 1000) {
      chatFeedback.textContent = '请把问题控制在1000字以内。'
      return
    }
    chatBusy = true
    chatSend.disabled = true
    chatNew.disabled = true
    chatForm.setAttribute('aria-busy', 'true')
    chatFeedback.textContent = '小云正在查阅使用说明…'
    chatRetryRow.hidden = true
    chatSuggestions.hidden = true
    let timer
    try {
      const status = await loadChatStatus()
      if (!status) {
        chatFeedback.textContent = ''
        return
      }
      if (!retry || !chatPending) {
        chatPending = {
          request_id: crypto.randomUUID(),
          message: question,
          history: chatHistory.slice(-6).map((message) => ({
            ...message,
            content: message.content.slice(0, 1000),
          })),
          page: window.location.pathname,
        }
        chatMessage('user', question)
        chatInput.value = ''
      }
      if (retry) chatPartialBubble?.remove()
      chatPartialBubble = null
      const controller = new AbortController()
      chatAbort = controller
      const identity = chatIdentity
      timer = setTimeout(() => controller.abort(), 47000)
      const response = await window.fetch('/api/cloud-assistant/chat', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          ...status.headers,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'X-Skymoni-Assistant': '1',
        },
        body: JSON.stringify(chatPending),
      })
      const streaming =
        response.ok &&
        response.headers?.get('Content-Type')?.includes('text/event-stream')
      const result = streaming
        ? await readChatStream(response, (text) => {
            if (identity !== chatIdentity) return
            if (!chatPartialBubble) {
              chatPartialBubble = chatMessage('assistant', '')
              chatPartialBubble.classList.add('is-streaming')
              chatPartialBubble.setAttribute('aria-live', 'off')
            }
            const followBottom =
              transcript.scrollHeight -
                transcript.scrollTop -
                transcript.clientHeight <
              90
            chatPartialBubble.querySelector('.chat-message-body').textContent =
              text
            if (followBottom) transcript.scrollTop = transcript.scrollHeight
            chatFeedback.textContent = '小云正在回复…'
          })
        : await response.json()
      if (identity !== chatIdentity) return
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setChatAccess('anonymous')
          chatFeedback.textContent = ''
          return
        }
        if (['provider_unavailable', 'request_failed'].includes(result.error)) {
          chatPending.request_id = crypto.randomUUID()
        }
        if (result.error === 'session_required') chatSession = null
        throw new Error(result.message || '小云暂时未能回复，请稍后再试。')
      }
      if (typeof result.answer !== 'string' || !result.answer.trim()) {
        throw new Error('回复未完成，请重新试一次。')
      }
      chatPartialBubble?.remove()
      chatPartialBubble = null
      chatMessage(
        'assistant',
        result.answer,
        Array.isArray(result.sources) ? result.sources : []
      )
      chatHistory.push(
        { role: 'user', content: question },
        { role: 'assistant', content: result.answer }
      )
      if (chatHistory.length > 12) {
        chatHistory.splice(0, chatHistory.length - 12)
      }
      if (Number.isInteger(result.remaining)) {
        chatQuota.textContent = `今天还可提问 ${result.remaining} 次`
      }
      chatPending = null
      chatFeedback.textContent = ''
    } catch (error) {
      if (chatAccess !== 'authenticated') {
        chatFeedback.textContent = ''
        return
      }
      if (
        chatPending &&
        ['provider_unavailable', 'request_failed'].includes(error.code)
      ) {
        chatPending.request_id = crypto.randomUUID()
      }
      if (chatPartialBubble) {
        chatPartialBubble.classList.remove('is-streaming')
        chatPartialBubble.querySelector('.chat-speaker').textContent =
          '小云 · 回复未完成'
      }
      chatFeedback.textContent =
        error.name === 'AbortError'
          ? '等待回复有点久，可以点击重试获取这条问题的结果。'
          : error.message
      chatRetryRow.hidden = chatAccess !== 'authenticated'
    } finally {
      clearTimeout(timer)
      chatBusy = false
      chatAbort = null
      chatSend.disabled = false
      chatNew.disabled = chatAccess !== 'authenticated'
      chatForm.removeAttribute('aria-busy')
      positionFloatingContent()
    }
  }

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void sendChat()
  })
  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      void sendChat()
    }
  })
  shadow.querySelector('#chat-retry').addEventListener('click', () => {
    void sendChat(true)
  })
  for (const button of chatSuggestions.querySelectorAll('button')) {
    button.addEventListener('click', () => {
      chatInput.value = button.textContent
      void sendChat()
    })
  }
  chatNew.addEventListener('click', () => {
    if (chatBusy) return
    chatHistory.length = 0
    chatPending = null
    chatPartialBubble = null
    transcript.replaceChildren()
    welcomeChat()
    chatFeedback.textContent = ''
    chatRetryRow.hidden = true
    chatSuggestions.hidden = false
    chatInput.value = ''
    chatInput.focus()
  })
  shadow
    .querySelector('.chat-human')
    .addEventListener('toggle', positionFloatingContent)
  window.visualViewport?.addEventListener('resize', positionFloatingContent)
  window.visualViewport?.addEventListener('scroll', positionFloatingContent)
  welcomeChat()
  setChatAccess('checking')
  shadow.querySelector('#chat-auth-retry').addEventListener('click', () => {
    setChatAccess('checking')
    void loadChatStatus()
  })
  window.addEventListener('skymoni:cloud-auth-ready', () => {
    if (!supportPanel.hidden) void loadChatStatus()
  })
  window.addEventListener('skymoni:cloud-auth-change', (event) => {
    const identity = typeof event.detail === 'string' ? event.detail : ''
    if (identity === chatIdentity) return
    chatAuthEpoch += 1
    chatAbort?.abort()
    if (chatIdentity) {
      chatHistory.length = 0
      chatPending = null
      chatPartialBubble = null
      transcript.replaceChildren()
      welcomeChat()
      chatInput.value = ''
    }
    chatIdentity = identity
    chatSession = null
    chatFeedback.textContent = ''
    setChatAccess(identity ? 'checking' : 'anonymous')
    if (identity && !supportPanel.hidden && !chatBusy) void loadChatStatus()
  })

  loadPreferences()
  scheduleBlink()
  positionFloatingContent()

  shadow
    .querySelector('#widget-wave')
    .addEventListener('click', () => greet('wave'))
  shadow
    .querySelector('#widget-open-chat')
    .addEventListener('click', openSupport)
})()
