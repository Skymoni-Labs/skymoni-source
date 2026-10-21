import { useEffect, useRef } from 'react'

import '@/styles/home-void.css'

type Star = {
  x: number
  y: number
  radius: number
  alpha: number
  phase: number
  depth: number
  warm: boolean
  offsetX: number
  offsetY: number
  velocityX: number
  velocityY: number
}

// A cached, low-resolution nebula gives the sky texture without a large image
// download or recalculating procedural noise in the animation loop.
function createNebula(width: number, height: number) {
  const layer = document.createElement('canvas')
  layer.width = Math.min(640, Math.round(width * 0.6))
  layer.height = Math.round((layer.width * height) / width)
  const context = layer.getContext('2d')
  if (!context) return layer
  const image = context.createImageData(layer.width, layer.height)
  const hash = (x: number, y: number) => {
    const value = Math.sin(x * 127.1 + y * 311.7 + 81.29) * 43758.5453
    return value - Math.floor(value)
  }
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = hash(ix, iy)
    const b = hash(ix + 1, iy)
    const c = hash(ix, iy + 1)
    const d = hash(ix + 1, iy + 1)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      const u = x / layer.width
      const v = y / layer.height
      let cloud = 0
      let frequency = 3
      let amplitude = 0.55
      for (let octave = 0; octave < 5; octave++) {
        cloud += noise(u * frequency, v * frequency) * amplitude
        frequency *= 2.1
        amplitude *= 0.5
      }
      const ridge = v - (0.8 - u * 0.58 + Math.sin(u * 5) * 0.06)
      const dust = Math.exp(-(ridge * ridge) / 0.035) * cloud ** 2.6
      const veil = Math.exp(-((u - 0.55) ** 2 + (v - 0.45) ** 2) * 2.5)
      const tint = (Math.sin(u * 4 + v * 2) + 1) / 2
      const index = (y * layer.width + x) * 4
      image.data[index] = 4 + veil * 3 + dust * (22 + tint * 12)
      image.data[index + 1] = 7 + veil * 5 + dust * (49 - tint * 9)
      image.data[index + 2] = 16 + veil * 9 + dust * 88
      image.data[index + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  return layer
}

export function SiteVoidBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !context) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let width = 0
    let height = 0
    let frame = 0
    let lastDraw = 0
    let activeTime = 0
    let stars: Star[] = []
    let nebula: HTMLCanvasElement | null = null
    const pointer = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      active: false,
    }
    let nextMeteor = 7
    let meteor: { start: number; x: number; y: number } | null = null

    const draw = (time = 0) => {
      frame = 0
      if (
        document.hidden ||
        !document.documentElement.classList.contains('dark')
      ) {
        return
      }
      const elapsed = lastDraw ? Math.min(50, time - lastDraw) : 0
      if (!motion.matches) activeTime += elapsed
      lastDraw = time
      const seconds = activeTime / 1000
      const step = elapsed / (1000 / 30)
      pointer.x += (pointer.targetX - pointer.x) * 0.12
      pointer.y += (pointer.targetY - pointer.y) * 0.12
      const parallaxX = pointer.active ? (pointer.x / width - 0.5) * 8 : 0
      const parallaxY = pointer.active ? (pointer.y / height - 0.5) * 6 : 0
      const driftX = Math.sin(seconds * 0.018) * 9 + parallaxX
      const driftY = Math.cos(seconds * 0.014) * 6 + parallaxY
      context.globalAlpha = 1
      if (!nebula) nebula = createNebula(width, height)
      context.drawImage(
        nebula,
        -24 + driftX,
        -24 + driftY,
        width + 48,
        height + 48
      )

      const interactive = pointer.active && !motion.matches
      if (interactive) {
        const halo = context.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          190
        )
        halo.addColorStop(0, '#74a8dd0b')
        halo.addColorStop(1, '#74a8dd00')
        context.fillStyle = halo
        context.fillRect(pointer.x - 190, pointer.y - 190, 380, 380)
      }
      const nearby: { x: number; y: number; alpha: number }[] = []
      for (const star of stars) {
        const baseX =
          ((star.x * (width + 40) + seconds * (0.35 + star.depth * 0.7)) %
            (width + 40)) -
          20
        const baseY =
          star.y * height + Math.sin(seconds * 0.025 + star.phase) * 7
        const dx = baseX - pointer.x
        const dy = baseY - pointer.y
        const distance = Math.hypot(dx, dy)
        const influence = interactive ? Math.max(0, 1 - distance / 170) ** 2 : 0
        const push = influence * (24 + star.depth * 32)
        const targetX = (dx / Math.max(distance, 1)) * push
        const targetY = (dy / Math.max(distance, 1)) * push
        // A damped spring lets stars drift back instead of snapping to place.
        const damping = Math.pow(0.74, step)
        star.velocityX =
          (star.velocityX + (targetX - star.offsetX) * 0.095 * step) * damping
        star.velocityY =
          (star.velocityY + (targetY - star.offsetY) * 0.095 * step) * damping
        star.offsetX += star.velocityX * step
        star.offsetY += star.velocityY * step
        const x = baseX + star.offsetX - parallaxX * star.depth
        const y = baseY + star.offsetY - parallaxY * star.depth
        const twinkle = motion.matches
          ? 0.8
          : 0.8 +
            Math.sin(seconds * (0.25 + star.depth * 0.16) + star.phase) * 0.2
        context.globalAlpha = Math.min(
          1,
          star.alpha * twinkle + influence * 0.25
        )
        if (star.radius > 1.1) {
          const halo = context.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            star.radius * 5
          )
          halo.addColorStop(0, '#a0c8ff65')
          halo.addColorStop(1, '#a0c8ff00')
          context.fillStyle = halo
          context.fillRect(
            x - star.radius * 5,
            y - star.radius * 5,
            star.radius * 10,
            star.radius * 10
          )
        }
        context.fillStyle = star.warm ? '#eadfcf' : '#cadff8'
        context.beginPath()
        context.arc(x, y, star.radius, 0, Math.PI * 2)
        context.fill()
        if (star.radius > 1.5) {
          context.strokeStyle = '#d5e7ff'
          context.lineWidth = 0.5
          context.globalAlpha *= 0.35
          context.beginPath()
          context.moveTo(x - 4, y)
          context.lineTo(x + 4, y)
          context.moveTo(x, y - 4)
          context.lineTo(x, y + 4)
          context.stroke()
        }
        if (influence > 0.04 && nearby.length < 22) {
          nearby.push({ x, y, alpha: influence })
        }
      }
      // Fleeting constellation threads only appear around the pointer.
      context.lineWidth = 0.5
      context.strokeStyle = '#86aedc'
      for (let i = 0; i < nearby.length; i++) {
        for (let j = i + 1; j < nearby.length; j++) {
          const a = nearby[i]
          const b = nearby[j]
          const distance = Math.hypot(a.x - b.x, a.y - b.y)
          if (distance > 82) continue
          context.globalAlpha =
            Math.min(a.alpha, b.alpha) * (1 - distance / 82) * 0.2
          context.beginPath()
          context.moveTo(a.x, a.y)
          context.lineTo(b.x, b.y)
          context.stroke()
        }
      }
      if (!motion.matches && seconds > nextMeteor && !meteor) {
        meteor = {
          start: seconds,
          x: width * (0.2 + ((seconds * 0.13) % 0.55)),
          y: height * 0.12,
        }
        nextMeteor = seconds + 16
      }
      if (meteor) {
        const progress = (seconds - meteor.start) / 1.8
        if (progress >= 1) meteor = null
        else {
          const x = meteor.x + progress * 180
          const y = meteor.y + progress * 110
          const trail = context.createLinearGradient(x - 100, y - 61, x, y)
          trail.addColorStop(0, '#a9ccff00')
          trail.addColorStop(1, '#d9e9ff')
          context.strokeStyle = trail
          context.globalAlpha = Math.sin(progress * Math.PI) * 0.24
          context.lineWidth = 1
          context.beginPath()
          context.moveTo(x - 100, y - 61)
          context.lineTo(x, y)
          context.stroke()
        }
      }
      context.globalAlpha = 1
      if (!motion.matches) frame = requestAnimationFrame(tick)
    }
    const tick = (time: number) => {
      if (time - lastDraw < 32) {
        frame = requestAnimationFrame(tick)
        return
      }
      draw(time)
    }
    const sync = () => {
      cancelAnimationFrame(frame)
      lastDraw = 0
      if (
        !document.hidden &&
        document.documentElement.classList.contains('dark')
      ) {
        draw()
      }
    }
    const resize = () => {
      width = document.documentElement.clientWidth
      height = window.innerHeight
      const ratio = Math.min(devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      let seed = 8129
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 4294967296
      }
      nebula = null
      stars = Array.from(
        { length: Math.min(300, Math.round((width * height) / 3400)) },
        () => {
          const x = random()
          const band = 0.8 - x * 0.58 + Math.sin(x * 5) * 0.06
          const y =
            random() < 0.38 ? band + (random() + random() - 1) * 0.19 : random()
          return {
            x,
            y,
            radius: 0.3 + random() ** 4 * 1.4,
            alpha: 0.22 + random() * 0.55,
            phase: random() * Math.PI * 2,
            depth: 0.2 + random() * 0.8,
            warm: random() > 0.84,
            offsetX: 0,
            offsetY: 0,
            velocityX: 0,
            velocityY: 0,
          }
        }
      )
      sync()
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || motion.matches) return
      if (!pointer.active) {
        pointer.x = event.clientX
        pointer.y = event.clientY
      }
      pointer.targetX = event.clientX
      pointer.targetY = event.clientY
      pointer.active = true
    }
    const leave = (event?: PointerEvent | FocusEvent) => {
      if (!event || !event.relatedTarget) pointer.active = false
    }
    const theme = new MutationObserver(sync)
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerout', leave, { passive: true })
    window.addEventListener('blur', leave)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    resize()
    return () => {
      cancelAnimationFrame(frame)
      theme.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerout', leave)
      window.removeEventListener('blur', leave)
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
    }
  }, [])

  return (
    <canvas ref={canvasRef} className='site-void-backdrop' aria-hidden='true' />
  )
}
