import { createFileRoute, redirect } from '@tanstack/react-router'

import { ModelAccounts } from '@/features/model-accounts'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/model-accounts/')({
  beforeLoad: () => {
    if (useAuthStore.getState().auth.user?.role !== ROLE.SUPER_ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: ModelAccounts,
})
