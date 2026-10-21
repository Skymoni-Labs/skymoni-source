import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { useCreatorAccessStore } from '@/stores/creator-access-store'
import { useCreatorHubStore } from '@/stores/creator-hub-store'
import { useCreatorStore } from '@/stores/creator-store'

import { loadCreatorMe, loadCreatorGallery } from './api'
import { watchCreatorAccess, type CreatorLiveAccess } from './live-access'

export function CreatorRuntime({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.auth.user?.id)
  const sid = useAuthStore((s) => s.auth.session?.sid)
  const ready = useCreatorAccessStore((s) => s.actor)
  const actor = `${userId}:${sid}`
  const publicQuery = useQuery({
    queryKey: ['creator-public'],
    queryFn: ({ signal }) => loadCreatorGallery(signal),
    staleTime: 30000,
    refetchInterval: 60000,
  })
  const me = useQuery({
    queryKey: ['creator-me', userId, sid],
    queryFn: ({ signal }) => loadCreatorMe(signal),
    enabled: !!userId,
    retry: false,
    staleTime: 30000,
  })
  const liveKey = ['creator-access-live', userId, sid] as const
  const live = useQuery({
    queryKey: liveKey,
    queryFn: ({ signal }) =>
      watchCreatorAccess(
        queryClient.getQueryData<CreatorLiveAccess>(liveKey)?.status,
        signal
      ),
    enabled: !!userId && !!sid,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => (query.state.error ? 5000 : 150),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
  })
  const lastAccess = useRef<{ actor: string; status?: string }>({ actor })
  useEffect(() => {
    if (!live.data) return
    const before = lastAccess.current
    lastAccess.current = { actor, status: live.data.status }
    if (before.actor === actor && before.status === live.data.status) return
    if (
      before.actor === actor &&
      before.status === undefined &&
      !live.data.suspended
    ) {
      return
    }
    void queryClient.invalidateQueries({
      queryKey: ['creator-me', userId, sid],
      exact: true,
    })
    void queryClient.invalidateQueries({ queryKey: ['creator-public'] })
  }, [actor, live.data, queryClient, userId, sid])
  useEffect(() => {
    let data = userId ? (me.data ?? null) : null
    // A stale in-flight profile response cannot reopen a suspended editor.
    if (data && live.data) {
      data = { ...data, suspended: live.data.suspended }
      if (live.data.suspended) {
        data = { ...data, mode: 'member', works: [], releases: [], files: [] }
      } else if (live.data.status === 'active') {
        data = { ...data, mode: 'creator' }
      }
    }
    useCreatorAccessStore.getState().hydrate(data)
    useCreatorStore.getState().hydrate(data)
    useCreatorHubStore.getState().hydrate(data)
    useCreatorAccessStore.setState({ actor })
  }, [actor, userId, me.data, live.data])
  useEffect(() => {
    if (publicQuery.data) {
      useCreatorStore.setState({
        published: publicQuery.data.works,
        showcase: publicQuery.data.showcase,
      })
    }
  }, [publicQuery.data])
  if (publicQuery.isPending || ready !== actor || (userId && me.isPending)) {
    return (
      <main className='cc-main cc-shell sf-runtime-loading' role='status'>
        <p>{t('Loading...')}</p>
        <div className='sf-runtime-placeholder' aria-hidden='true'>
          <span />
          <span />
          <span />
        </div>
      </main>
    )
  }
  if (publicQuery.isError || (userId && me.isError)) {
    return (
      <main className='cc-main cc-shell sf-state'>
        <p role='alert'>{t('Unable to load creator center. Please retry.')}</p>
        <Button
          onClick={() => {
            void publicQuery.refetch()
            if (userId) void me.refetch()
          }}
        >
          {t('Retry')}
        </Button>
      </main>
    )
  }
  return children
}
