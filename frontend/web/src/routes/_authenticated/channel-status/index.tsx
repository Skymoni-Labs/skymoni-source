import { createFileRoute } from '@tanstack/react-router'

import { ChannelStatus } from '@/features/channel-status'

export const Route = createFileRoute('/_authenticated/channel-status/')({
  component: ChannelStatus,
})
