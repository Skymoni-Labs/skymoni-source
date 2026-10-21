import { createFileRoute } from '@tanstack/react-router'

import { CommunityComposer } from '@/features/community/composer'

export const Route = createFileRoute('/creators/topics/$topicId/edit')({
  component: Page,
})
function Page() {
  const { topicId } = Route.useParams()
  return <CommunityComposer topicId={topicId} />
}
