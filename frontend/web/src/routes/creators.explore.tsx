import { createFileRoute } from '@tanstack/react-router'

import { CreatorExplore } from '@/features/creator-center/explore'

export const Route = createFileRoute('/creators/explore')({
  component: CreatorExplore,
})
