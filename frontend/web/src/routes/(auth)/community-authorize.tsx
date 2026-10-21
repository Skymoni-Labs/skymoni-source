import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { CommunityAuthorization } from '@/features/auth/community-authorization'
import { safeCommunityReturn } from '@/features/auth/lib/community-auth'
import { resolveRouteAuthentication } from '@/features/auth/lib/session-route-auth'
import { AuthSessionError } from '@/features/auth/session-recovery'

export const Route = createFileRoute('/(auth)/community-authorize')({
  validateSearch: z.object({
    returnTo: z.string().optional().catch(undefined),
  }),
  beforeLoad: async () => {
    await resolveRouteAuthentication()
  },
  errorComponent: AuthSessionError,
  component: Page,
})
function Page() {
  const search = Route.useSearch()
  return (
    <CommunityAuthorization returnTo={safeCommunityReturn(search.returnTo)} />
  )
}
