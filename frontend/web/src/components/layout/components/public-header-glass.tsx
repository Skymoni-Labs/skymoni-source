import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'

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
    let lastSize = ''
    const update = () => {
      frame = 0
      const width = Math.round(nav.clientWidth)
      const height = Math.round(nav.clientHeight)
      if (!width || !height || lastSize === `${width}:${height}`) return
      lastSize = `${width}:${height}`
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return
      const pixels = context.createImageData(width, height)
      const radius = height / 2
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const centerX = Math.max(radius, Math.min(width - radius, x))
          const dx = x - centerX
          const dy = y - radius
          const distance = Math.hypot(dx, dy) || 1
          // Neutral center, lens displacement only within the capsule's rim.
          const rim = Math.max(0, 1 - Math.max(0, radius - distance) / 8) ** 2
          const index = (y * width + x) * 4
          pixels.data[index] = 128 + (dx / distance) * rim * 96
          pixels.data[index + 1] = 128 + (dy / distance) * rim * 96
          pixels.data[index + 2] = 128
          pixels.data[index + 3] = 255
        }
      }
      context.putImageData(pixels, 0, 0)
      map.current?.setAttribute('href', canvas.toDataURL())
      surface.style.backdropFilter = `url(#${id}) saturate(1.12)`
      surface.style.setProperty(
        '-webkit-backdrop-filter',
        `url(#${id}) saturate(1.12)`
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(nav)
    update()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
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
            <feDisplacementMap
              in='SourceGraphic'
              in2='lens'
              scale='-65'
              xChannelSelector='R'
              yChannelSelector='G'
              result='red-shift'
            />
            <feColorMatrix
              in='red-shift'
              type='matrix'
              values='1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'
              result='red'
            />
            <feDisplacementMap
              in='SourceGraphic'
              in2='lens'
              scale='-62'
              xChannelSelector='R'
              yChannelSelector='G'
              result='green-shift'
            />
            <feColorMatrix
              in='green-shift'
              type='matrix'
              values='0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0'
              result='green'
            />
            <feDisplacementMap
              in='SourceGraphic'
              in2='lens'
              scale='-58'
              xChannelSelector='R'
              yChannelSelector='G'
              result='blue-shift'
            />
            <feColorMatrix
              in='blue-shift'
              type='matrix'
              values='0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0'
              result='blue'
            />
            <feBlend in='red' in2='green' mode='screen' result='rg' />
            <feBlend in='rg' in2='blue' mode='screen' />
          </filter>
        </defs>
      </svg>
      <span className='public-header-glass-material' aria-hidden='true' />
      <span
        ref={material}
        className='public-header-glass-rim'
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
