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
import { Gift, CheckCircle2, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'

import type { WarehouseItem } from '../types'

export function RedeemBenefitDialog(props: {
  initialCode?: string
  onClose: () => void
  onRedeem: (
    code: string
  ) => WarehouseItem | null | Promise<WarehouseItem | null>
  onWarehouse: () => void
}) {
  const { t } = useTranslation()
  const [code, setCode] = useState(props.initialCode ?? '')
  const [item, setItem] = useState<WarehouseItem | null>(null)
  const [pending, setPending] = useState(false)
  const redeem = async () => {
    if (pending || !code.trim()) return
    setPending(true)
    try {
      setItem(await props.onRedeem(code))
    } catch (error) {
      handleServerError(error)
    } finally {
      setPending(false)
    }
  }
  return (
    <Dialog
      open
      title={
        item ? t('Benefit added to your warehouse') : t('Redeem a benefit')
      }
      description={
        item
          ? t('Your benefit is ready. You can return to it any time.')
          : t('Enter a benefit code to receive your gift.')
      }
      onOpenChange={(open) => {
        if (!open && !pending) props.onClose()
      }}
      contentClassName='sm:max-w-lg'
      footer={
        item ? (
          <Button onClick={props.onWarehouse}>
            {t('View my warehouse')}
            <ArrowRight />
          </Button>
        ) : (
          <Button
            disabled={!code.trim() || pending}
            onClick={() => void redeem()}
          >
            {t('Redeem benefit')}
          </Button>
        )
      }
    >
      {item ? (
        <div className='flex flex-col items-center gap-4 py-7 text-center'>
          <CheckCircle2 className='size-12 text-emerald-500' />
          <h3 className='text-lg font-semibold'>{item.benefit.name}</h3>
          <p className='text-muted-foreground text-sm'>
            {t('Account details and instructions are saved in your warehouse.')}
          </p>
        </div>
      ) : (
        <div className='space-y-4 py-4'>
          <div className='flex size-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950'>
            <Gift />
          </div>
          <Label htmlFor='benefit-redeem-code'>{t('Benefit code')}</Label>
          <Input
            id='benefit-redeem-code'
            placeholder={t('Enter your benefit code')}
            autoComplete='off'
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code.trim()) {
                void redeem()
              }
            }}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Each account can redeem the same code once. Benefits do not add wallet credit.'
            )}
          </p>
        </div>
      )}
    </Dialog>
  )
}
