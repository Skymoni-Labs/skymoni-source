import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useTranslation } from 'react-i18next'

import { CoverArt } from '@/features/creator-center/components/cover-art'
import type { Work } from '@/features/creator-center/types'

import {
  GALLERY_MOTION_STORAGE,
  isLocalGalleryPreview,
  loadGalleryMotion,
} from './gallery-motion'
import { GalleryMotionTuner } from './gallery-motion-tuner'
import { usePortalGallery } from './use-portal-gallery'

import '@/styles/creator-gallery.css'

const GalleryCover = memo(CoverArt)
const AUTO_INTERVAL_MS = 3500

const categories: Record<string, string> = {
  website: '网站与应用',
  software: '软件与工具',
  design: '设计与资源',
  workflow: 'AI 与工作流',
  article: '文章与指南',
  other: '更多创作',
}

export function CreatorGallery({ works }: { works: Work[] }) {
  const { t } = useTranslation()
  const galleryRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{
    x: number
    y: number
    position: number
    step: number
    pointerId: number
    horizontal: boolean
  } | null>(null)
  const suppressClickUntil = useRef(0)
  const positionRef = useRef(0)
  const targetRef = useRef(0)
  const animationFrame = useRef(0)
  const moveFocus = useRef(false)
  const [position, setPosition] = useState(0)
  const [canPlay, setCanPlay] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [motion, setMotion] = useState(loadGalleryMotion)
  const localPreview = isLocalGalleryPreview()
  const total = works.length
  const active = ((Math.round(position) % total) + total) % total
  const selected = works[active]
  const playing = canPlay && !hovered && !focused && !dragging && total > 1
  const webglReady = usePortalGallery(
    stageRef,
    works,
    positionRef,
    canPlay,
    position,
    t,
    motion
  )

  useEffect(() => {
    if (!localPreview) return
    try {
      localStorage.setItem(GALLERY_MOTION_STORAGE, JSON.stringify(motion))
    } catch {
      // Live preview still works without persistence.
    }
  }, [motion, localPreview])

  const publishPosition = useCallback((value: number) => {
    positionRef.current = value
    setPosition(value)
  }, [])

  // Use one continuous position for dragging and settling, so interrupting an
  // animation starts from the visible frame rather than jumping to its target.
  const animateTo = useCallback(
    (target: number) => {
      window.cancelAnimationFrame(animationFrame.current)
      targetRef.current = target
      const from = positionRef.current
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        publishPosition(target)
        return
      }
      const started = performance.now()
      const duration = Math.min(700, 330 + Math.abs(target - from) * 100)
      const tick = (time: number) => {
        const progress = Math.min(1, (time - started) / duration)
        publishPosition(from + (target - from) * (1 - (1 - progress) ** 3))
        if (progress < 1) {
          animationFrame.current = window.requestAnimationFrame(tick)
        } else {
          animationFrame.current = 0
        }
      }
      animationFrame.current = window.requestAnimationFrame(tick)
    },
    [publishPosition]
  )

  const finishGesture = useCallback(() => {
    const start = gesture.current
    if (!start) return
    gesture.current = null
    setDragging(false)
    if (stageRef.current?.hasPointerCapture(start.pointerId)) {
      stageRef.current.releasePointerCapture(start.pointerId)
    }
    if (start.horizontal) {
      suppressClickUntil.current = performance.now() + 350
      animateTo(Math.round(positionRef.current))
    }
  }, [animateTo])

  useEffect(() => {
    const release = (event: PointerEvent) => {
      if (event.pointerId === gesture.current?.pointerId) finishGesture()
    }
    window.addEventListener('blur', finishGesture)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      window.removeEventListener('blur', finishGesture)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.cancelAnimationFrame(animationFrame.current)
    }
  }, [finishGesture])

  useEffect(() => {
    const gallery = galleryRef.current
    if (!gallery) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    const sync = () =>
      setCanPlay(visible && !document.hidden && !motion.matches)
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        sync()
      },
      { threshold: 0.2 }
    )
    observer.observe(gallery)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(
      () => animateTo(Math.round(targetRef.current) + 1),
      AUTO_INTERVAL_MS
    )
    return () => window.clearInterval(timer)
  }, [playing, animateTo])

  useEffect(() => {
    if (!moveFocus.current) return
    galleryRef.current
      ?.querySelector<HTMLElement>('.hn-gallery-item[data-active="true"] a')
      ?.focus({ preventScroll: true })
    moveFocus.current = false
  }, [active])

  if (!selected) return null
  const title = selected.sample ? t(selected.title) : selected.title

  return (
    <div
      className='hn-gallery'
      ref={galleryRef}
      role='region'
      aria-roledescription='轮播'
      aria-label='创作者作品展架'
      data-playing={playing}
      data-renderer={webglReady ? 'webgl' : 'html'}
      data-dragging={dragging}
      data-position={position.toFixed(3)}
      style={
        { '--hn-gallery-interval': `${AUTO_INTERVAL_MS}ms` } as CSSProperties
      }
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          moveFocus.current =
            event.target instanceof HTMLElement &&
            Boolean(event.target.closest('.hn-gallery-card'))
          animateTo(
            Math.round(targetRef.current) +
              (event.key === 'ArrowRight' ? 1 : -1)
          )
        }
      }}
    >
      {localPreview && (
        <GalleryMotionTuner settings={motion} onChange={setMotion} />
      )}
      <div
        className='hn-gallery-stage'
        ref={stageRef}
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          if (
            event.detail > 0 &&
            performance.now() < suppressClickUntil.current
          ) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary || total < 2) return
          gesture.current = {
            x: event.clientX,
            y: event.clientY,
            position: positionRef.current,
            step:
              event.currentTarget
                .querySelector('.hn-gallery-unit')
                ?.getBoundingClientRect().width || 220,
            pointerId: event.pointerId,
            horizontal: false,
          }
          suppressClickUntil.current = 0
        }}
        onPointerMove={(event) => {
          const start = gesture.current
          if (!start || event.pointerId !== start.pointerId) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (!start.horizontal) {
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
            if (Math.abs(dy) > Math.abs(dx) && event.pointerType !== 'mouse') {
              finishGesture()
              return
            }
            if (Math.abs(dx) < 6) return
            window.cancelAnimationFrame(animationFrame.current)
            animationFrame.current = 0
            start.position = positionRef.current
            moveFocus.current = false
            start.horizontal = true
            event.currentTarget.setPointerCapture(event.pointerId)
            if (
              document.activeElement instanceof HTMLElement &&
              event.currentTarget.contains(document.activeElement)
            ) {
              document.activeElement.blur()
            }
            setDragging(true)
          }
          event.preventDefault()
          const next = start.position - dx / start.step
          targetRef.current = next
          publishPosition(next)
        }}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onLostPointerCapture={finishGesture}
      >
        <span className='hn-gallery-unit' aria-hidden />
        <div className='hn-gallery-orbit' aria-hidden />
        {works.map((work, index) => {
          let offset = (((index - position) % total) + total) % total
          if (offset > total / 2) offset -= total
          const distance = Math.abs(offset)
          const current = index === active
          const hidden = distance > (webglReady ? 3.9 : 2.7)
          const workTitle = work.sample ? t(work.title) : work.title
          const style = {
            '--hn-offset': offset,
            '--hn-drop': `${distance * distance * 14}px`,
            '--hn-roll': `${offset * 7.5}deg`,
            '--hn-yaw': `${offset * -14}deg`,
            '--hn-depth': `${44 - Math.min(distance, 3) * 58}px`,
            '--hn-scale': 1 - Math.min(distance, 3) * 0.025,
            '--hn-shade': Math.min(distance * 0.07, 0.2),
            zIndex: Math.round(100 - distance * 10),
          } as CSSProperties
          return (
            <div
              className='hn-gallery-item'
              key={work.id}
              style={style}
              data-active={current}
              data-hidden={hidden}
              aria-hidden={hidden || undefined}
            >
              <Link
                className='hn-gallery-card'
                to='/creators/works/$workId'
                params={{ workId: work.id }}
                tabIndex={hidden ? -1 : undefined}
                aria-label={`${workTitle}，${current ? '查看作品' : '切换到此作品'}`}
                aria-current={current ? 'true' : undefined}
                draggable={false}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') setHovered(true)
                }}
                onPointerMove={(event) => {
                  if (
                    event.pointerType !== 'mouse' ||
                    gesture.current ||
                    window.matchMedia('(prefers-reduced-motion: reduce)')
                      .matches
                  ) {
                    return
                  }
                  const rect = event.currentTarget.getBoundingClientRect()
                  const x = Math.max(
                    0,
                    Math.min(1, (event.clientX - rect.left) / rect.width)
                  )
                  const y = Math.max(
                    0,
                    Math.min(1, (event.clientY - rect.top) / rect.height)
                  )
                  const surface = event.currentTarget.style
                  surface.setProperty(
                    '--hn-pointer-pitch',
                    `${(0.5 - y) * 8}deg`
                  )
                  surface.setProperty(
                    '--hn-pointer-yaw',
                    `${(x - 0.5) * 12}deg`
                  )
                  surface.setProperty('--hn-light-x', `${x * 100}%`)
                  surface.setProperty('--hn-light-y', `${y * 100}%`)
                }}
                onPointerLeave={(event) => {
                  setHovered(false)
                  for (const property of [
                    '--hn-pointer-pitch',
                    '--hn-pointer-yaw',
                    '--hn-light-x',
                    '--hn-light-y',
                  ]) {
                    event.currentTarget.style.removeProperty(property)
                  }
                }}
                onFocus={(event) => {
                  // Keep a keyboard user's selected card stable without
                  // pausing after mouse clicks on the surrounding controls.
                  setFocused(event.currentTarget.matches(':focus-visible'))
                }}
                onBlur={() => setFocused(false)}
                onClick={(event) => {
                  if (!current) {
                    event.preventDefault()
                    animateTo(Math.round(positionRef.current + offset))
                  }
                }}
              >
                <div className='hn-gallery-poster'>
                  {work.homePoster ? (
                    <img
                      src={work.homePoster}
                      alt=''
                      draggable={false}
                      className='hn-gallery-uploaded-poster'
                      loading={distance > 1.5 ? 'lazy' : 'eager'}
                    />
                  ) : (
                    <GalleryCover work={work} />
                  )}
                  {work.sample && (
                    <span className='hn-gallery-sample'>展示示例</span>
                  )}
                  <span className='hn-gallery-peek'>
                    <ArrowUpRight aria-hidden />
                  </span>
                </div>
                <h3>{workTitle}</h3>
                <span className='hn-gallery-byline'>{work.author}</span>
              </Link>
            </div>
          )
        })}
      </div>
      <div className='hn-gallery-controls'>
        <button
          type='button'
          aria-label='上一个作品'
          disabled={total < 2}
          onClick={() => animateTo(Math.round(targetRef.current) - 1)}
        >
          <ArrowLeft aria-hidden />
        </button>
        <div className='hn-gallery-count'>
          <span>{String(active + 1).padStart(2, '0')}</span>
          <i>/</i>
          {String(total).padStart(2, '0')}
          <b key={active} aria-hidden />
        </div>
        <button
          type='button'
          aria-label='下一个作品'
          disabled={total < 2}
          onClick={() => animateTo(Math.round(targetRef.current) + 1)}
        >
          <ArrowRight aria-hidden />
        </button>
      </div>
      <div
        className='hn-gallery-caption'
        key={selected.id}
        aria-live={playing ? 'off' : 'polite'}
      >
        <span>
          {selected.settings?.categoryName || categories[selected.category]}
        </span>
        <p>{selected.sample ? t(selected.summary) : selected.summary}</p>
        <Link
          to='/creators/works/$workId'
          params={{ workId: selected.id }}
          className='hn-text-link'
          aria-label={`查看作品：${title}`}
        >
          查看作品 <ArrowUpRight aria-hidden />
        </Link>
      </div>
    </div>
  )
}
