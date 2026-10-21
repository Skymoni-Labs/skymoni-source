import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Credit } from '@/features/shop-preview/components/credit'
import type { ShopOrder } from '@/features/shop-preview/types'
import { toIntlLocale } from '@/i18n/languages'

const statuses = ['all', 'pending', 'delivered', 'refunded'] as const
type OrderStatus = (typeof statuses)[number]
const badgeVariants = {
  pending: 'warning',
  delivered: 'secondary',
  refunded: 'outline',
} as const

export function ShopAfterSales(props: {
  orders: ShopOrder[]
  total: number
  page: number
  status: OrderStatus
  query: string
  loading: boolean
  onStatusChange: (status: OrderStatus) => void
  onQueryChange: (query: string) => void
  onPageChange: (page: number) => void
  onRefund: (order: ShopOrder) => void
  onDeliver: (order: ShopOrder) => void
}) {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState(props.query)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const pageCount = Math.max(1, Math.ceil(props.total / 50))
  const labels: Record<OrderStatus, string> = {
    all: t('All orders'),
    pending: t('Awaiting delivery'),
    delivered: t('Delivered orders'),
    refunded: t('Refunded orders'),
  }
  const orderLabels: Record<ShopOrder['status'], string> = {
    pending: t('Awaiting delivery'),
    delivered: t('Delivered'),
    refunded: t('Refunded'),
  }
  const fulfillmentStatus = (order: ShopOrder) =>
    order.status === 'delivered' &&
    (order.provisionState === 'pending' ||
      order.provisionState === 'needs_review') && (
      <div className='text-muted-foreground mt-1 text-xs'>
        {order.provisionState === 'needs_review'
          ? t('Drip activation needs review')
          : t('Drip activation pending')}
      </div>
    )
  const date = (value?: string) =>
    value ? new Date(value).toLocaleString(locale) : '-'
  const actions = (order: ShopOrder) =>
    order.status !== 'refunded' && (
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => props.onRefund(order)}
        >
          {t('Refund credit')}
        </Button>
        {order.status === 'pending' && (
          <Button size='sm' onClick={() => props.onDeliver(order)}>
            {t('Confirm delivery')}
          </Button>
        )}
      </div>
    )
  const refundDetails = (order: ShopOrder) =>
    order.refundReason && (
      <div className='text-muted-foreground mt-2 text-xs break-words'>
        {t('Refund reason')}: {order.refundReason}
        <div>
          {date(order.refundAt)} · {t('Operator')} #{order.refundActorId}
        </div>
      </div>
    )

  return (
    <section className='space-y-5'>
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-semibold'>
            {t('Orders and after-sales')}
          </h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('Review delivery, customers and order-linked credit refunds.')}
          </p>
        </div>
        <span className='text-muted-foreground text-sm'>
          {t('{{count}} orders', { count: props.total })}
        </span>
      </header>
      <div className='flex flex-wrap items-center gap-3 border-b pb-4'>
        <div
          className='flex flex-wrap gap-1'
          role='group'
          aria-label={t('Order status')}
        >
          {statuses.map((status) => (
            <Button
              key={status}
              size='sm'
              variant={props.status === status ? 'default' : 'ghost'}
              onClick={() => props.onStatusChange(status)}
            >
              {labels[status]}
            </Button>
          ))}
        </div>
        <form
          className='ml-auto flex w-full max-w-sm gap-2 sm:w-auto'
          onSubmit={(event) => {
            event.preventDefault()
            props.onQueryChange(draft.trim())
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={80}
            placeholder={t('Order ID, user ID or product')}
            aria-label={t('Search orders')}
          />
          <Button
            type='submit'
            variant='outline'
            aria-label={t('Search orders')}
            title={t('Search orders')}
          >
            <Search className='size-4' />
          </Button>
        </form>
      </div>
      <div className='divide-y border-y md:hidden'>
        {props.orders.map((order) => (
          <article key={order.id} className='space-y-3 py-4'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='font-medium break-words'>
                  #{order.id} · {order.name}
                </div>
                <div className='text-muted-foreground mt-1 text-xs'>
                  {order.packageName || order.packageId} · {date(order.created)}
                </div>
              </div>
              <Badge variant={badgeVariants[order.status]}>
                {orderLabels[order.status]}
              </Badge>
              {fulfillmentStatus(order)}
            </div>
            <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
              <span className='text-muted-foreground'>
                {order.userName || `${t('User ID')} #${order.userId}`}
              </span>
              <Credit cents={order.priceCents} />
            </div>
            {refundDetails(order)}
            {actions(order)}
          </article>
        ))}
        {!props.loading && props.orders.length === 0 && (
          <p className='text-muted-foreground py-12 text-center text-sm'>
            {t('No matching orders')}
          </p>
        )}
      </div>
      <div className='hidden overflow-x-auto border-y md:block'>
        <table className='w-full min-w-[760px] text-left text-sm'>
          <thead className='bg-muted/40 text-muted-foreground text-xs'>
            <tr>
              <th className='px-3 py-3 font-medium'>{t('Order')}</th>
              <th className='px-3 py-3 font-medium'>{t('Customer')}</th>
              <th className='px-3 py-3 font-medium'>{t('Amount')}</th>
              <th className='px-3 py-3 font-medium'>{t('Status')}</th>
              <th className='px-3 py-3 text-right font-medium'>
                {t('Actions')}
              </th>
            </tr>
          </thead>
          <tbody className={props.loading ? 'opacity-60' : ''}>
            {props.orders.map((order) => (
              <tr key={order.id} className='border-t align-top'>
                <td className='px-3 py-3'>
                  <div className='font-medium'>
                    #{order.id} · {order.name}
                  </div>
                  <div className='text-muted-foreground mt-1 text-xs'>
                    {order.packageName || order.packageId} ·{' '}
                    {date(order.created)}
                  </div>
                </td>
                <td className='px-3 py-3'>
                  <div>
                    {order.userName || `${t('User ID')} #${order.userId}`}
                  </div>
                  {order.userName && (
                    <div className='text-muted-foreground mt-1 text-xs'>
                      {t('User ID')} #{order.userId}
                    </div>
                  )}
                </td>
                <td className='px-3 py-3'>
                  <Credit cents={order.priceCents} />
                </td>
                <td className='px-3 py-3'>
                  <Badge variant={badgeVariants[order.status]}>
                    {orderLabels[order.status]}
                  </Badge>
                  {fulfillmentStatus(order)}
                  {refundDetails(order)}
                </td>
                <td className='px-3 py-3 text-right'>
                  <div className='flex justify-end'>{actions(order)}</div>
                </td>
              </tr>
            ))}
            {!props.loading && props.orders.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className='text-muted-foreground py-12 text-center'
                >
                  {t('No matching orders')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className='flex items-center justify-end gap-2'>
        <span className='text-muted-foreground mr-2 text-xs'>
          {props.page} / {pageCount}
        </span>
        <Button
          variant='outline'
          size='icon'
          disabled={props.page <= 1 || props.loading}
          onClick={() => props.onPageChange(props.page - 1)}
          title={t('Previous page')}
          aria-label={t('Previous page')}
        >
          <ChevronLeft className='size-4' />
        </Button>
        <Button
          variant='outline'
          size='icon'
          disabled={props.page >= pageCount || props.loading}
          onClick={() => props.onPageChange(props.page + 1)}
          title={t('Next page')}
          aria-label={t('Next page')}
        >
          <ChevronRight className='size-4' />
        </Button>
      </div>
    </section>
  )
}
