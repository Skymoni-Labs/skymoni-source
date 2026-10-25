;(() => {
  'use strict'
  const root = document.documentElement
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  let paused = reduced.matches
  const header = document.querySelector('.site-header')
  const progress = document.querySelector('.reading-progress')
  const motionButton = document.querySelector('.motion-toggle')
  const menuButton = document.querySelector('.menu-toggle')
  const canvas = document.getElementById('starfield')
  const ctx = canvas.getContext('2d')
  const stationFrame = document.getElementById('station-viewer')
  let stationVisible = false
  function syncStation() {
    stationFrame.contentWindow?.postMessage(
      { type: 'skivu-motion', paused },
      location.origin
    )
    stationFrame.contentWindow?.postMessage(
      { type: 'skivu-station-visibility', visible: stationVisible },
      location.origin
    )
  }
  stationFrame.addEventListener('load', syncStation)
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== stationFrame.contentWindow) return
    if (event.data?.type === 'skivu-station-ready') syncStation()
  })
  window.addEventListener('pageshow', syncStation)
  new IntersectionObserver(
    (entries) => {
      stationVisible = entries[0].isIntersecting
      syncStation()
    },
    { rootMargin: '150px' }
  ).observe(stationFrame)
  const orbitalScene = document.querySelector('.ecosystem-space')
  const dockOrder = ['web', 'canvas', 'world', 'chat']
  let litDock = ''
  let width = 0,
    height = 0,
    stars = [],
    raf = 0,
    last = 0,
    elapsed = 0
  let pointerX = 0,
    pointerY = 0,
    targetX = 0,
    targetY = 0,
    scrollRatio = 0
  const random = (() => {
    let seed = 20261025
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
  })()
  function resize() {
    width = window.innerWidth
    height = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, width < 640 ? 1.5 : 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    stars = Array.from({ length: width < 640 ? 72 : 170 }, () => ({
      x: random(),
      y: random(),
      r: 0.3 + random() * 1.1,
      depth: 0.25 + random() * 0.75,
      phase: random() * Math.PI * 2,
      speed: 0.1 + random() * 0.4,
    }))
    draw()
  }
  function draw() {
    ctx.clearRect(0, 0, width, height)
    for (const star of stars) {
      const x =
        (((star.x * width +
          pointerX * 12 * star.depth +
          elapsed * star.speed * 0.7) %
          width) +
          width) %
        width
      const y =
        (((star.y * height +
          pointerY * 8 * star.depth -
          scrollRatio * 55 * star.depth) %
          height) +
          height) %
        height
      const alpha = 0.24 + (Math.sin(elapsed * 0.45 + star.phase) + 1) * 0.22
      ctx.fillStyle = `rgba(${star.depth > 0.7 ? '187,204,247' : '156,186,214'},${alpha})`
      ctx.beginPath()
      ctx.arc(x, y, star.r, 0, Math.PI * 2)
      ctx.fill()
      if (star.r > 1.25) {
        ctx.fillStyle = `rgba(161,194,245,${alpha * 0.07})`
        ctx.beginPath()
        ctx.arc(x, y, star.r * 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    if (!paused && width > 640) {
      const cycle = elapsed % 17
      if (cycle > 8 && cycle < 9.6) {
        const t = (cycle - 8) / 1.6,
          x = width * (0.15 + t * 0.65),
          y = height * (0.65 - t * 0.5)
        const gradient = ctx.createLinearGradient(x - 140, y + 80, x, y)
        gradient.addColorStop(0, 'rgba(168,204,255,0)')
        gradient.addColorStop(
          1,
          `rgba(198,224,255,${Math.sin(t * Math.PI) * 0.65})`
        )
        ctx.strokeStyle = gradient
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x - 140, y + 80)
        ctx.lineTo(x, y)
        ctx.stroke()
      }
    }
  }
  function animate(timestamp) {
    if (paused || document.hidden) {
      raf = 0
      return
    }
    raf = requestAnimationFrame(animate)
    if (timestamp - last < (width < 640 ? 42 : 32)) return
    const delta = last ? Math.min((timestamp - last) / 1000, 0.08) : 0
    last = timestamp
    elapsed += delta
    const nextDock = dockOrder[Math.floor((elapsed % 13) / 3.25)]
    if (nextDock !== litDock) {
      litDock = nextDock
      orbitalScene.dataset.flow = litDock
    }
    pointerX += (targetX - pointerX) * 0.055
    pointerY += (targetY - pointerY) * 0.055
    root.style.setProperty('--pointer-x', pointerX.toFixed(4))
    root.style.setProperty('--pointer-y', pointerY.toFixed(4))
    draw()
  }
  function start() {
    if (!raf && !paused && !document.hidden) {
      last = 0
      raf = requestAnimationFrame(animate)
    }
  }
  function motionState() {
    syncStation()
    root.classList.toggle('motion-paused', paused)
    document.dispatchEvent(
      new CustomEvent('skivu-motion-change', { detail: { paused } })
    )
    motionButton.setAttribute('aria-pressed', String(paused))
    motionButton.setAttribute(
      'aria-label',
      paused ? '开启动画效果' : '暂停动态效果'
    )
    motionButton.querySelector('small').textContent = paused
      ? '动态暂停'
      : '动态开启'
    if (paused) {
      cancelAnimationFrame(raf)
      raf = 0
      root.style.setProperty('--pointer-x', '0')
      root.style.setProperty('--pointer-y', '0')
      draw()
      finishTyping()
    } else start()
  }
  motionButton.addEventListener('click', () => {
    paused = !paused
    motionState()
  })
  reduced.addEventListener('change', (event) => {
    paused = event.matches
    motionState()
  })
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true'
    menuButton.setAttribute('aria-expanded', String(open))
    menuButton.setAttribute('aria-label', open ? '关闭导航' : '打开导航')
    header.classList.toggle('menu-open', open)
  })
  header.querySelectorAll('nav a').forEach((link) =>
    link.addEventListener('click', () => {
      header.classList.remove('menu-open')
      menuButton.setAttribute('aria-expanded', 'false')
      menuButton.setAttribute('aria-label', '打开导航')
    })
  )
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      header.classList.remove('menu-open')
      menuButton.setAttribute('aria-expanded', 'false')
      menuButton.setAttribute('aria-label', '打开导航')
    }
  })
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'mouse' && width > 640) {
        targetX = (event.clientX / width - 0.5) * 2
        targetY = (event.clientY / height - 0.5) * 2
      }
    },
    { passive: true }
  )
  function scrollState() {
    const y = window.scrollY
    header.classList.toggle('scrolled', y > 30)
    scrollRatio =
      y / Math.max(1, document.documentElement.scrollHeight - height)
    progress.style.transform = `scaleX(${scrollRatio})`
    if (!paused)
      root.style.setProperty('--hero-shift', Math.min(y, height) * 0.12 + 'px')
  }
  window.addEventListener('scroll', scrollState, { passive: true })
  window.addEventListener(
    'resize',
    () => {
      resize()
      scrollState()
    },
    { passive: true }
  )
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
      finishTyping()
      document
        .getElementById('brand-film')
        .contentWindow.postMessage('skivu-film-pause', location.origin)
    } else start()
  })
  const scenarios = {
    idea: {
      question: '想把今天零散的灵感，\n整理成一个开始。',
      answer: '先选一个你最想实现的。我们把它拆成今天就能完成的第一步。',
    },
    daily: {
      question: '今天有点忙，\n想停下来聊一会儿。',
      answer: '那就先把节奏放慢一点。今天有没有一个小小的瞬间，让你想留住？',
    },
    think: {
      question: '有两个都不错的想法，\n怎么决定先做哪一个？',
      answer:
        '可以先看三件事：你最在意什么、现在能投入多少、哪一步最容易验证。我们从这里开始梳理。',
    },
  }
  const answer = document.getElementById('demo-answer')
  document.getElementById('demo-question').textContent = scenarios.idea.question
  let typingTimer = 0,
    currentAnswer = scenarios.idea.answer
  function finishTyping() {
    clearTimeout(typingTimer)
    answer.textContent = currentAnswer
    answer.classList.remove('typing')
  }
  function typeAnswer(text) {
    clearTimeout(typingTimer)
    currentAnswer = text
    if (paused) {
      finishTyping()
      return
    }
    answer.textContent = ''
    answer.classList.add('typing')
    let position = 0
    const type = () => {
      answer.textContent = text.slice(0, ++position)
      if (position < text.length) {
        typingTimer = setTimeout(
          type,
          /[。！？：，]/.test(text[position - 1]) ? 260 : 52
        )
      } else answer.classList.remove('typing')
    }
    typingTimer = setTimeout(type, 250)
  }
  document.querySelectorAll('[data-scenario]').forEach((button) =>
    button.addEventListener('click', () => {
      document
        .querySelectorAll('[data-scenario]')
        .forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button))
        )
      const scenario = scenarios[button.dataset.scenario]
      document.getElementById('demo-question').textContent = scenario.question
      typeAnswer(scenario.answer)
    })
  )
  document
    .getElementById('replay-chat')
    .addEventListener('click', () => typeAnswer(currentAnswer))
  const personas = {
    cloud: {
      label: '云朵 / 日常陪伴',
      quote: '“慢慢说，我在这里。”',
      color: '#a5cdf3',
    },
    idea: {
      label: '灵感搭档 / 一起创造',
      quote: '“这个想法，值得再往前一步。”',
      color: '#a7d9cc',
    },
    night: {
      label: '深夜倾听 / 安静交流',
      quote: '“夜还很长，不必急着说完。”',
      color: '#bdb0e9',
    },
  }
  document.querySelectorAll('[data-persona]').forEach((button) =>
    button.addEventListener('click', () => {
      document
        .querySelectorAll('[data-persona]')
        .forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button))
        )
      const persona = personas[button.dataset.persona]
      document.getElementById('persona-label').textContent = persona.label
      document.getElementById('persona-quote').textContent = persona.quote
      document
        .querySelector('.character-universe')
        .style.setProperty('--persona-color', persona.color)
      const quote = document.querySelector('.persona-quote')
      quote.classList.remove('changing')
      requestAnimationFrame(() => quote.classList.add('changing'))
    })
  )
  const appearance = document.getElementById('appearance')
  document.querySelectorAll('.theme-tabs [data-theme]').forEach((button) =>
    button.addEventListener('click', () => {
      document
        .querySelectorAll('.theme-tabs [data-theme]')
        .forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button))
        )
      appearance.dataset.theme = button.dataset.theme
    })
  )
  document.getElementById('blur-control').addEventListener('input', (event) => {
    appearance.style.setProperty('--glass-blur', event.target.value + 'px')
    document.getElementById('blur-value').textContent =
      event.target.value + ' px'
  })
  document
    .getElementById('opacity-control')
    .addEventListener('input', (event) => {
      appearance.style.setProperty(
        '--glass-alpha',
        String(1 - Number(event.target.value) / 100)
      )
      document.getElementById('opacity-value').textContent =
        event.target.value + '%'
    })
  const dockMessages = {
    web: '独立页面舱已连接 · 自定义 HTML、CSS 与 JavaScript 页面。',
    canvas: '创作轨道已连接 · 用 Canvas、WASM 与资源构建体验。',
    chat: '对话连接端已连接 · 扩展聊天动作或自定义对话界面。',
    world: '探索星图已连接 · 通过第三方目录与本地导入探索插件。',
  }
  document.querySelectorAll('[data-dock]').forEach((button) =>
    button.addEventListener('click', () => {
      document
        .querySelectorAll('[data-dock]')
        .forEach((item) =>
          item.setAttribute('aria-pressed', String(item === button))
        )
      document.getElementById('dock-status').textContent =
        dockMessages[button.dataset.dock]
      document.querySelector('.ecosystem-space').classList.add('docked')
    })
  )
  if ('IntersectionObserver' in window) {
    root.classList.add('js-motion')
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            revealObserver.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -20px 0px' }
    )
    document
      .querySelectorAll('.reveal')
      .forEach((item) => revealObserver.observe(item))
    const chatObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          if (!paused) typeAnswer(currentAnswer)
          chatObserver.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    chatObserver.observe(answer)
  }
  resize()
  scrollState()
  motionState()
  // Keep all website download buttons on the existing server proxy and current
  // published release. The bundled URL remains usable if metadata is unavailable.
  if (location.hostname === 'skymoni.com') {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    fetch(
      '/api/app-update/latest?platform=android&abi=arm64-v8a&version_code=0',
      { signal: controller.signal, credentials: 'omit' }
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        const data = result?.success && result.data
        if (
          !data ||
          data.package_name !== 'com.skyjjgw.independent.ski' ||
          !data.download_url
        )
          return
        const url = new URL(data.download_url, location.origin)
        if (
          url.origin !== location.origin ||
          !/^\/api\/app-update\/download\/[A-Za-z0-9._-]+\/arm64-v8a$/.test(
            url.pathname
          ) ||
          url.search ||
          url.hash
        )
          return
        document.querySelectorAll('a[download]').forEach((link) => {
          link.href = url.pathname
        })
      })
      .catch(() => {})
      .finally(() => clearTimeout(timeout))
  }
})()
