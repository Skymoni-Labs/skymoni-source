;(() => {
  'use strict'
  const root = document.documentElement
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const header = document.querySelector('.site-header')
  const motionButton = document.querySelector('.motion-toggle')
  const menuButton = document.querySelector('.menu-toggle')
  const film = document.getElementById('brand-film')
  const scenes = [...document.querySelectorAll('[data-scene]')]
  const chapterLinks = [...document.querySelectorAll('.voyage-index a')]
  let paused = reduced.matches, scrollFrame = 0, pointerFrame = 0
  let activeScene = -1, typingTimer = 0, currentScenario = 'idea'
  const scenarios = {
    idea: {question: '想把今天零散的灵感，\n整理成一个开始。', answer: '先选一个你最想实现的。我们把它拆成今天就能完成的第一步。'},
    daily: {question: '今天有点忙，\n想停下来聊一会儿。', answer: '那就先把节奏放慢一点。今天有没有一个小小的瞬间，让你想留住？'},
    think: {question: '有两个都不错的想法，\n怎么决定先做哪一个？', answer: '先看看你最在意什么、现在能投入多少。我们把两个想法分别拆开，从最容易验证的一步开始。'},
  }
  const question = document.getElementById('demo-question')
  const answer = document.getElementById('demo-answer')
  function finishTyping() {
    clearTimeout(typingTimer)
    document.getElementById('chat-status').textContent = scenarios[currentScenario].answer
    answer.textContent = scenarios[currentScenario].answer
    answer.classList.remove('typing')
  }
  function replay() {
    finishTyping()
    if (paused || document.hidden) return
    const text = scenarios[currentScenario].answer
    let position = 0
    document.getElementById('chat-status').textContent = ''
    answer.textContent = ''
    answer.classList.add('typing')
    const type = () => {
      answer.textContent = text.slice(0, ++position)
      if (position < text.length) typingTimer = setTimeout(type, /[。！？：，]/.test(text[position - 1]) ? 220 : 48)
      else {answer.classList.remove('typing');document.getElementById('chat-status').textContent = text}
    }
    typingTimer = setTimeout(type, 240)
  }
  document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => {
    currentScenario = button.dataset.scenario
    document.querySelectorAll('[data-scenario]').forEach(item => item.setAttribute('aria-pressed', String(item === button)))
    question.textContent = scenarios[currentScenario].question
    replay()
  }))
  document.getElementById('replay-chat').addEventListener('click', replay)
  question.textContent = scenarios.idea.question
  const personas = {
    cloud: {label:'云朵 / 日常陪伴',quote:'“慢慢说，我在这里。”',color:'#a5cdf3'},
    idea: {label:'灵感搭档 / 一起创造',quote:'“这个想法，值得再往前一步。”',color:'#a7d9cc'},
    night: {label:'深夜倾听 / 安静交流',quote:'“夜还很长，不必急着说完。”',color:'#bdb0e9'},
  }
  document.querySelectorAll('[data-persona]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-persona]').forEach(item => item.setAttribute('aria-pressed',String(item === button)))
    const persona = personas[button.dataset.persona]
    document.getElementById('persona-label').textContent = persona.label
    document.getElementById('persona-quote').textContent = persona.quote
    document.querySelector('.character-system').style.setProperty('--persona-color',persona.color)
    const message = document.querySelector('.persona-message')
    message.classList.remove('changing')
    requestAnimationFrame(() => message.classList.add('changing'))
  }))
  const appearance = document.getElementById('appearance')
  document.querySelectorAll('.theme-select [data-theme]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.theme-select [data-theme]').forEach(item => item.setAttribute('aria-pressed',String(item === button)))
    appearance.dataset.theme = button.dataset.theme
  }))
  document.getElementById('blur-control').addEventListener('input',event => {
    appearance.style.setProperty('--glass-blur',event.target.value+'px')
    document.getElementById('blur-value').textContent = event.target.value+' px'
  })
  document.getElementById('opacity-control').addEventListener('input',event => {
    appearance.style.setProperty('--glass-alpha',String(1-Number(event.target.value)/100))
    document.getElementById('opacity-value').textContent = event.target.value+'%'
  })
  const dockMessages = {web:'独立的页面与交互，让体验拥有更多形态。',canvas:'用页面、画布与资源，把自己的创意变成体验。',chat:'扩展聊天动作，或构建自己的对话界面。',world:'通过第三方目录与本地导入，探索新的插件。'}
  document.querySelectorAll('[data-dock]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-dock]').forEach(item => item.setAttribute('aria-pressed',String(item === button)))
    document.getElementById('dock-status').textContent = dockMessages[button.dataset.dock]
    document.querySelector('.open-constellation').dataset.connected = button.dataset.dock
  }))
  function closeMenu() {
    header.classList.remove('menu-open')
    menuButton.setAttribute('aria-expanded','false')
    menuButton.setAttribute('aria-label','打开导航')
  }
  menuButton.addEventListener('click', () => {
    const opened = menuButton.getAttribute('aria-expanded') !== 'true'
    header.classList.toggle('menu-open',opened)
    menuButton.setAttribute('aria-expanded',String(opened))
    menuButton.setAttribute('aria-label',opened?'关闭导航':'打开导航')
  })
  header.querySelectorAll('nav a').forEach(link => link.addEventListener('click',closeMenu))
  document.addEventListener('keydown',event => {if(event.key==='Escape') closeMenu()})
  function pauseFilm() {film.contentWindow?.postMessage('skivu-film-pause',location.origin)}
  function motionState() {
    root.classList.toggle('motion-paused',paused)
    motionButton.setAttribute('aria-pressed',String(paused))
    motionButton.setAttribute('aria-label',paused?'开启动画效果':'暂停动态效果')
    motionButton.querySelector('span').textContent = paused?'动态暂停':'动态开启'
    document.dispatchEvent(new CustomEvent('skivu-motion-change',{detail:{paused}}))
    if(paused){finishTyping();root.style.setProperty('--pointer-x','0');root.style.setProperty('--pointer-y','0');pauseFilm()}
  }
  motionButton.addEventListener('click',() => {paused=!paused;motionState()})
  reduced.addEventListener('change',event => {paused=event.matches;motionState()})
  let nextX=0,nextY=0
  window.addEventListener('pointermove',event => {
    if(paused||event.pointerType!=='mouse'||innerWidth<780)return
    nextX=event.clientX/innerWidth-.5;nextY=event.clientY/innerHeight-.5
    if(!pointerFrame)pointerFrame=requestAnimationFrame(() => {pointerFrame=0;root.style.setProperty('--pointer-x',nextX.toFixed(3));root.style.setProperty('--pointer-y',nextY.toFixed(3))})
  },{passive:true})
  document.addEventListener('pointerleave',()=>{root.style.setProperty('--pointer-x','0');root.style.setProperty('--pointer-y','0')})
  function updateScroll() {
    scrollFrame=0
    header.classList.toggle('scrolled',scrollY>40)
    document.querySelector('.read-progress').style.transform=`scaleX(${scrollY/Math.max(1,root.scrollHeight-innerHeight)})`
    const line=innerHeight*.48
    let selected=scenes[0]
    for(const section of scenes)if(section.getBoundingClientRect().top<=line)selected=section
    const index=Number(selected.dataset.scene)
    const bounds=selected.getBoundingClientRect()
    const progress=Math.min(1,Math.max(0,(line-bounds.top)/Math.max(1,bounds.height)))
    root.dataset.gateScene=String(index)
    if(activeScene!==index){activeScene=index;chapterLinks.forEach(link=>{if(link.hash==='#'+selected.id)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')})}
    document.dispatchEvent(new CustomEvent('gate:scene',{detail:{scene:index,progress}}))
  }
  function scheduleScroll(){if(!scrollFrame)scrollFrame=requestAnimationFrame(updateScroll)}
  window.addEventListener('scroll',scheduleScroll,{passive:true})
  window.addEventListener('resize',scheduleScroll,{passive:true})
  window.addEventListener('pageshow',scheduleScroll)
  document.addEventListener('gate:ready',updateScroll)
  document.addEventListener('visibilitychange',()=>{if(document.hidden){finishTyping();pauseFilm()}else updateScroll()})
  // Natural document flow: every section owns its height. Nothing is overlaid
  // on a previous product panel, and native deep links/back navigation work.
  const legacy={overview:'home','orbital-lab':'conversation',experience:'conversation'}
  if(legacy[location.hash.slice(1)]){
    const id=legacy[location.hash.slice(1)]
    history.replaceState(null,'','#'+id)
    requestAnimationFrame(()=>document.getElementById(id).scrollIntoView({behavior:'instant'}))
  }
  if('IntersectionObserver'in window){
    root.classList.add('js-ready')
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.08,rootMargin:'0px 0px -20px 0px'})
    document.querySelectorAll('.reveal').forEach(item=>observer.observe(item))
    const chatObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){replay();chatObserver.disconnect()}},{threshold:.55})
    chatObserver.observe(answer)
    new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)pauseFilm()},{threshold:.05}).observe(film)
  }
  motionState();updateScroll()
  // All download actions stay on the existing first-party server proxy.
  if(location.hostname==='skymoni.com'){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000)
    fetch('/api/app-update/latest?platform=android&abi=arm64-v8a&version_code=0',{signal:controller.signal,credentials:'omit'})
      .then(response=>response.ok?response.json():null)
      .then(result=>{
        const data=result?.success&&result.data
        if(!data||data.package_name!=='com.skyjjgw.independent.ski'||!data.download_url)return
        const url=new URL(data.download_url,location.origin)
        if(url.origin!==location.origin||!/^\/api\/app-update\/download\/[A-Za-z0-9._-]+\/arm64-v8a$/.test(url.pathname)||url.search||url.hash)return
        document.querySelectorAll('a[download]').forEach(link=>{link.href=url.pathname})
      }).catch(()=>{}).finally(()=>clearTimeout(timeout))
  }
})()
