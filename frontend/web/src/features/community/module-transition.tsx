import { useRouterState } from '@tanstack/react-router'
import { useLayoutEffect, useRef, type ReactNode } from 'react'

import { useMediaQuery } from '@/hooks/use-media-query'

import {
  communitySceneKey,
  nativeTransitionsSupported,
} from './module-transition-options'

export function CommunityModuleTransition({
  children,
}: {
  children: ReactNode
}) {
  const scene = useRouterState({
    select: (state) =>
      communitySceneKey(state.location.pathname, state.location.searchStr),
  })
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const element = useRef<HTMLDivElement>(null)
  const previous = useRef(scene)
  const native = nativeTransitionsSupported()

  useLayoutEffect(() => {
    const changed = previous.current !== scene
    previous.current = scene
    const node = element.current
    if (!changed || reduced || native || !node?.animate) return
    // Browsers without snapshot transitions still reveal the panel, without
    // remounting the Outlet, touching drafts or delaying a route change.
    const animation = node.animate(
      [
        {
          opacity: 0.25,
          clipPath: 'inset(0 0 92% 0)',
          transform: 'translateY(-6px)',
        },
        { opacity: 1, clipPath: 'inset(0 0 0% 0)', transform: 'translateY(0)' },
      ],
      { duration: 300, easing: 'cubic-bezier(.22, 1, .36, 1)' }
    )
    return () => animation.cancel()
  }, [scene, reduced, native])

  let mode = 'reveal'
  if (native) mode = 'snapshot'
  if (reduced) mode = 'reduced'

  return (
    <div
      ref={element}
      className='sf-content-scene'
      data-community-transition={mode}
    >
      {children}
    </div>
  )
}
