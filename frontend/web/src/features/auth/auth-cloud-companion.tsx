import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AuthCloudGift } from './auth-cloud-gift'

import './auth-cloud-companion.css'
import './auth-cloud-morph.css'
import './auth-cloud-gift.css'

const mascot = '/branding/skymoni-cloud-friend-transparent.png'

// Adapted from skyjjgw.com's original cloud companion, scoped to auth routes.
export function AuthCloudCompanion() {
  const { t } = useTranslation()
  const sceneRef = useRef<HTMLDivElement>(null)
  const mascotRef = useRef<HTMLDivElement>(null)
  const cloudRef = useRef<HTMLDivElement>(null)
  const [found, setFound] = useState<number[]>([])
  const hasGift = found.length === 3

  useEffect(() => {
    const scene = sceneRef.current
    const face = mascotRef.current
    const cloud = cloudRef.current
    if (!scene || !face || !cloud) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let pointer: { x: number; y: number } | undefined
    const clamp = (value: number) => Math.max(-1, Math.min(1, value))
    const reset = () => {
      pointer = undefined
      cancelAnimationFrame(frame)
      frame = 0
      face.style.setProperty('--gaze-x', '0px')
      face.style.setProperty('--gaze-y', '0px')
      scene.classList.remove('is-spotlit')
    }
    const update = () => {
      frame = 0
      if (!pointer || motion.matches || document.hidden) return
      const bounds = face.getBoundingClientRect()
      const x = clamp(
        (pointer.x - bounds.left - bounds.width / 2) /
          Math.max(140, innerWidth * 0.18)
      )
      const y = clamp(
        (pointer.y - bounds.top - bounds.height * 0.45) /
          Math.max(120, innerHeight * 0.2)
      )
      face.style.setProperty(
        '--gaze-x',
        `${(x * bounds.width * 0.019).toFixed(2)}px`
      )
      face.style.setProperty(
        '--gaze-y',
        `${(y * bounds.height * 0.016).toFixed(2)}px`
      )
    }
    const follow = (event: PointerEvent) => {
      if (motion.matches || !['mouse', 'pen'].includes(event.pointerType)) {
        return
      }
      pointer = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(update)
    }
    const spotlight = (event: PointerEvent) => {
      if (scene.querySelector('.auth-cloud-gift')) return
      const bounds = cloud.getBoundingClientRect()
      const x = Math.max(
        0,
        Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)
      )
      const y = Math.max(
        0,
        Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)
      )
      cloud.style.setProperty('--spot-x', `${x.toFixed(2)}%`)
      cloud.style.setProperty('--spot-y', `${y.toFixed(2)}%`)
      scene.classList.add('is-spotlit')
      scene
        .querySelectorAll<HTMLButtonElement>('.auth-cloud-star:not(:disabled)')
        .forEach((star) => {
          const rect = star.getBoundingClientRect()
          star.classList.toggle(
            'is-lit',
            Math.hypot(
              event.clientX - rect.left - rect.width / 2,
              event.clientY - rect.top - rect.height / 2
            ) < 55
          )
        })
    }
    const hideLight = () => {
      scene.classList.remove('is-spotlit')
      scene
        .querySelectorAll('.auth-cloud-star')
        .forEach((star) => star.classList.remove('is-lit'))
    }
    window.addEventListener('pointermove', follow, { passive: true })
    window.addEventListener('blur', reset)
    document.addEventListener('mouseleave', reset)
    document.addEventListener('visibilitychange', reset)
    motion.addEventListener('change', reset)
    scene.addEventListener('pointermove', spotlight, { passive: true })
    scene.addEventListener('pointerdown', spotlight, { passive: true })
    scene.addEventListener('pointerleave', hideLight)
    return () => {
      reset()
      window.removeEventListener('pointermove', follow)
      window.removeEventListener('blur', reset)
      document.removeEventListener('mouseleave', reset)
      document.removeEventListener('visibilitychange', reset)
      motion.removeEventListener('change', reset)
      scene.removeEventListener('pointermove', spotlight)
      scene.removeEventListener('pointerdown', spotlight)
      scene.removeEventListener('pointerleave', hideLight)
    }
  }, [])

  return (
    <div
      className={`auth-cloud-companion${hasGift ? ' has-gift' : ''}`}
      ref={sceneRef}
      role='region'
      aria-label={t('Skymoni cloud companion')}
    >
      <span className='auth-cloud-orbit' aria-hidden />
      <div className='auth-cloud-scene'>
        <div className='auth-cloud-shape' ref={cloudRef} aria-hidden>
          <span className='auth-cloud-spotlight' />
        </div>
        <div className='auth-cloud-mascot' ref={mascotRef} aria-hidden>
          <img
            className='auth-cloud-art'
            src={mascot}
            alt=''
            width='1280'
            height='1280'
            fetchPriority='high'
          />
          <span className='auth-cloud-eye-cover auth-cloud-eye-left' />
          <span className='auth-cloud-eye-cover auth-cloud-eye-right' />
          <span className='auth-cloud-eye auth-cloud-eye-left'>
            <img src={mascot} alt='' />
          </span>
          <span className='auth-cloud-eye auth-cloud-eye-right'>
            <img src={mascot} alt='' />
          </span>
        </div>
        <span className='auth-cloud-spark auth-cloud-spark-one' aria-hidden>
          ✦
        </span>
        <span className='auth-cloud-spark auth-cloud-spark-two' aria-hidden>
          ✧
        </span>
        {!hasGift &&
          [0, 1, 2].map((star) => (
            <button
              key={star}
              type='button'
              className={`auth-cloud-star auth-cloud-star-${star + 1}${found.includes(star) ? ' is-found' : ''}`}
              disabled={found.includes(star)}
              aria-label={t(
                found.includes(star)
                  ? 'Star {{number}} found'
                  : 'Find star {{number}}',
                { number: star + 1 }
              )}
              onClick={() =>
                setFound((previous) =>
                  previous.includes(star) ? previous : [...previous, star]
                )
              }
            >
              ✦
            </button>
          ))}
        {hasGift && <AuthCloudGift onRestart={() => setFound([])} />}
      </div>
      <span className='auth-cloud-caption' role='status'>
        {t(
          [
            'A little surprise is hiding in the clouds',
            'One star found. Light up the other corners!',
            'One more star, and your gift will appear!',
            'All three stars found. Scratch your cloud gift!',
          ][found.length]
        )}{' '}
        <span aria-hidden>✧</span>
      </span>
      {found.length > 0 && (
        <span className='auth-cloud-progress' aria-hidden>
          {found.length} / 3
          {[0, 1, 2].map((star) => (
            <i key={star} className={found.includes(star) ? 'is-found' : ''} />
          ))}
        </span>
      )}
      <span className='auth-cloud-label' aria-hidden>
        INTERACTIVE COMPANION / 001
      </span>
    </div>
  )
}
