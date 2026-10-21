import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'

import { CommunityTopic } from '@/features/community/topic'

export const Route = createFileRoute('/creators/topics/$topicId')({
  component: Page,
})
function Page() {
  const { topicId } = Route.useParams()
  const editing = useRouterState({
    select: (state) => state.location.pathname.endsWith('/edit'),
  })
  return editing ? <Outlet /> : <CommunityTopic topicId={topicId} />
}
