import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { CreatorAccessGate } from '@/features/creator-center/access'
import { CreatorWorkspace } from '@/features/creator-center/workspace'

export const Route = createFileRoute('/creators/workspace')({
  validateSearch: z.object({
    tab: z
      .enum([
        'overview',
        'projects',
        'distribution',
        'saved',
        'github',
        'homepage',
      ])
      .optional(),
  }),
  component: Page,
})
function Page() {
  const { tab } = Route.useSearch()
  return (
    <CreatorAccessGate>
      <CreatorWorkspace tab={tab} />
    </CreatorAccessGate>
  )
}
