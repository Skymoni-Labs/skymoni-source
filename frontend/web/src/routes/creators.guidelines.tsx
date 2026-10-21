import { createFileRoute } from '@tanstack/react-router'

import { CommunityGuidelines } from '@/features/community/guidelines'

export const Route = createFileRoute('/creators/guidelines')({
  component: CommunityGuidelines,
})
