;(() => {
  'use strict'
  const journey = document.querySelector('.station-journey')
  if (!journey) return
  const root = document.documentElement
  const frame = document.getElementById('station-viewer')
  const stage = journey.querySelector('.station-base')
  const chapters = [...journey.querySelectorAll('[data-station-chapter]')]
  const links = [...journey.querySelectorAll('[data-station-link]')]
  const stops = [...journey.querySelectorAll('[data-station-stop]')]
  const renderStatus = document.getElementById('base-render-status')
  const retryButton = document.getElementById('station-retry')
  const labels = {
    overview: ['00 / 抵达你的空间', '空间站总览'],
    conversation: ['01 / 对话中枢', '让思绪接入轨道'],
    characters: ['02 / 角色舱', '连接你的专属角色'],
    appearance: ['03 / 光影舱', '调出自己的样子'],
    ecosystem: ['04 / 拓展坞', '连接开放插件生态'],
  }
  let active = '', queued = false, step = 0, top = 0
  function sendChapter() {
    frame.contentWindow?.postMessage({ type: 'skivu-station-chapter', chapter: active }, location.origin)
    frame.contentWindow?.postMessage({ type: 'skivu-station-query' }, location.origin)
  }
  function select(index) {
    const key = chapters[index].dataset.stationChapter
    if (key === active) return
    // Remove every previous chapter before revealing the next. Hidden panels
    // cannot overlap, receive focus or appear in the accessibility tree.
    chapters.forEach(chapter => {
      chapter.hidden = true
      chapter.inert = true
      chapter.classList.remove('is-active')
    })
    const chapter = chapters[index]
    chapter.hidden = false
    chapter.inert = false
    chapter.classList.add('is-active')
    chapters[0].parentElement.scrollTop = 0
    active = key
    journey.dataset.activeChapter = active
    document.getElementById('base-coordinate').textContent = labels[key][0]
    document.getElementById('base-target').textContent = labels[key][1]
    links.forEach(link => {
      if (link.dataset.stationLink === active) link.setAttribute('aria-current', 'step')
      else link.removeAttribute('aria-current')
    })
    sendChapter()
  }
  function update() {
    queued = false
    const distance = scrollY - top
    const index = Math.max(0, Math.min(chapters.length - 1, Math.floor((distance + 2) / step)))
    select(index)
    journey.style.setProperty('--station-progress', String(Math.max(0, Math.min(1, distance / (step * (chapters.length - 1))))))
  }
  function measure() {
    top = journey.getBoundingClientRect().top + scrollY
    step = Math.max(stage.offsetHeight * .96, innerWidth <= 900 ? 430 : 560)
    journey.style.height = Math.ceil(stage.offsetHeight + step * chapters.length) + 'px'
    stops.forEach((stop, index) => { stop.style.top = Math.round(index * step + 150) + 'px' })
    update()
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(update) } }
  function goToChapter(key) {
    const index = chapters.findIndex(chapter => chapter.dataset.stationChapter === key)
    if (index < 0) return
    measure()
    const target = Math.round(top + index * step + 80)
    // A pinned stage remains in the same place. Position directly at the
    // requested stop, then animate its content/camera without flashing every
    // intermediate chapter during a long navigation jump.
    root.classList.add('station-instant-scroll')
    scrollTo({ top: target, behavior: 'auto' })
    update()
    requestAnimationFrame(() => {
      chapters[0].parentElement.scrollTop = 0
      root.classList.remove('station-instant-scroll')
    })
  }
  function hashChapter() {
    const key = location.hash.slice(1)
    const stationHash = Object.prototype.hasOwnProperty.call(labels, key)
    // The browser's saved page offset must not override a chapter deep link
    // after reload or iframe initialization. Other page anchors keep native
    // history restoration.
    history.scrollRestoration = stationHash ? 'manual' : 'auto'
    if (stationHash) goToChapter(key)
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    const key = link.hash.slice(1)
    if (!Object.prototype.hasOwnProperty.call(labels, key)) return
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      history.pushState(null, '', '#' + key)
      goToChapter(key)
    })
  })
  journey.classList.add('station-scroll-mode')
  measure()
  hashChapter()
  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', () => {
    const key = active
    const box = stage.getBoundingClientRect()
    const pinned = Math.abs(box.top - (innerWidth <= 900 ? 62 : 72)) < 3
    measure()
    if (pinned) goToChapter(key)
  }, { passive: true })
  addEventListener('load', () => { measure(); hashChapter() }, { once: true })
  addEventListener('pageshow', measure)
  addEventListener('popstate', hashChapter)
  addEventListener('hashchange', hashChapter)
  frame.addEventListener('load', sendChapter)
  retryButton.addEventListener('click', () => {
    const url = new URL(frame.src)
    url.searchParams.delete('compat')
    renderStatus.textContent = '三维场景载入中'
    journey.dataset.renderMode = 'loading'
    retryButton.hidden = true
    frame.src = url.href
  })
  if (new URLSearchParams(location.search).get('station_compat') === '1') {
    const url = new URL(frame.src)
    url.searchParams.set('compat', '1')
    frame.src = url.href
  }
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return
    if (event.data?.type === 'skivu-station-ready') sendChapter()
    if (event.data?.type === 'skivu-station-mode' && ['2d','3d'].includes(event.data.mode)) {
      journey.dataset.renderMode = event.data.mode
      renderStatus.textContent = event.data.mode === '3d' ? '三维场景已就绪' : '当前为二维结构预览'
      retryButton.hidden = event.data.mode !== '2d'
    }
  })
})()
