;(() => {
  'use strict'
  const journey = document.querySelector('.station-journey')
  if (!journey) return
  const frame = document.getElementById('station-viewer')
  const chapters = [...journey.querySelectorAll('[data-station-chapter]')]
  const links = [...journey.querySelectorAll('[data-station-link]')]
  const labels = {
    overview: ['00 / 抵达你的空间', '空间站总览'],
    conversation: ['01 / 对话中枢', '让思绪接入轨道'],
    characters: ['02 / 角色舱', '连接你的专属角色'],
    appearance: ['03 / 光影舱', '调出自己的样子'],
    ecosystem: ['04 / 拓展坞', '连接开放插件生态'],
  }
  let active = 'overview', queued = false
  function sendChapter() {
    frame.contentWindow?.postMessage({ type: 'skivu-station-chapter', chapter: active }, location.origin)
  }
  function update() {
    queued = false
    const mobile = innerWidth <= 900
    const threshold = mobile ? Math.max(310, innerHeight * .48) : innerHeight * .48
    let selected = chapters[0]
    for (const chapter of chapters) {
      if (chapter.getBoundingClientRect().top <= threshold) selected = chapter
    }
    const key = selected.dataset.stationChapter
    const box = journey.getBoundingClientRect()
    journey.style.setProperty('--station-progress', String(Math.max(0, Math.min(1, -box.top / Math.max(1, box.height - innerHeight)))))
    if (key === active) return
    active = key
    journey.dataset.activeChapter = active
    document.getElementById('base-coordinate').textContent = labels[active][0]
    document.getElementById('base-target').textContent = labels[active][1]
    links.forEach(link => {
      if (link.dataset.stationLink === active) link.setAttribute('aria-current', 'step')
      else link.removeAttribute('aria-current')
    })
    sendChapter()
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(update) } }
  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule, { passive: true })
  addEventListener('pageshow', schedule)
  frame.addEventListener('load', sendChapter)
  addEventListener('message', event => {
    if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'skivu-station-ready') sendChapter()
  })
  update()
})()
