import { createFileRoute } from '@tanstack/react-router'

import { CreatorPublicProfilePage } from '@/features/creator-center/public-profile'

function Page() {
  const { creatorId } = Route.useParams()
  return <CreatorPublicProfilePage key={creatorId} creatorId={creatorId} />
}

export const Route = createFileRoute('/creators/people/$creatorId')({
  component: Page,
})
