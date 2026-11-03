import { createFileRoute, redirect } from '@tanstack/react-router'

import { ChannelStatus } from '@/features/channel-status'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/upstream-status/')({
  beforeLoad: () => {
    if (useAuthStore.getState().auth.user?.role !== ROLE.SUPER_ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: () => <ChannelStatus admin />,
})
