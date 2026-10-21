import { createFileRoute } from '@tanstack/react-router'

import { CommunityComposer } from '@/features/community/composer'

export const Route = createFileRoute('/creators/new')({
  component: CommunityComposer,
})
