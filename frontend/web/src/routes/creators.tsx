import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'

import { resolveRouteAuthentication } from '@/features/auth/lib/session-route-auth'
import { AuthSessionError } from '@/features/auth/session-recovery'
import { CreatorPlatformLayout } from '@/features/creator-center/platform-layout'
import { CreatorRuntime } from '@/features/creator-center/runtime'

import '@/styles/home-preview.css'
import '@/styles/creator-center.css'
import '@/styles/creator-hub.css'
import '@/styles/creator-showcase.css'
import '@/styles/creator-github.css'
import '@/styles/creator-guide.css'
import '@/styles/creator-platform.css'
import '@/styles/community.css'
import '@/styles/community-polish.css'
import '@/styles/community-daylight.css'
import '@/styles/community-pointer.css'
import '@/styles/community-navigation.css'
import '@/styles/community-sky.css'
import '@/styles/community-title.css'
import '@/styles/community-header.css'
import '@/styles/community-clouds.css'
import '@/styles/community-writing.css'
import '@/styles/community-access.css'
import '@/styles/community-motion.css'
import '@/styles/community-window.css'

function CreatorLayout() {
  const independentPage = useRouterState({
    select: (state) =>
      state.location.pathname.startsWith('/creators/people/') ||
      state.location.pathname === '/creators/skivu-beta',
  })
  return (
    <CreatorPlatformLayout>
      {independentPage ? (
        <Outlet />
      ) : (
        <CreatorRuntime>
          <Outlet />
        </CreatorRuntime>
      )}
    </CreatorPlatformLayout>
  )
}
export const Route = createFileRoute('/creators')({
  component: CreatorLayout,
  beforeLoad: async () => {
    await resolveRouteAuthentication()
  },
  errorComponent: AuthSessionError,
})
