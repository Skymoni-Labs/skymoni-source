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
import { ArrowRight, ReceiptText, PackageCheck, Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BenefitCover } from '@/features/benefits/components/benefit-cover'

import type { ShopOrder } from '../types'
import { Credit } from './credit'

export function Orders(props: {
  orders: ShopOrder[]
  onStore: () => void
  onView: (order: ShopOrder) => void
}) {
  const { t } = useTranslation()
  const orders = props.orders
  const statuses = {
    delivered: t('Delivered'),
    pending: t('Awaiting delivery'),
    refunded: t('Refunded'),
  }
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='text-3xl font-semibold tracking-tight'>
            {t('My orders')}
          </h1>
          <p className='text-muted-foreground mt-2 text-sm'>
            {t('Track purchases, credit deductions and delivery in one place.')}
          </p>
        </div>
        <Button variant='outline' onClick={props.onStore}>
          {t('Back to store')}
          <ArrowRight />
        </Button>
      </div>
      {orders.length === 0 ? (
        <EmptyState
          bordered
          icon={ReceiptText}
          title={t('No purchases yet')}
          description={t('Choose something from the store to get started.')}
          action={
            <Button onClick={props.onStore}>{t('Browse products')}</Button>
          }
        />
      ) : (
        <div className='space-y-4'>
          {orders.map((order) => (
            <article key={order.id} className='bg-card rounded-2xl border p-5'>
              <div className='flex flex-wrap items-center justify-between gap-4'>
                <div className='flex min-w-0 items-center gap-4'>
                  <BenefitCover benefit={order.item.benefit} compact />
                  <div className='min-w-0'>
                    <h2 className='text-base font-semibold'>{order.name}</h2>
                    <p className='text-muted-foreground mt-1 text-xs'>
                      {order.created} ·{' '}
                      <span className='font-mono'>{order.id}</span>
                    </p>
                  </div>
                </div>
                <Badge
                  variant='outline'
                  className={
                    order.status === 'delivered'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : ''
                  }
                >
                  {order.status === 'delivered' ? (
                    <PackageCheck className='size-3' />
                  ) : (
                    <Clock3 className='size-3' />
                  )}
                  {statuses[order.status]}
                </Badge>
              </div>
              <div className='mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4'>
                <Credit
                  cents={order.priceCents}
                  className='text-lg font-semibold'
                />
                {order.status === 'delivered' ? (
                  <Button variant='outline' onClick={() => props.onView(order)}>
                    {t('View delivery')}
                    <ArrowRight />
                  </Button>
                ) : (
                  <p className='text-muted-foreground text-xs'>
                    {order.status === 'pending'
                      ? t('The administrator will deliver this order.')
                      : t('Credit returned to your wallet')}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
