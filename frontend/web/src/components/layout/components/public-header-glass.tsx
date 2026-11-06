import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'

import {
  createHeaderLensMap,
  HEADER_REFRACTION_SCALE,
} from './public-header-lens'

import '@/styles/public-header-glass.css'

export function PublicHeaderGlass() {
  const id = `public-glass-${useId().replaceAll(':', '')}`
  const material = useRef<HTMLSpanElement>(null)
  const map = useRef<SVGFEImageElement>(null)

  useEffect(() => {
    const surface = material.current
    const nav = surface?.closest('nav')
    if (!surface || !nav || !CSS.supports('backdrop-filter', `url(#${id})`)) {
      return
    }
    // Safari and Firefox keep the translucent blur fallback.
    if (/Firefox|^((?!Chrome|Chromium).)*Safari/.test(navigator.userAgent)) {
      return
    }
    let frame = 0
    let paint = 0
    let generation = 0
    let disposed = false
    let lastSize = ''
    const update = () => {
      frame = 0
      const width = Math.round(nav.clientWidth)
      const height = Math.round(nav.clientHeight)
      if (!width || !height || lastSize === `${width}:${height}`) return
      lastSize = `${width}:${height}`
      const revision = ++generation
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return
      const pixels = context.createImageData(width, height)
      try {
        pixels.data.set(createHeaderLensMap(width, height))
      } catch {
        surface.removeAttribute('data-refraction')
        return
      }
      context.putImageData(pixels, 0, 0)
      const uri = canvas.toDataURL()
      const image = new Image()
      image.addEventListener(
        'load',
        () => {
          if (disposed || revision !== generation) return
          map.current?.setAttribute('href', uri)
          cancelAnimationFrame(paint)
          // Allow the SVG image to paint before replacing the blur fallback.
          paint = requestAnimationFrame(() => {
            paint = requestAnimationFrame(() => {
              if (disposed || revision !== generation) return
              surface.style.setProperty('--public-header-lens', `url(#${id})`)
              surface.setAttribute('data-refraction', 'ready')
            })
          })
        },
        { once: true }
      )
      image.addEventListener(
        'error',
        () => {
          if (!disposed && revision === generation) {
            surface.removeAttribute('data-refraction')
          }
        },
        { once: true }
      )
      image.src = uri
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(nav)
    update()
    return () => {
      disposed = true
      generation++
      observer.disconnect()
      cancelAnimationFrame(frame)
      cancelAnimationFrame(paint)
      surface.removeAttribute('data-refraction')
      surface.style.removeProperty('--public-header-lens')
    }
  }, [id])

  return (
    <>
      <svg
        className='public-header-glass-filter'
        aria-hidden='true'
        focusable='false'
      >
        <defs>
          <filter
            id={id}
            x='0%'
            y='0%'
            width='100%'
            height='100%'
            colorInterpolationFilters='sRGB'
          >
            <feImage
              ref={map}
              width='100%'
              height='100%'
              preserveAspectRatio='none'
              result='lens'
            />
            <feGaussianBlur
              in='SourceGraphic'
              stdDeviation='3.5'
              edgeMode='duplicate'
              result='soft-backdrop'
            />
            <feDisplacementMap
              in='soft-backdrop'
              in2='lens'
              scale={HEADER_REFRACTION_SCALE}
              xChannelSelector='R'
              yChannelSelector='G'
            />
          </filter>
        </defs>
      </svg>
      <span
        ref={material}
        className='public-header-glass-material'
        aria-hidden='true'
      />
    </>
  )
}

export function PublicHeaderLinks({
  children,
  gap,
}: {
  children: ReactNode
  gap?: number
}) {
  const group = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const hovered = useRef<HTMLElement | null>(null)
  const focused = useRef<HTMLElement | null>(null)
  const moveTo = useCallback((target: Element | null | undefined) => {
    if (!pill.current || !group.current) return
    const link = target instanceof HTMLElement ? target : null
    pill.current.style.opacity = link ? '1' : '0'
    if (!link) return
    pill.current.style.width = `${link.offsetWidth}px`
    pill.current.style.transform = `translateX(${link.offsetLeft}px)`
  }, [])
  const sync = useCallback(() => {
    const container = group.current
    const current = [hovered.current, focused.current].find(
      (link) => link && container?.contains(link)
    )
    moveTo(current || container?.querySelector('a[aria-current="page"]'))
  }, [moveTo])
  // Parent updates and resize callbacks must preserve the current interaction.
  useEffect(() => {
    sync()
  }, [children, sync])
  useEffect(() => {
    const observer = new ResizeObserver(sync)
    if (group.current) observer.observe(group.current)
    return () => observer.disconnect()
  }, [sync])
  return (
    <div
      ref={group}
      className='public-header-links'
      style={gap === undefined ? undefined : { gap }}
      onPointerOver={(event) => {
        const link = (event.target as Element).closest('a')
        if (link && event.currentTarget.contains(link)) {
          hovered.current = link
          sync()
        }
      }}
      onPointerLeave={() => {
        hovered.current = null
        sync()
      }}
      onFocusCapture={(event) => {
        focused.current = (event.target as Element).closest('a')
        sync()
      }}
      onBlurCapture={(event) => {
        focused.current =
          event.relatedTarget instanceof Element &&
          event.currentTarget.contains(event.relatedTarget)
            ? event.relatedTarget.closest('a')
            : null
        sync()
      }}
    >
      <span ref={pill} className='public-header-link-pill' aria-hidden='true' />
      {children}
    </div>
  )
}
