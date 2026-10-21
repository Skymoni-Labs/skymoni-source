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
import {
  Plus,
  Package,
  Settings2,
  Boxes,
  ReceiptText,
  FileText,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BenefitCover } from '@/features/benefits/components/benefit-cover'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  getProductPackages,
  isProductOnSale,
  packageStock,
} from '../lib/catalog'
import type { ShopData, ShopOrder, ShopProduct } from '../types'
import { Credit } from './credit'

export function ShopAdmin(props: {
  live?: boolean
  data: ShopData
  onEdit: (product: ShopProduct, section?: 'basic' | 'content') => void
  onAdd: () => void
  onStock: (product: ShopProduct) => void
  onToggle: (id: string) => void
  onDeliver: (order: ShopOrder) => void
  onRefund: (order: ShopOrder) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const pending = props.data.orders.filter(
    (order) => order.status === 'pending'
  )
  const resourceStock = new Map<string, number>()
  const productStock = new Map<string, number>()
  for (const product of props.data.products) {
    let stock = 0
    for (const pack of getProductPackages(product)) {
      const count = packageStock(props.data, product, pack.id)
      stock += count
      resourceStock.set(
        product.resourceIds?.[pack.id] || `${product.benefit.id}:${pack.id}`,
        count
      )
    }
    productStock.set(product.id, stock)
  }
  return (
    <div className='space-y-7'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='text-3xl font-semibold tracking-tight'>
            {t('Product management')}
          </h1>
          <p className='text-muted-foreground mt-2 text-sm'>
            {t('Set prices, maintain stock and deliver customer orders.')}
          </p>
        </div>
        <Button onClick={props.onAdd}>
          <Plus />
          {t('New product')}
        </Button>
      </div>
      <div className='grid gap-3 sm:grid-cols-3'>
        {[
          {
            label: t('Products on sale'),
            value: props.data.products.filter(isProductOnSale).length,
            icon: Package,
          },
          {
            label: t('Available inventory'),
            value: [...resourceStock.values()].reduce(
              (sum, count) => sum + count,
              0
            ),
            icon: Boxes,
          },
          {
            label: t('Awaiting delivery'),
            value: pending.length,
            icon: ReceiptText,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className='bg-card flex items-center justify-between rounded-2xl border p-5'
          >
            <div>
              <p className='text-muted-foreground text-xs'>{stat.label}</p>
              <p className='mt-2 text-2xl font-semibold'>
                {formatNumber(stat.value, locale)}
              </p>
            </div>
            <stat.icon className='size-5 text-sky-500' />
          </div>
        ))}
      </div>
      <div className='space-y-3'>
        {props.data.products.map((product) => (
          <article key={product.id} className='bg-card rounded-2xl border p-5'>
            <div className='flex flex-wrap items-center justify-between gap-4'>
              <div className='flex min-w-0 items-center gap-4'>
                <BenefitCover benefit={product.benefit} compact />
                <div>
                  <h2 className='font-semibold'>{product.benefit.name}</h2>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {product.delivery === 'instant'
                      ? t('Instant delivery')
                      : t('Manual delivery')}{' '}
                    ·{' '}
                    {t('{{stock}} available', {
                      stock: formatNumber(
                        productStock.get(product.id) || 0,
                        locale
                      ),
                    })}
                  </p>
                </div>
              </div>
              <div className='flex items-center gap-5'>
                <Credit
                  cents={product.priceCents}
                  className='text-xl font-semibold'
                />
                <Badge variant='outline'>
                  {isProductOnSale(product) ? t('On sale') : t('Off sale')}
                </Badge>
              </div>
            </div>
            <div className='mt-4 flex flex-wrap gap-2 text-xs'>
              {getProductPackages(product).map((pack) => (
                <span
                  key={pack.id}
                  className='rounded-md border bg-slate-50 px-2 py-1 dark:bg-slate-900'
                >
                  {t(pack.name)} · <Credit cents={pack.priceCents} /> ·{' '}
                  {t('{{stock}} available', {
                    stock: formatNumber(
                      packageStock(props.data, product, pack.id),
                      locale
                    ),
                  })}
                </span>
              ))}
            </div>
            <div className='mt-4 flex flex-wrap gap-2 border-t pt-4'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => props.onEdit(product, 'basic')}
              >
                <Settings2 />
                {t('Edit product')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => props.onEdit(product, 'content')}
              >
                <FileText />
                {t('Edit details')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => props.onStock(product)}
              >
                <Boxes />
                {props.live && product.id === '3' && t('Sale quantities')}
                {props.live && product.id !== '3' && t('Inventory and codes')}
                {!props.live && t('Add sample stock')}
              </Button>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => props.onToggle(product.id)}
              >
                {isProductOnSale(product)
                  ? t('Take off sale')
                  : t('Put on sale')}
              </Button>
            </div>
          </article>
        ))}
      </div>
      <section className='bg-card rounded-2xl border p-5'>
        <h2 className='mb-4 text-base font-semibold'>
          {t('Orders awaiting delivery')}
        </h2>
        {pending.length === 0 ? (
          <p className='text-muted-foreground py-5 text-center text-sm'>
            {t('No orders awaiting delivery')}
          </p>
        ) : (
          <div className='space-y-4'>
            {pending.map((order) => (
              <article
                key={order.id}
                className='flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4'
              >
                <div>
                  <h3 className='text-sm font-medium'>{order.name}</h3>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {order.id} ·{' '}
                    {props.live
                      ? `${t('User ID')} ${order.userId}`
                      : t('Preview user')}
                  </p>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => props.onRefund(order)}
                  >
                    {t('Cancel and refund')}
                  </Button>
                  <Button size='sm' onClick={() => props.onDeliver(order)}>
                    {t('Confirm delivery')}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className='text-muted-foreground text-xs'>
        {props.live
          ? t(
              'Stock and redemption codes share the same encrypted delivery inventory.'
            )
          : t(
              'Stock import uses fictional sample data here. Production will support encrypted account inventory and batch import.'
            )}
      </p>
    </div>
  )
}
