import { createFileRoute } from '@tanstack/react-router'

import { CommunityModeration } from '@/features/community/moderation'

export const Route = createFileRoute('/creators/moderation')({
  component: CommunityModeration,
})
