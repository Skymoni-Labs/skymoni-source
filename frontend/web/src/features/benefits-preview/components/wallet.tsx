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
import { Wallet, Gift, Receipt, ArrowRight, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TitledCard } from '@/components/ui/titled-card'

export function PreviewWallet(props: {
  onRedeem: (code: string) => void
  onWarehouse: () => void
  balanceDisplay?: ReactNode
}) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  return (
    <div className='space-y-7'>
      <div>
        <h1 className='text-3xl font-semibold tracking-tight'>{t('Wallet')}</h1>
        <p className='text-muted-foreground mt-2 text-sm'>
          {t('Manage credit and redeem your benefits here.')}
        </p>
      </div>
      <div className='grid gap-5 lg:grid-cols-[1fr_380px]'>
        <div className='space-y-5'>
          <div className='relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-7 dark:border-sky-900 dark:from-sky-950 dark:via-slate-950 dark:to-cyan-950'>
            <Wallet className='mb-5 size-6 text-sky-600' />
            <p className='text-muted-foreground text-sm'>
              {t('Wallet credit')}
            </p>
            <p className='mt-2 text-4xl font-semibold tracking-tight'>
              {props.balanceDisplay ?? '99.00'}{' '}
              {!props.balanceDisplay && (
                <span className='text-muted-foreground text-sm font-normal'>
                  {t('Site credit')}
                </span>
              )}
            </p>
            <p className='text-muted-foreground mt-6 text-xs'>
              {t('Benefits are stored separately in your warehouse.')}
            </p>
          </div>
          <TitledCard
            title={t('Your gifts have a home')}
            description={t(
              'Keep account details, activation codes and resources together.'
            )}
            icon={<Gift />}
            iconTone='info'
            action={
              <Button size='sm' variant='outline' onClick={props.onWarehouse}>
                {t('View my warehouse')}
                <ArrowRight />
              </Button>
            }
          >
            <p className='text-muted-foreground text-sm'>
              {t(
                'Redeem a benefit code on the right. The item will appear in your warehouse immediately.'
              )}
            </p>
          </TitledCard>
        </div>
        <TitledCard
          title={t('Recharge and redeem')}
          description={t('Choose credit redemption or benefit redemption.')}
          icon={<Wallet />}
          iconTone='success'
        >
          <Tabs defaultValue='benefit' className='gap-5'>
            <TabsList className='w-full' aria-label={t('Redemption type')}>
              <TabsTrigger value='credit'>{t('Credit redemption')}</TabsTrigger>
              <TabsTrigger value='benefit'>
                <Gift className='size-3.5' />
                {t('Benefit redemption')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value='credit' className='space-y-4'>
              <Button variant='outline' className='w-full' disabled>
                <Receipt />
                {t('Order history')}
              </Button>
              <div className='space-y-2 border-t pt-4'>
                <Label htmlFor='preview-credit-code'>{t('Have a Code?')}</Label>
                <div className='flex gap-2'>
                  <Input
                    id='preview-credit-code'
                    placeholder={t('Enter your redemption code')}
                    disabled
                  />
                  <Button variant='outline' disabled>
                    {t('Redeem')}
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value='benefit' className='space-y-4'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <Sparkles className='size-4 text-sky-500' />
                {t('A little gift, a little inspiration')}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='wallet-benefit-code'>{t('Benefit code')}</Label>
                <Input
                  id='wallet-benefit-code'
                  placeholder={t('Enter a benefit code')}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button
                  className='w-full'
                  disabled={!code.trim()}
                  onClick={() => props.onRedeem(code)}
                >
                  <Gift />
                  {t('Redeem benefit')}
                </Button>
              </div>
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {t(
                  'After redemption, view the contents in My warehouse. This does not change your wallet balance.'
                )}
              </p>
              <Button
                variant='ghost'
                className='w-full'
                onClick={props.onWarehouse}
              >
                {t('View my warehouse')}
                <ArrowRight />
              </Button>
            </TabsContent>
          </Tabs>
        </TitledCard>
      </div>
    </div>
  )
}
