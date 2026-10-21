import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { CommunityHome } from '@/features/community/home'

export const Route = createFileRoute('/creators/')({
  validateSearch: z.object({
    view: z
      .enum([
        'latest',
        'new',
        'top',
        'unanswered',
        'bookmarks',
        'mine',
        'trash',
      ])
      .optional(),
    category: z.string().max(40).optional(),
    q: z.string().max(120).optional(),
    page: z.coerce.number().int().min(1).max(10000).optional(),
  }),
  component: Page,
})
function Page() {
  return <CommunityHome search={Route.useSearch()} />
}
