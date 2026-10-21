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
  ArrowRight,
  Search,
  ShoppingBag,
  Zap,
  Clock3,
  PackageCheck,
  Wallet,
  Archive,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  getProductPackages,
  isProductOnSale,
  packageStock,
} from '../lib/catalog'
import type { ShopData, ShopProduct } from '../types'
import { Credit } from './credit'
import { ProductArtwork } from './product-artwork'

export function Store(props: {
  live?: boolean
  guest?: boolean
  data: ShopData
  onSelect: (product: ShopProduct) => void
  onOrders: () => void
  onLogin?: () => void
}) {
  const { t, i18n } = useTranslation()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const categories = [
    ...new Set(
      props.data.products.filter(isProductOnSale).map((p) => p.categoryLabel)
    ),
  ]
  const products = [...props.data.products]
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .filter(
      (product) =>
        isProductOnSale(product) &&
        (filter === 'all' || `category:${product.categoryLabel}` === filter) &&
        (product.benefit.name + product.benefit.summary + (product.tags || ''))
          .toLowerCase()
          .includes(query.toLowerCase())
    )

  return (
    <div className='space-y-5'>
      <section
        aria-label={t('Store introduction')}
        className='flex flex-wrap items-end justify-between gap-5 border-b pb-6'
      >
        <div>
          <p className='mb-3 text-[11px] font-medium tracking-[.2em] text-sky-700'>
            {t('Skymoni store')}
          </p>
          <h1 className='text-3xl font-semibold tracking-tight sm:text-4xl'>
            {t('Curated digital goods')}
          </h1>
          <p className='text-muted-foreground mt-3 text-sm leading-6'>
            {t('Accounts and passes, purchased with your site credit.')}
          </p>
        </div>
        {props.guest ? (
          <div className='flex flex-wrap items-center gap-3'>
            <span className='text-muted-foreground text-xs'>
              {t('Browse freely. Sign in when you are ready to buy.')}
            </span>
            <Button onClick={props.onLogin}>{t('Sign in to buy')}</Button>
          </div>
        ) : (
          <div className='site-glass-surface flex items-center gap-5 rounded-xl border bg-white px-4 py-3 dark:bg-slate-900'>
            <div>
              <p className='text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px]'>
                <Wallet className='size-3.5' />
                {t('Available balance')}
              </p>
              <Credit
                cents={props.data.balanceCents}
                className='text-2xl font-semibold'
              />
            </div>
            <Button
              variant='ghost'
              size='icon'
              aria-label={t('My orders')}
              onClick={props.onOrders}
              className='rounded-full border'
            >
              <ArrowRight className='size-4' />
            </Button>
          </div>
        )}
      </section>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(String(value))}
          className='max-w-full overflow-x-auto'
        >
          <TabsList
            variant='line'
            aria-label={t('Product categories')}
            className='gap-5'
          >
            <TabsTrigger value='all' className='px-0'>
              {t('All products')}
            </TabsTrigger>
            {categories.map((category) => (
              <TabsTrigger
                key={category}
                value={`category:${category}`}
                className='px-0'
              >
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className='relative w-full sm:w-64'>
          <Search
            aria-hidden
            className='text-muted-foreground absolute top-2.5 left-3 size-4'
          />
          <Input
            aria-label={t('Search products')}
            placeholder={t('Search products')}
            className='rounded-lg bg-white pl-9 dark:bg-slate-900'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      {products.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={t(
            query || filter !== 'all'
              ? 'No matching products'
              : 'No products available'
          )}
          description={t(
            query || filter !== 'all'
              ? 'Try another category or search.'
              : 'New products will appear here when published.'
          )}
        />
      ) : (
        <div
          className={cn(
            'grid gap-5 md:grid-cols-2 lg:grid-cols-3',
            'auto-rows-auto'
          )}
        >
          {products.map((product) => {
            const packages = getProductPackages(product)
            const stock = packages.reduce(
              (sum, pack) => sum + packageStock(props.data, product, pack.id),
              0
            )
            const price = Math.min(...packages.map((pack) => pack.priceCents))
            const large = product.cardSize === 'large'
            let stockLabel = t('Sold out')
            if (stock > 0) {
              stockLabel = props.guest
                ? t('In stock')
                : t('{{stock}} available', {
                    stock: formatNumber(stock, locale),
                  })
            }
            return (
              <article
                key={product.id}
                className={cn(
                  'site-glass-surface group flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md dark:bg-slate-900',
                  large && 'md:col-span-2 lg:row-span-2'
                )}
              >
                <div
                  className={cn('relative flex flex-col', large && 'flex-1')}
                >
                  <ProductArtwork product={product} large={large} />
                  {product.featured && (
                    <Badge
                      variant='secondary'
                      className='absolute top-4 left-4 rounded-md border border-white/70 bg-white/90 text-[10px] text-slate-700'
                    >
                      {t('Featured')}
                    </Badge>
                  )}
                </div>
                <div
                  className={cn(
                    'flex flex-1 flex-col gap-3 p-4',
                    large && 'flex-none gap-4 p-5 sm:p-6'
                  )}
                >
                  <div>
                    <h3
                      className={cn(
                        'text-base font-semibold',
                        large && 'text-xl'
                      )}
                    >
                      {product.benefit.name}
                    </h3>
                    <p className='text-muted-foreground mt-1.5 text-xs leading-5'>
                      {product.benefit.summary}
                    </p>
                  </div>
                  <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-[11px]'>
                    <span className='flex items-center gap-1.5'>
                      {product.delivery === 'instant' ? (
                        <Zap className='size-3' />
                      ) : (
                        <Clock3 className='size-3' />
                      )}
                      {product.delivery === 'instant'
                        ? t('Instant delivery')
                        : t('Manual delivery')}
                      {!props.live && (
                        <>
                          <span className='mx-1 text-slate-300'>/</span>
                          {t('Sample terms')}
                        </>
                      )}
                    </span>
                    <span
                      className={stock > 0 ? 'text-emerald-700' : undefined}
                    >
                      {stockLabel}
                    </span>
                  </div>
                  <div className='mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-3'>
                    <div>
                      <Credit
                        cents={price}
                        className={cn(
                          'text-xl font-semibold',
                          large && 'text-2xl'
                        )}
                      />
                      {packages.length > 1 && (
                        <span className='text-muted-foreground ml-1 text-[11px]'>
                          {t('From')}
                        </span>
                      )}
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <Button
                        variant='outline'
                        className='rounded-lg'
                        size='sm'
                        onClick={() => props.onSelect(product)}
                      >
                        {t('Details')}
                      </Button>
                      <Button
                        className='rounded-lg bg-slate-900 px-4 text-white hover:bg-slate-800 dark:bg-sky-700 dark:hover:bg-sky-600'
                        size='sm'
                        disabled={stock === 0}
                        onClick={() => props.onSelect(product)}
                      >
                        {stock > 0
                          ? t('Buy product')
                          : t('Temporarily sold out')}
                        {stock > 0 && <ArrowRight className='size-3.5' />}
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <div className='grid gap-5 border-y py-5 text-sm sm:grid-cols-3'>
        {[
          {
            icon: Wallet,
            title: t('Wallet payment'),
            desc: t('Confirm the deduction before paying.'),
          },
          {
            icon: PackageCheck,
            title: t('Clear delivery'),
            desc: t('Delivery mode and stock are shown per product.'),
          },
          {
            icon: Archive,
            title: t('Saved in your warehouse'),
            desc: t('Return to your purchases whenever you need them.'),
          },
        ].map((item) => (
          <div key={item.title} className='flex items-start gap-3'>
            <item.icon className='mt-0.5 size-4 shrink-0 text-sky-700' />
            <div>
              <h2 className='text-xs font-medium'>{item.title}</h2>
              <p className='text-muted-foreground mt-1 text-[11px] leading-5'>
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className='text-muted-foreground text-center text-[11px]'>
        {props.live
          ? t(
              'Purchases use your wallet credit. Delivery details are saved in My warehouse.'
            )
          : t(
              'Prices, benefits, validity and stock are samples for this design preview.'
            )}
      </p>
    </div>
  )
}
