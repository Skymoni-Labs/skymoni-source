import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { CreatorAccessGate } from '@/features/creator-center/access'
import { CreatorStudio } from '@/features/creator-center/studio'

export const Route = createFileRoute('/creators/studio')({
  validateSearch: z.object({
    edit: z.string().optional(),
    category: z
      .enum(['website', 'software', 'design', 'article', 'workflow', 'other'])
      .optional(),
  }),
  component: Page,
})
function Page() {
  const search = Route.useSearch()
  return (
    <CreatorAccessGate>
      <CreatorStudio edit={search.edit} category={search.category} />
    </CreatorAccessGate>
  )
}
