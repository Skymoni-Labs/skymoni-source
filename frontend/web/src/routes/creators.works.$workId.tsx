import { createFileRoute } from '@tanstack/react-router'

import { CreatorDetails } from '@/features/creator-center/details'

export const Route = createFileRoute('/creators/works/$workId')({
  component: Page,
})
function Page() {
  const { workId } = Route.useParams()
  return <CreatorDetails workId={workId} />
}
