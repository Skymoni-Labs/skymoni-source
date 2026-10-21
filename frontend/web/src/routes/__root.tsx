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
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  createRootRouteWithContext,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { useEffect } from 'react'

import { NavigationProgress } from '@/components/navigation-progress'
import { Toaster } from '@/components/ui/sonner'
import { ThemeCustomizationProvider } from '@/context/theme-customization-provider'
import { GitHubPasswordPromptHost } from '@/features/auth/components/github-password-prompt'
import { saveAffiliateCode } from '@/features/auth/lib/storage'
import { GeneralError } from '@/features/errors/general-error'
import { NotFoundError } from '@/features/errors/not-found-error'
import { PopupNoticeHost } from '@/features/popup-notices/components/popup-notice-host'
import { getSetupStatus } from '@/features/setup/api'
import { useSiteProfileSync } from '@/hooks/use-site-profile-sync'
import { useSystemConfig } from '@/hooks/use-system-config'
import { getAuthScope, scopeForLocation, setAuthScope } from '@/lib/auth-scope'
import { bootstrapAuthentication, sessionRuntimes } from '@/lib/auth-session'
import { subscribeAuthSessionEvents } from '@/lib/auth-session-sync'
import { subscribeAuthSessionEvents as subscribeCommunityEvents } from '@/lib/community-auth-session-sync'
import { resolveLegacyRoute } from '@/lib/legacy-route'
import { useAuthStore, authStores } from '@/stores/auth-store'

function RootComponent() {
  useSiteProfileSync()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const creatorSurface = useRouterState({
    select: (state) =>
      state.location.pathname === '/community-authorize' ||
      state.location.pathname === '/creators' ||
      state.location.pathname.startsWith('/creators/'),
  })

  // Load system configuration (logo, system name, etc.) from backend
  useSystemConfig({ autoLoad: true })

  useEffect(() => {
    const aff = new URLSearchParams(window.location.search).get('aff')?.trim()
    if (aff) {
      saveAffiliateCode(aff)
    }
  }, [])

  useEffect(
    () =>
      useAuthStore.subscribe((state, previousState) => {
        const sid = state.auth.session?.sid
        const previousSID = previousState.auth.session?.sid
        if (sid !== previousSID) {
          queryClient.clear()
        }
      }),
    [queryClient]
  )

  useEffect(() => {
    const listen =
      (scope: 'relay' | 'community') =>
      (event: { kind: 'authenticated' | 'signed_out'; sid: string }) => {
        const store = authStores[scope]
        const sid = store.getState().auth.session?.sid
        if (event.kind === 'authenticated') {
          if (event.sid === sid) return
          sessionRuntimes[scope].clearAuthentication(false, 'idle')
          if (getAuthScope() === scope) window.location.reload()
        } else if (sid === event.sid) {
          sessionRuntimes[scope].clearAuthentication(false)
          if (getAuthScope() === scope) {
            queryClient.clear()
            void navigate({
              to: scope === 'community' ? '/creators' : '/sign-in',
              replace: true,
            })
          }
        }
      }
    const unsubRelay = subscribeAuthSessionEvents(listen('relay'))
    const unsubCommunity = subscribeCommunityEvents(listen('community'))
    return () => {
      unsubRelay()
      unsubCommunity()
    }
  }, [navigate, queryClient])

  return (
    <ThemeCustomizationProvider>
      <NavigationProgress />
      <Outlet />
      {getAuthScope() === 'relay' && <GitHubPasswordPromptHost />}
      {!creatorSurface && <PopupNoticeHost />}
      <Toaster closeButton duration={5000} position='top-center' richColors />
      {import.meta.env.MODE === 'development' && (
        <>
          <ReactQueryDevtools buttonPosition='bottom-left' />
          <TanStackRouterDevtools position='bottom-right' />
        </>
      )}
    </ThemeCustomizationProvider>
  )
}

// 同一页面会话内避免重复检查；刷新后重新校验当前服务实例。
let setupStatusChecked = false

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  // 应用初始化与路由解析前统一校验会话
  beforeLoad: async ({ location, context }) => {
    if (setAuthScope(scopeForLocation(location.pathname, location.searchStr))) {
      context.queryClient.clear()
    }
    const legacyTarget = resolveLegacyRoute(location.href)
    if (legacyTarget) {
      throw redirect({ href: legacyTarget, replace: true })
    }

    const pathname = location?.pathname || ''
    const needsSetupCheck =
      !setupStatusChecked && !pathname.startsWith('/setup')
    const authBootstrap = bootstrapAuthentication()

    // 只检查 setup 状态（如果需要）
    if (needsSetupCheck) {
      const [status] = await Promise.all([
        getSetupStatus().catch((error) => {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[root.beforeLoad] setup status check failed', error)
          }
          return null
        }),
        authBootstrap,
      ])

      if (status?.success && status.data) {
        if (!status.data.status) {
          throw redirect({ to: '/setup' })
        }
        setupStatusChecked = true
      }
    } else {
      await authBootstrap
    }
  },
  component: RootComponent,
  notFoundComponent: NotFoundError,
  errorComponent: GeneralError,
})
