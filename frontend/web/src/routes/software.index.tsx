import { createFileRoute } from '@tanstack/react-router'

import { SoftwareCenter } from '@/features/software-center'

export const Route = createFileRoute('/software/')({
  component: SoftwareCenter,
})
