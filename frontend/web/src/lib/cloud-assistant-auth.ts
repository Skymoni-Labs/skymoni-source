import { useAuthStore as communityStore } from '@/stores/community-auth-store'
import { useAuthStore as relayStore } from '@/stores/relay-auth-store'

import { getAuthScope, subscribeAuthScope } from './auth-scope'
import { getFreshAuthHeaders, resolveAuthentication } from './auth-session'

type Result =
  | { kind: 'anonymous' | 'unavailable' }
  | { kind: 'authenticated'; identity: string; headers: Record<string, string> }

declare global {
  interface Window {
    skymoniCloudAssistantAuth?: { resolve: () => Promise<Result> }
  }
}

export function installCloudAssistantAuth() {
  const identity = () => {
    const scope = getAuthScope()
    const auth = (
      scope === 'community' ? communityStore : relayStore
    ).getState().auth
    return auth.user && auth.session ? `${scope}:${auth.user.id}` : ''
  }
  let previous = identity()
  const changed = () => {
    const next = identity()
    if (next === previous) return
    previous = next
    window.dispatchEvent(
      new CustomEvent('skymoni:cloud-auth-change', { detail: next })
    )
  }
  window.skymoniCloudAssistantAuth = {
    resolve: async () => {
      try {
        const result = await resolveAuthentication()
        if (result.kind === 'anonymous') return { kind: 'anonymous' }
        if (result.kind !== 'authenticated') return { kind: 'unavailable' }
        const headers = await getFreshAuthHeaders()
        const current = identity()
        if (!current || !headers.Authorization) return { kind: 'anonymous' }
        return {
          kind: 'authenticated',
          identity: current,
          headers: {
            Authorization: headers.Authorization,
            'X-Skymoni-Auth-Scope': getAuthScope(),
          },
        }
      } catch {
        return { kind: 'unavailable' }
      }
    },
  }
  const subscriptions = [
    relayStore.subscribe(changed),
    communityStore.subscribe(changed),
    subscribeAuthScope(changed),
  ]
  window.dispatchEvent(new Event('skymoni:cloud-auth-ready'))
  return () => {
    subscriptions.forEach((unsubscribe) => unsubscribe())
    delete window.skymoniCloudAssistantAuth
  }
}
