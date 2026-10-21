import { createFileRoute } from '@tanstack/react-router'

import { CreatorActivation } from '@/features/creator-center/access'

export const Route = createFileRoute('/creators/join')({
  component: CreatorActivation,
})
