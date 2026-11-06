import { useCallback, useEffect, useRef, type ReactNode } from 'react'

import '@/styles/public-header-glass.css'

export function PublicHeaderGlass() {
  return <span className='public-header-glass-material' aria-hidden='true' />
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
