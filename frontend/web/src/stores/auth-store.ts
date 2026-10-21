import { useSyncExternalStore } from 'react'

import { getAuthScope, subscribeAuthScope } from '@/lib/auth-scope'

import { useAuthStore as community } from './community-auth-store'
import { useAuthStore as relay } from './relay-auth-store'
export type * from './relay-auth-store'
export const authStores = { relay, community }
const selected = () => authStores[getAuthScope()]
export const useAuthStore: typeof relay = Object.assign(
  ((selector: Parameters<typeof relay>[0]) => {
    const scope = useSyncExternalStore(
      subscribeAuthScope,
      getAuthScope,
      getAuthScope
    )
    return authStores[scope](selector)
  }) as typeof relay,
  {
    getState: () => selected().getState(),
    getInitialState: () => selected().getInitialState(),
    setState: (...args: Parameters<typeof relay.setState>) =>
      selected().setState(...args),
    subscribe: (listener: Parameters<typeof relay.subscribe>[0]) => {
      const unsubs = Object.entries(authStores).map(([scope, store]) =>
        store.subscribe((state, previous) => {
          if (scope === getAuthScope()) listener(state, previous)
        })
      )
      return () => unsubs.forEach((unsubscribe) => unsubscribe())
    },
  }
)
