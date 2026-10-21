import { createFileRoute } from '@tanstack/react-router'

import { CreatorPlatformManagement } from '@/features/creator-center/management'

export const Route = createFileRoute('/creators/manage')({
  component: CreatorPlatformManagement,
})
