import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  MessageCircle,
  Palette,
  Play,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, type PointerEvent } from 'react'

function Starfield({ paused }: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    let frame = 0,
      width = 0,
      height = 0,
      last = 0,
      onscreen = true
    const pointer = { x: -500, y: -500 }
    const stars = Array.from({ length: 100 }, (_, i) => ({
      x: ((i * 127.13) % 997) / 997,
      y: ((i * 173.7) % 991) / 991,
      radius: 0.4 + (i % 4) * 0.3,
      phase: i * 1.77,
    }))
    const draw = (time: number) => {
      context.clearRect(0, 0, width, height)
      stars.forEach((star) => {
        const x =
          star.x * width +
          (paused ? 0 : Math.sin(time * 0.00005 + star.phase) * 9)
        const y =
          star.y * height +
          (paused ? 0 : Math.cos(time * 0.00004 + star.phase) * 7)
        const light =
          0.22 + (1 + Math.sin((paused ? 0 : time * 0.0007) + star.phase)) * 0.2
        context.beginPath()
        context.arc(x, y, star.radius, 0, Math.PI * 2)
        context.fillStyle = `rgba(219,219,255,${light})`
        context.fill()
        const distance = Math.hypot(pointer.x - x, pointer.y - y)
        if (distance < 110) {
          context.beginPath()
          context.moveTo(x, y)
          context.lineTo(pointer.x, pointer.y)
          context.strokeStyle = `rgba(190,172,255,${(1 - distance / 110) * 0.2})`
          context.lineWidth = 0.5
          context.stroke()
        }
      })
    }
    const loop = (time: number) => {
      frame = 0
      if (!onscreen || document.hidden || paused) return
      if (time - last > 32) {
        draw(time)
        last = time
      }
      frame = requestAnimationFrame(loop)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      frame = 0
      if (paused) draw(0)
      else if (onscreen && !document.hidden) frame = requestAnimationFrame(loop)
    }
    const resize = () => {
      const bounds = canvas.getBoundingClientRect(),
        ratio = Math.min(devicePixelRatio || 1, 1.5)
      width = bounds.width
      height = bounds.height
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      draw(0)
    }
    const move = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const bounds = canvas.getBoundingClientRect()
      pointer.x = event.clientX - bounds.left
      pointer.y = event.clientY - bounds.top
    }
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            onscreen = entry.isIntersecting
            start()
          })
    observer?.observe(canvas)
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    resizeObserver?.observe(canvas)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', start)
    canvas.parentElement?.addEventListener('pointermove', move)
    resize()
    start()
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', start)
      canvas.parentElement?.removeEventListener('pointermove', move)
    }
  }, [paused])
  return <canvas className='sr-space-canvas' ref={canvasRef} aria-hidden />
}

