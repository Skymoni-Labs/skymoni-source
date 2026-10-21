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
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Gift } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { redeemBenefit } from '../api'
import { RedeemBenefitDialog } from './redeem-dialog'

export function WalletBenefitRedemption() {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const client = useQueryClient()
  return (
    <div className='space-y-3 border-t pt-4'>
      <Label htmlFor='wallet-benefit-code' className='flex items-center gap-2'>
        <Gift className='size-4 text-amber-500' />
        {t('Redeem a benefit')}
      </Label>
      <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
        <Input
          id='wallet-benefit-code'
          value={code}
          autoComplete='off'
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('Enter your benefit code')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && code.trim()) setOpen(true)
          }}
        />
        <Button
          variant='outline'
          disabled={!code.trim()}
          onClick={() => setOpen(true)}
        >
          {t('Redeem benefit')}
        </Button>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Benefits are saved to My warehouse and do not change your wallet balance.'
        )}
      </p>
      {open && (
        <RedeemBenefitDialog
          initialCode={code}
          onClose={() => setOpen(false)}
          onRedeem={async (value) => {
            const item = await redeemBenefit(value)
            setCode('')
            await client.invalidateQueries({
              queryKey: ['benefits', 'warehouse'],
            })
            return item
          }}
          onWarehouse={() => {
            setOpen(false)
            void navigate({ to: '/warehouse' })
          }}
        />
      )}
    </div>
  )
}
