import { useEffect, useRef } from 'react'

import '@/styles/tracking-cloud.css'

export function TrackingCloud() {
  const stageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    let visible = false
    let frame = 0
    let x = 0
    let y = 0
    let targetX = 0
    let targetY = 0
    const enabled = () =>
      visible && !document.hidden && !motion.matches && pointer.matches
    const tick = () => {
      x += (targetX - x) * 0.18
      y += (targetY - y) * 0.18
      stage.style.setProperty('--hn-eye-x', `${x.toFixed(2)}px`)
      stage.style.setProperty('--hn-eye-y', `${y.toFixed(2)}px`)
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.03) {
        frame = window.requestAnimationFrame(tick)
      } else frame = 0
    }
    const reset = () => {
      window.cancelAnimationFrame(frame)
      frame = 0
      x = 0
      y = 0
      targetX = 0
      targetY = 0
      stage.style.setProperty('--hn-eye-x', '0px')
      stage.style.setProperty('--hn-eye-y', '0px')
    }
    const sync = () => {
      stage.dataset.tracking = String(enabled())
      if (!enabled()) reset()
    }
    const move = (event: PointerEvent) => {
      if (!enabled() || event.pointerType !== 'mouse') return
      const rect = stage.getBoundingClientRect()
      const dx = event.clientX - (rect.left + rect.width * 0.5)
      const dy = event.clientY - (rect.top + rect.height * 0.448)
      // Move the original illustrated eyes in a small ellipse, preserving the face.
      targetX = Math.tanh(dx / 180) * rect.width * 0.019
      targetY = Math.tanh(dy / 180) * rect.height * 0.014
      if (!frame) frame = window.requestAnimationFrame(tick)
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        sync()
      },
      { threshold: 0.2 }
    )
    observer.observe(stage)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('blur', reset)
    document.addEventListener('pointerleave', reset)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    pointer.addEventListener('change', sync)
    return () => {
      reset()
      observer.disconnect()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('blur', reset)
      document.removeEventListener('pointerleave', reset)
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
      pointer.removeEventListener('change', sync)
    }
  }, [])

  return (
    <div className='hn-cloud-art-stage' ref={stageRef} aria-hidden>
      <img
        src='/branding/skymoni-cloud-friend-transparent.png'
        alt=''
        className='hn-cloud-base'
        width='275'
        height='275'
      />
      <span className='hn-eye-cover hn-eye-left' />
      <span className='hn-eye-cover hn-eye-right' />
      <span
        className='hn-tracking-eye hn-eye-left'
        style={{
          backgroundImage:
            "url('/branding/skymoni-cloud-friend-transparent.png')",
        }}
      />
      <span
        className='hn-tracking-eye hn-eye-right'
        style={{
          backgroundImage:
            "url('/branding/skymoni-cloud-friend-transparent.png')",
        }}
      />
    </div>
  )
}