export function SkivuHero({ paused }: { paused: boolean }) {
  const move = (event: PointerEvent<HTMLElement>) => {
    if (paused || event.pointerType !== 'mouse') return
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty(
      '--mx',
      String((event.clientX - rect.left) / rect.width - 0.5)
    )
    event.currentTarget.style.setProperty(
      '--my',
      String((event.clientY - rect.top) / rect.height - 0.5)
    )
  }
  return (
    <section
      className='sr-hero sr-art-hero'
      aria-labelledby='sr-title'
      onPointerMove={move}
    >
      <Starfield paused={paused} />
      <div className='sr-nebula sr-nebula-one' aria-hidden />
      <div className='sr-nebula sr-nebula-two' aria-hidden />
      <div className='sr-hero-copy'>
        <p className='sr-eyebrow'>
          <span />
          SKIVU / A SPACE BEYOND THE ORDINARY
        </p>
        <h1 id='sr-title'>
          <span>让灵感，</span>
          <em>脱离引力。</em>
        </h1>
        <p className='sr-lead'>
          一个属于你的 AI 空间。
          <br />
          与更多智慧对话，让角色与想象相遇。
          <br />
          下一种可能，从你开始。
        </p>
        <div className='sr-actions'>
          <a className='sr-button sr-primary' href='#download'>
            <ArrowDownToLine size={17} />
            下载 Skivu
            <ArrowUpRight size={17} />
          </a>
          <a className='sr-button sr-secondary' href='/creators/skivu-beta'>
            申请内测
            <ArrowUpRight size={17} />
          </a>
        </div>
        <a className='sr-hero-film' href='#film'>
          <span className='sr-mini-play'>
            <Play size={11} fill='currentColor' />
          </span>
          观看品牌短片<span>00:40</span>
        </a>
      </div>
      <div className='sr-orbital-scene' aria-label='探索 Skivu 的三个轨道'>
        <div className='sr-orbit-coordinate' aria-hidden>
          YOUR UNIVERSE
          <br />
          <span>IS TAKING SHAPE.</span>
        </div>
        <div className='sr-orbital-core' aria-hidden>
          <div className='sr-sphere-halo' />
          <div
            className='sr-sphere'
            style={{
              backgroundImage:
                "url('/skivu/assets/earth-blue-marble-surface.webp')",
            }}
          />
          <div className='sr-space-ring sr-ring-one' />
          <div className='sr-space-ring sr-ring-two' />
          <div className='sr-space-ring sr-ring-three' />
          <span className='sr-satellite sr-satellite-one' />
          <span className='sr-satellite sr-satellite-two' />
          <svg className='sr-orbit-lines' viewBox='0 0 600 600'>
            <circle cx='300' cy='300' r='266' />
            <circle cx='300' cy='300' r='281' />
          </svg>
        </div>
        <a className='sr-floating-module sr-module-chat' href='#conversation'>
          <span className='sr-module-symbol'>
            <MessageCircle size={18} />
          </span>
          <div>
            <small>01 / THINK</small>
            <strong>每个想法，都有回响</strong>
            <span className='sr-signal'>
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
          <ArrowUpRight size={14} />
        </a>
        <a className='sr-floating-module sr-module-role' href='#characters'>
          <span className='sr-module-avatar'>✦</span>
          <div>
            <small>02 / CONNECT</small>
            <strong>“慢慢说，我在这里。”</strong>
            <span>云朵 · 日常陪伴</span>
          </div>
        </a>
        <a className='sr-floating-module sr-module-style' href='#appearance'>
          <Palette size={18} />
          <div>
            <small>03 / MAKE IT YOURS</small>
            <strong>由你定义的色彩</strong>
            <span className='sr-colour-trail'>
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
          <ArrowUpRight size={14} />
        </a>
      </div>
      <div className='sr-hero-wordmark' aria-hidden>
        SKIVU<span>®</span>
      </div>
      <div className='sr-hero-baseline'>
        <a href='#experience'>
          <span className='sr-scroll-capsule'>
            <ArrowDown size={13} />
          </span>
          向下，开启探索
        </a>
        <span>YOUR UNIVERSE. YOUR RULES.</span>
        <span className='sr-scene-label'>SCENE 001 / ORIGIN</span>
      </div>
    </section>
  )
}

export function SkivuBeta() {
  return (
    <section className='sr-beta' id='beta' aria-labelledby='sr-beta-title'>
      <div className='sr-beta-art' aria-hidden>
        <div className='sr-portal'>
          <span />
          <span />
          <span />
          <span />
          <Sparkles size={54} />
        </div>
        <span className='sr-beta-orbit-label'>THE NEXT CHAPTER IS OURS.</span>
      </div>
      <div className='sr-beta-copy'>
        <p className='sr-eyebrow'>
          <span />
          THE INNER CIRCLE / EARLY ACCESS
        </p>
        <h2 id='sr-beta-title'>
          下一次进化，
          <br />
          <em>有你的位置。</em>
        </h2>
        <p>
          来早一点，和我们一起把 Skivu 打磨成
          <br className='sr-desktop-break' />
          你喜欢的样子。分享想法，也体验新的可能。
        </p>
        <a className='sr-button sr-beta-button' href='/creators/skivu-beta'>
          进入内测中心
          <ArrowUpRight size={19} />
        </a>
        <small>使用社区账号登录并申请，内测资格由管理员审核。</small>
        <div className='sr-beta-steps'>
          <span>
            01 <strong>登录社区账号</strong>
          </span>
          <ArrowRight size={13} />
          <span>
            02 <strong>提交内测申请</strong>
          </span>
          <ArrowRight size={13} />
          <span>
            03 <strong>等待审核</strong>
          </span>
        </div>
      </div>
    </section>
  )
}

export function SkivuTicker() {
  return (
    <div className='sr-ticker' aria-hidden>
      <div>
        {[0, 1].map((key) => (
          <span key={key}>
            THINK FREELY <i>✳</i> CONNECT DEEPLY <i>✳</i> MAKE IT YOURS <i>✳</i>{' '}
            SKIVU UNIVERSE <i>✳</i>
          </span>
        ))}
      </div>
    </div>
  )
}
