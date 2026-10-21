/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { resolveAuthentication } from '@/lib/auth-session'
import { useAuthStore } from '@/stores/auth-store'
import {
  guestHasRead,
  popupNoticeKey,
  usePopupNoticeStore,
} from '@/stores/popup-notice-store'

import {
  acknowledgePopupNotice,
  getAvailablePopupNotices,
  type PopupFeedCursor,
} from '../api'
import { useOtherDialogOpen } from '../hooks/use-other-dialog'
import type { PopupNoticeDelivery } from '../types'
import { PopupNoticeDialog } from './popup-notice-dialog'

export function PopupNoticeHost() {
  const bootstrap = useAuthStore((state) => state.auth.bootstrapState)
  const userId = useAuthStore((state) => state.auth.user?.id ?? null)
  const identityResolutionStarted = useRef(false)
  const excludedRoute =
    window.location.pathname.startsWith('/setup') ||
    window.location.pathname.startsWith('/oauth')
  useEffect(() => {
    if (
      bootstrap !== 'idle' ||
      excludedRoute ||
      identityResolutionStarted.current
    ) {
      return
    }
    identityResolutionStarted.current = true
    // Public boot may deliberately skip refresh when its session hint is absent.
    // Resolve against the server before choosing a guest/user popup audience;
    // a missing hint alone does not invalidate a usable Refresh Cookie.
    void resolveAuthentication().catch(() => {
      // Unknown identity stays unconfirmed. Do not retry transient idle forever
      // or expose guest content while a valid session might still exist.
    })
  }, [bootstrap, excludedRoute])
  if (bootstrap !== 'complete' || excludedRoute) {
    return null
  }
  return <PopupAudienceHost key={userId ?? 'guest'} userId={userId} />
}

function PopupAudienceHost(props: { userId: number | null }) {
  const queryClient = useQueryClient()
  const audienceKey = String(props.userId ?? 'guest')
  const dismissed = usePopupNoticeStore(
    (state) => state.visitDismissals[audienceKey]
  )
  const dismissForVisit = usePopupNoticeStore((state) => state.dismissForVisit)
  const reads = usePopupNoticeStore((state) => state.guestReads)
  const acknowledgeGuest = usePopupNoticeStore(
    (state) => state.acknowledgeGuest
  )
  const otherDialogOpen = useOtherDialogOpen()
  const acknowledgements = useRef(new Set<AbortController>())
  const notices = useInfiniteQuery({
    queryKey: ['popup-notices', 'available', props.userId ?? 'guest'],
    queryFn: ({ signal, pageParam }) =>
      getAvailablePopupNotices(props.userId, signal, pageParam),
    initialPageParam: undefined as PopupFeedCursor | undefined,
    getNextPageParam: (lastPage) => {
      const last = lastPage.at(-1)
      return lastPage.length === 20 && last
        ? { after_id: last.id, after_priority: last.priority }
        : undefined
    },
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: true,
    meta: { errorToast: false },
  })
  useEffect(() => {
    const controllers = acknowledgements.current
    return () => {
      for (const controller of controllers) controller.abort()
    }
  }, [])

  const now = Math.floor(notices.dataUpdatedAt / 1000)
  const eligible = (notice: PopupNoticeDelivery) => {
    // Audience and publication filtering is enforced by the server. Delivery
    // DTOs deliberately omit private recipient details and admin state.
    if (
      (notice.start_at > 0 && notice.start_at > now) ||
      (notice.end_at > 0 && notice.end_at <= now)
    ) {
      return false
    }
    if (props.userId === null && guestHasRead(notice, reads, now)) return false
    return !dismissed?.includes(popupNoticeKey(notice))
  }
  const current = (notices.data?.pages.flat() ?? [])
    .filter(eligible)
    .sort((a, b) => b.priority - a.priority || b.id - a.id)[0]
  const { hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } =
    notices
  useEffect(() => {
    if (!current && hasNextPage && !isFetching && !isFetchNextPageError) {
      void fetchNextPage()
    }
  }, [current, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage])

  const dismiss = () => {
    if (
      !current ||
      (useAuthStore.getState().auth.user?.id ?? null) !== props.userId
    ) {
      return
    }
    dismissForVisit(audienceKey, current)
    if (props.userId === null) {
      acknowledgeGuest(current)
      return
    }
    const controller = new AbortController()
    acknowledgements.current.add(controller)
    void acknowledgePopupNotice(current, props.userId, controller.signal)
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: ['popup-notices', 'history', props.userId],
        })
      )
      .catch(() => {
        // A failed acknowledgement is only dismissed for this page visit.
        // The server can deliver it again on the next visit; never persist success locally.
      })
      .finally(() => acknowledgements.current.delete(controller))
  }

  if (!current || otherDialogOpen) return null
  return <PopupNoticeDialog notice={current} onClose={dismiss} />
}
