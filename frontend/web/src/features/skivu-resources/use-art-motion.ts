import { useEffect, useRef, useState } from 'react'

export function useSkivuArt(ready: boolean) {
  const pageRef = useRef<HTMLDivElement>(null)
  const [manualPause, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
  const paused = manualPause || reducedMotion
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const sync = () => {
      setReducedMotion(media?.matches ?? false)
    }
    sync()
    media?.addEventListener('change', sync)
    return () => media?.removeEventListener('change', sync)
  }, [])
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const targets = page.querySelectorAll<HTMLElement>(
      '.sr-section, .sr-story, .sr-beta, .sr-plugin-card, .sr-wallpaper-card'
    )
    if (paused || typeof IntersectionObserver === 'undefined') {
      targets.forEach((target) => target.classList.add('is-visible'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0, rootMargin: '0px 0px 35px' }
    )
    targets.forEach((target) => {
      target.classList.add('sr-reveal')
      observer.observe(target)
    })
    return () => observer.disconnect()
  }, [ready, paused])
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    let frame = 0
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight
      page.style.setProperty(
        '--read-progress',
        String(max > 0 ? scrollY / max : 0)
      )
      frame = 0
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  return { pageRef, paused, setPaused, reducedMotion }
}
