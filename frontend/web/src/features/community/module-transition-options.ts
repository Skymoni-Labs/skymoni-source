import type { AnyRoute, RouterOptions } from '@tanstack/react-router'

const transitionType = 'skymoni-community'

/** Ignore anchors and URL parameter order; animate actual community views only. */
export function communitySceneKey(pathname: string, search: string) {
  const params = new URLSearchParams(search)
  params.sort()
  return `${pathname.replace(/\/$/, '')}?${params.toString()}`
}

export function nativeTransitionsSupported() {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    typeof CSS !== 'undefined' &&
    CSS.supports('selector(:active-view-transition-type(skymoni-community))')
  )
}

/** Router snapshots preserve real forms, state and normal navigation blockers. */
export function communityViewTransition(): RouterOptions<AnyRoute, 'never'>['defaultViewTransition'] {
  if (!nativeTransitionsSupported()) return false
  return {
    types: ({ fromLocation, toLocation }) => {
      if (
        !fromLocation ||
        !/^\/creators(?:\/|$)/.test(fromLocation.pathname) ||
        !/^\/creators(?:\/|$)/.test(toLocation.pathname) ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        communitySceneKey(fromLocation.pathname, fromLocation.searchStr) ===
          communitySceneKey(toLocation.pathname, toLocation.searchStr)
      ) {
        return false
      }
      return [transitionType]
    },
  }
}
