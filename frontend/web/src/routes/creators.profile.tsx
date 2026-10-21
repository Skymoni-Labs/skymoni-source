import { createFileRoute } from '@tanstack/react-router'

import { CreatorAccessGate } from '@/features/creator-center/access'
import { CreatorProfilePage } from '@/features/creator-center/profile'

export const Route = createFileRoute('/creators/profile')({
  component: () => (
    <CreatorAccessGate>
      <CreatorProfilePage />
    </CreatorAccessGate>
  ),
})
