type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  size: number
  color: string
  star: boolean
}
const editable =
  'input,textarea,[contenteditable="true"],[role="textbox"],pre,code'

/** Decorative only: the browser owns hit testing, selection, focus and the real pointer. */
export function attachPointerMotion(
  canvas: HTMLCanvasElement,
  dark: boolean,
  starsOnly: boolean
) {
  const context = canvas.getContext('2d')
  if (!context) return () => undefined
  const colors = dark
    ? ['#9fcdf6', '#c8b3f6', '#a5e3e2']
    : ['#7195d0', '#ad91ce', '#75b8c5']
  let particles: Particle[] = []
  let frame = 0,
    last = 0,
    lastSpawn = 0
  let x = 0,
    y = 0
  let width = innerWidth,
    height = innerHeight
  const resize = () => {
    width = innerWidth
    height = innerHeight
    canvas.width = width
    canvas.height = height
  }
  resize()
  const clear = () => {
    cancelAnimationFrame(frame)
    frame = 0
    last = 0
    particles = []
    context.clearRect(0, 0, width, height)
  }
  const draw = (now: number) => {
    frame = 0
    if (document.hidden) {
      clear()
      return
    }
    const dt = last ? Math.min(now - last, 40) : 16
    last = now
    context.clearRect(0, 0, width, height)
    particles = particles.filter((particle) => particle.age < particle.life)
    for (const p of particles) {
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy -= 0.000012 * dt
      context.globalAlpha = Math.max(0, 1 - p.age / p.life) * 0.65
      context.strokeStyle = p.color
      context.fillStyle = p.color
      context.lineWidth = 1
      context.beginPath()
      if (p.star) {
        const size = p.size * (1 - (p.age / p.life) * 0.4)
        context.moveTo(p.x, p.y - size)
        context.quadraticCurveTo(
          p.x + size * 0.15,
          p.y - size * 0.15,
          p.x + size,
          p.y
        )
        context.quadraticCurveTo(
          p.x + size * 0.15,
          p.y + size * 0.15,
          p.x,
          p.y + size
        )
        context.quadraticCurveTo(
          p.x - size * 0.15,
          p.y + size * 0.15,
          p.x - size,
          p.y
        )
        context.quadraticCurveTo(
          p.x - size * 0.15,
          p.y - size * 0.15,
          p.x,
          p.y - size
        )
        context.fill()
      } else {
        context.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        context.stroke()
      }
    }
    context.globalAlpha = 1
    if (particles.length) {
      frame = requestAnimationFrame(draw)
    } else last = 0
  }
  const wake = () => {
    if (!frame && !document.hidden) frame = requestAnimationFrame(draw)
  }
  const addParticle = (px: number, py: number, burst: boolean, index = 0) => {
    if (particles.length >= 32) particles.shift()
    const angle = (index / 8) * Math.PI * 2
    particles.push({
      x: px,
      y: py,
      vx: burst ? Math.cos(angle) * 0.07 : -0.006,
      vy: burst ? Math.sin(angle) * 0.07 : -0.014,
      age: 0,
      life: burst ? 550 : 420,
      size: burst ? 3.5 + (index % 3) : 2.4,
      color: colors[index % colors.length],
      star: starsOnly || index % 2 === 0,
    })
  }
  const move = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || document.hidden) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest(editable)) return
    const distance = Math.hypot(event.clientX - x, event.clientY - y)
    x = event.clientX
    y = event.clientY
    const now = performance.now()
    if (distance > 10 && now - lastSpawn > 45) {
      addParticle(x + 11, y + 16, false, Math.floor(now / 45) % 3)
      lastSpawn = now
    }
    wake()
  }
  const down = (event: PointerEvent) => {
    if (
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      document.hidden
    ) {
      return
    }
    if (event.target instanceof Element && event.target.closest(editable)) {
      return
    }
    for (let i = 0; i < 8; i++) {
      addParticle(event.clientX, event.clientY, true, i)
    }
    wake()
  }
  const leave = (event: PointerEvent) => {
    if (!event.relatedTarget) clear()
  }
  document.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerdown', down, { passive: true })
  document.addEventListener('pointerout', leave, { passive: true })
  document.addEventListener('keydown', clear)
  document.addEventListener('visibilitychange', clear)
  window.addEventListener('blur', clear)
  window.addEventListener('resize', resize, { passive: true })
  return () => {
    clear()
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerdown', down)
    document.removeEventListener('pointerout', leave)
    document.removeEventListener('keydown', clear)
    document.removeEventListener('visibilitychange', clear)
    window.removeEventListener('blur', clear)
    window.removeEventListener('resize', resize)
  }
}
