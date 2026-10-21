import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { CreatorGitHubCallback } from '@/features/creator-center/github-callback'

export const Route = createFileRoute('/creators/github/callback')({
  validateSearch: z.object({
    code: z.string().max(512).optional(),
    state: z.string().max(100).optional(),
    error: z.string().max(100).optional(),
  }),
  component: Page,
})
function Page() {
  return <CreatorGitHubCallback {...Route.useSearch()} />
}
