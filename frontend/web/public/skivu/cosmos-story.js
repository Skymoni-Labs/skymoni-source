;(() => {
  'use strict'
  const journey = document.querySelector('.cosmos-journey')
  if (!journey) return
  const root = document.documentElement
  const stage = journey.querySelector('.cosmos-base')
  const chapters = [...journey.querySelectorAll('[data-cosmos-chapter]')]
  const links = [...journey.querySelectorAll('[data-cosmos-link]')]
  const stops = [...journey.querySelectorAll('[data-cosmos-stop]')]
  const labels = {
    overview: ['00 / 你的宇宙，正在苏醒', 'THE GRAVITY OF YOU'],
    conversation: ['01 / 让每一个想法，都有回响', 'A SIGNAL BECOMES A CONNECTION'],
    characters: ['02 / 不同的相遇，同样的引力', 'YOUR OWN CONSTELLATION'],
    appearance: ['03 / 让喜欢的光，照进你的世界', 'A SPECTRUM THAT FEELS LIKE YOU'],
    ecosystem: ['04 / 连接，从此没有尽头', 'BEYOND EVERY HORIZON'],
  }
  let active = '', queued = false, step = 0, top = 0
  function sendChapter() {
    document.dispatchEvent(new CustomEvent('skivu-cosmos-change', { detail: { chapter: active } }))
  }
  function select(index) {
    const key = chapters[index].dataset.cosmosChapter
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
    document.getElementById('cosmos-coordinate').textContent = labels[key][0]
    document.getElementById('cosmos-scene-name').textContent = labels[key][1]
    links.forEach(link => {
      if (link.dataset.cosmosLink === active) link.setAttribute('aria-current', 'step')
      else link.removeAttribute('aria-current')
    })
    sendChapter()
  }
  function update() {
    queued = false
    const distance = scrollY - top
    const index = Math.max(0, Math.min(chapters.length - 1, Math.floor((distance + 2) / step)))
    select(index)
    journey.style.setProperty('--cosmos-progress', String(Math.max(0, Math.min(1, distance / (step * (chapters.length - 1))))))
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
    const index = chapters.findIndex(chapter => chapter.dataset.cosmosChapter === key)
    if (index < 0) return
    measure()
    const target = Math.round(top + index * step + 80)
    // A pinned stage remains in the same place. Position directly at the
    // requested stop, then animate its content/camera without flashing every
    // intermediate chapter during a long navigation jump.
    root.classList.add('cosmos-instant-scroll')
    scrollTo({ top: target, behavior: 'auto' })
    update()
    requestAnimationFrame(() => {
      chapters[0].parentElement.scrollTop = 0
      root.classList.remove('cosmos-instant-scroll')
    })
  }
  function hashChapter() {
    const key = location.hash.slice(1)
    const cosmosHash = Object.prototype.hasOwnProperty.call(labels, key)
    // The browser's saved page offset must not override a chapter deep link
    // after reload or iframe initialization. Other page anchors keep native
    // history restoration.
    history.scrollRestoration = cosmosHash ? 'manual' : 'auto'
    if (cosmosHash) goToChapter(key)
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
  journey.classList.add('cosmos-scroll-mode')
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
  document.addEventListener('skivu-cosmos-ready', sendChapter)
})()
