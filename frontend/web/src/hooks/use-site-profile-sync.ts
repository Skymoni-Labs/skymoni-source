import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { accountIdentity, refreshSiteProfile } from '@/lib/site-identity'
import { useAuthStore } from '@/stores/auth-store'

export function useSiteProfileSync() {
  const client = useQueryClient()
  const userId = useAuthStore((s) => s.auth.user?.id)
  const sid = useAuthStore((s) => s.auth.session?.sid)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void refreshSiteProfile().catch(() => undefined)
      }
    }
    const keys = [
      'community-topic',
      'community-topics',
      'community-member',
      'community-notifications',
      'creator-public',
      'creator-public-profile',
      'creator-me',
      'creator-home',
      'home-creator-public',
      'creator-home-admin',
    ]
    const invalidate = () => {
      for (const key of keys) void client.invalidateQueries({ queryKey: [key] })
    }
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      const user = state.auth.user,
        old = previous.auth.user
      if (
        user &&
        old &&
        user.id === old.id &&
        JSON.stringify(accountIdentity(user)) !==
          JSON.stringify(accountIdentity(old))
      ) {
        invalidate()
      }
    })
    const receive = (event: unknown) => {
      if (
        event &&
        typeof event === 'object' &&
        'userId' in event &&
        'timestamp' in event &&
        event.userId === userId &&
        typeof event.timestamp === 'number' &&
        Math.abs(Date.now() - event.timestamp) < 60000
      ) {
        refresh()
      }
    }
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel('skymoni:profile-updated')
    if (channel) {
      channel.addEventListener('message', (event) => receive(event.data))
    }
    const storage = (event: StorageEvent) => {
      if (event.key === 'skymoni:profile-updated' && event.newValue) {
        try {
          receive(JSON.parse(event.newValue))
        } catch {
          /* Ignore invalid event. */
        }
      }
    }
    window.addEventListener('storage', storage)
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh()
        invalidate()
      }
    }, 30000)
    return () => {
      unsubscribe()
      channel?.close()
      clearInterval(timer)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', refresh)
    }
  }, [client, userId, sid])
}
