import { useEffect, useRef, useState, type RefObject } from 'react'

import type { Work } from '@/features/creator-center/types'

import type {
  GalleryMotion,
  PortalGalleryRenderer,
} from './vendor/portal-gallery'

export function usePortalGallery(
  stage: RefObject<HTMLDivElement | null>,
  works: Work[],
  position: RefObject<number>,
  visible: boolean,
  revision: number,
  translate: (text: string) => string,
  motion: GalleryMotion
) {
  const renderer = useRef<PortalGalleryRenderer | null>(null)
  const [readyFor, setReadyFor] = useState<Work[] | null>(null)
  const ready = readyFor === works

  useEffect(() => {
    renderer.current?.setMotion(motion)
  }, [motion, ready])

  useEffect(() => {
    const container = stage.current
    if (!container || !works.length || !window.WebGLRenderingContext) return
    let alive = true
    let instance: PortalGalleryRenderer | undefined
    const fail = () => {
      if (alive) setReadyFor(null)
      renderer.current = null
      instance?.destroy()
    }
    void import('./vendor/portal-gallery')
      .then(({ PortalGalleryRenderer: Renderer }) => {
        if (!alive) return
        instance = new Renderer(
          container,
          works.map((work) => ({
            image:
              work.homePoster ||
              work.cover ||
              `/creator-gallery/${work.style || 'horizon'}.svg`,
            title: work.sample ? translate(work.title) : work.title,
            author: work.author,
          })),
          () => {
            if (!alive) return
            renderer.current = instance ?? null
            instance?.frame(position.current, false, false)
            setReadyFor(works)
          },
          fail
        )
        renderer.current = instance
      })
      .catch(fail)

    const resize = new ResizeObserver(() => {
      instance?.resize()
      instance?.setTheme()
      instance?.frame(position.current, false, false)
    })
    resize.observe(container)
    const theme = new MutationObserver(() => {
      instance?.setTheme()
      instance?.frame(position.current, false, false)
    })
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => {
      alive = false
      resize.disconnect()
      theme.disconnect()
      instance?.destroy()
      renderer.current = null
    }
  }, [stage, works, position, translate])

  useEffect(() => {
    if (!ready || !visible) return
    let frame = 0
    const render = () => {
      renderer.current?.frame(position.current, true, true)
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frame)
  }, [ready, visible, position])

  // Also render manual/keyboard changes while reduced motion disables cruising.
  useEffect(() => {
    if (!visible) renderer.current?.frame(position.current, false, false)
  }, [visible, revision, position])

  return ready
}
