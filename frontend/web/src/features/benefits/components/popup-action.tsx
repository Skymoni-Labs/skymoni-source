/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { redeemPopupBenefit } from '../api'

export function PopupBenefitAction(props: {
  id?: number
  revision?: number
  preview?: boolean
  history?: boolean
}) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const client = useQueryClient()
  const claim = useMutation({
    mutationFn: () => redeemPopupBenefit(props.id ?? 0, props.revision ?? 0),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['benefits', 'warehouse'] })
      toast.success(t('Benefit added to your warehouse'))
    },
    onError: handleServerError,
  })
  if (props.preview) {
    return (
      <Button variant='outline' disabled>
        {t('Claim benefit')}
      </Button>
    )
  }
  if (claim.isSuccess) {
    return (
      <Button variant='outline' render={<Link to='/warehouse' />}>
        {t('View my warehouse')}
      </Button>
    )
  }
  if (!user) {
    return (
      <Button
        variant='outline'
        render={<Link to='/sign-in' search={{ redirect: '/wallet' }} />}
      >
        {t('Sign in to claim')}
      </Button>
    )
  }
  return (
    <>
      <Button variant='outline' render={<Link to='/warehouse' />}>
        {t('View my warehouse')}
      </Button>
      <Button
        variant='outline'
        disabled={claim.isPending}
        onClick={() => claim.mutate(undefined)}
      >
        {t('Claim benefit')}
      </Button>
    </>
  )
}
