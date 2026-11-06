import { createFileRoute } from '@tanstack/react-router'

import { SkivuResources } from '@/features/skivu-resources'

export const Route = createFileRoute('/skivu-resources')({
  component: SkivuResources,
})
