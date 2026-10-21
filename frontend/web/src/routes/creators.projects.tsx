import { createFileRoute } from '@tanstack/react-router'

import { CreatorGallery } from '@/features/creator-center/gallery'

export const Route = createFileRoute('/creators/projects')({
  component: CreatorGallery,
})
