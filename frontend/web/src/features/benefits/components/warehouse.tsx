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
  Archive,
  Gift,
  Search,
  ArrowRight,
  Eye,
  EyeOff,
  ExternalLink,
  Clock3,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { RichContent } from '@/components/rich-content'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import type { WarehouseItem } from '../types'
import { BenefitCover } from './benefit-cover'
import { DripSubscriptionPanel } from './drip-subscription-panel'

export function Warehouse(props: {
  items: WarehouseItem[]
  onRedeem: () => void
  onPopup: () => void
  hideAnnouncement?: boolean
  onView?: (item: WarehouseItem) => void
  search?: string
  filter?: string
  onSearch?: (value: string) => void
  onFilter?: (value: string) => void
  counts?: { all: number; active: number; expired: number }
  onStore?: () => void
  sourceLabel?: (item: WarehouseItem) => string
}) {
  const { t, i18n } = useTranslation()
  const [localFilter, setFilter] = useState('all')
  const [localSearch, setSearch] = useState('')
  const filter = props.filter ?? localFilter
  const search = props.search ?? localSearch
  const [selected, setSelected] = useState<WarehouseItem | null>(null)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const items = props.onSearch
    ? props.items
    : props.items.filter(
        (item) =>
          (filter === 'all' || item.status === filter) &&
          (item.benefit.name + item.benefit.summary).includes(search)
      )
  const hasFilters = search.trim() !== '' || filter !== 'all'
  const clearFilters = () => {
    if (props.onSearch) props.onSearch('')
    else setSearch('')
    if (props.onFilter) props.onFilter('all')
    else setFilter('all')
  }
  return (
    <div className='mx-auto w-full max-w-6xl min-w-0 space-y-5 sm:space-y-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex min-w-0 items-center gap-3'>
          <IconBadge tone='primary' size='lg' className='hidden sm:flex'>
            <Archive />
          </IconBadge>
          <div className='min-w-0'>
            <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
              {t('My warehouse')}
            </h1>
            <p className='text-muted-foreground mt-1.5 text-sm leading-relaxed'>
              {t(
                'Your resources, accounts and instructions, all in one place.'
              )}
            </p>
          </div>
        </div>
        <div className='flex flex-wrap gap-2 self-start sm:self-auto'>
          {props.onStore && (
            <Button variant='outline' onClick={props.onStore}>
              {t('Browse products')}
              <ArrowRight />
            </Button>
          )}
          <Button onClick={props.onRedeem}>
            <Gift />
            {t('Redeem a resource')}
          </Button>
        </div>
      </div>
      <dl className='grid grid-cols-3 gap-2 sm:gap-4'>
        {[
          {
            label: t('All resources'),
            value: props.counts?.all ?? props.items.length,
            icon: Archive,
            tone: 'primary' as const,
          },
          {
            label: t('Available resources'),
            value:
              props.counts?.active ??
              props.items.filter((x) => x.status === 'active').length,
            icon: ShieldCheck,
            tone: 'success' as const,
          },
          {
            label: t('Expired resources'),
            value:
              props.counts?.expired ??
              props.items.filter((x) => x.status === 'expired').length,
            icon: Clock3,
            tone: 'neutral' as const,
          },
        ].map((stat) => (
          <Card
            key={stat.label}
            className='min-w-0 flex-row items-center justify-between gap-2 p-3 sm:p-5'
          >
            <div className='min-w-0'>
              <dt className='text-muted-foreground text-xs leading-relaxed'>
                {stat.label}
              </dt>
              <dd className='mt-1.5 text-xl font-semibold tabular-nums sm:text-2xl'>
                {formatNumber(stat.value, locale)}
              </dd>
            </div>
            <IconBadge tone={stat.tone} size='md' className='hidden sm:flex'>
              <stat.icon />
            </IconBadge>
          </Card>
        ))}
      </dl>
      {!props.hideAnnouncement && (
        <div className='flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 to-cyan-50/50 px-5 py-4 dark:border-sky-900 dark:from-sky-950 dark:to-cyan-950'>
          <div className='flex items-center gap-3'>
            <div className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 dark:bg-sky-900'>
              <Gift className='size-5' />
            </div>
            <div>
              <p className='text-sm font-semibold'>
                {t('A new resource is waiting for you')}
              </p>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('Resource account · one independent account per recipient')}
              </p>
            </div>
          </div>
          <Button variant='ghost' size='sm' onClick={props.onPopup}>
            {t('View the announcement')}
            <ArrowRight />
          </Button>
        </div>
      )}
      <Card className='gap-0 py-0'>
        <div className='flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5'>
          <Tabs
            value={filter}
            onValueChange={(value) =>
              props.onFilter
                ? props.onFilter(String(value))
                : setFilter(String(value))
            }
          >
            <TabsList aria-label={t('Warehouse filter')}>
              <TabsTrigger value='all'>{t('All')}</TabsTrigger>
              <TabsTrigger value='active'>{t('Available')}</TabsTrigger>
              <TabsTrigger value='expired'>{t('Expired')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className='relative w-full sm:w-64'>
            <Search
              aria-hidden='true'
              className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2'
            />
            <Input
              aria-label={t('Search resources')}
              placeholder={t('Search resources')}
              value={search}
              onChange={(e) =>
                props.onSearch
                  ? props.onSearch(e.target.value)
                  : setSearch(e.target.value)
              }
              className='pl-9'
            />
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={hasFilters ? Search : Archive}
            className='min-h-72 sm:min-h-80'
            title={
              hasFilters
                ? t('No matching resources')
                : t('Your warehouse is empty')
            }
            description={
              hasFilters
                ? t('Try another search or clear the filters.')
                : t(
                    'Redeem a resource code to save accounts, links and instructions here.'
                  )
            }
            action={
              hasFilters ? (
                <Button variant='outline' onClick={clearFilters}>
                  {t('Clear filters')}
                </Button>
              ) : (
                <Button onClick={props.onRedeem}>
                  <Gift />
                  {t('Redeem a resource')}
                </Button>
              )
            }
          />
        ) : (
          <div className='grid gap-4 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3'>
            {items.map((item) => (
              <article
                key={item.id}
                className='bg-card min-w-0 overflow-hidden rounded-xl border transition-shadow hover:shadow-sm'
              >
                <BenefitCover benefit={item.benefit} />
                <div className='space-y-4 p-5'>
                  <div className='flex items-start justify-between gap-2'>
                    <h2 className='min-w-0 text-base font-semibold break-words'>
                      {item.benefit.name}
                    </h2>
                    <Badge
                      variant={
                        item.status === 'active' ? 'secondary' : 'outline'
                      }
                      className={`shrink-0 ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : ''}`}
                    >
                      {item.status === 'active' ? t('Available') : t('Expired')}
                    </Badge>
                  </div>
                  <p className='text-muted-foreground min-h-10 text-sm leading-relaxed break-words'>
                    {item.benefit.summary}
                  </p>
                  <div className='text-muted-foreground space-y-1.5 text-xs'>
                    {props.sourceLabel && (
                      <p>
                        {t('Resource source')}{' '}
                        <span className='text-foreground'>
                          {props.sourceLabel(item)}
                        </span>
                      </p>
                    )}
                    <p>
                      {t('Received on')}{' '}
                      <span className='text-foreground'>{item.received}</span>
                    </p>
                    <p>
                      {t('Valid until')}{' '}
                      <span className='text-foreground'>
                        {item.expires || t('No expiry')}
                      </span>
                    </p>
                  </div>
                  <Button
                    className='w-full'
                    variant='outline'
                    onClick={() =>
                      props.onView ? props.onView(item) : setSelected(item)
                    }
                  >
                    {t('View contents')}
                    <ArrowRight />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className='text-muted-foreground border-t px-4 py-3 text-center text-xs leading-relaxed'>
          {t('Your resources remain here after closing the announcement.')}
        </p>
      </Card>
      {selected && (
        <WarehouseDetail
          key={selected.id}
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

export function WarehouseDetail(props: {
  item: WarehouseItem
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState<string[]>([])
  const clash = props.item.fields.find((field) => field.id === 'clash-subscription')?.value
  const universal = props.item.fields.find((field) => field.id === 'universal-subscription')?.value
  if (
    clash &&
    universal &&
    isDripSubscriptionUrl(clash, 'clash') &&
    isDripSubscriptionUrl(universal, 'sub')
  ) {
    return (
      <DripSubscriptionPanel
        item={props.item}
        clashUrl={clash}
        universalUrl={universal}
        onClose={props.onClose}
      />
    )
  }
  return (
    <Dialog
      open
      title={props.item.benefit.name}
      description={props.item.benefit.summary}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      footer={
        <Button variant='outline' onClick={props.onClose}>
          {t('Close')}
        </Button>
      }
    >
      <div className='space-y-5'>
        <div className='flex flex-wrap gap-2'>
          <Badge variant='secondary'>
            {t('Received on')} {props.item.received}
          </Badge>
          <Badge variant='outline'>
            {props.item.expires || t('No expiry')}
          </Badge>
        </div>
        <div className='space-y-3'>
          {props.item.fields.map((field) => (
            <div key={field.id} className='bg-muted/20 rounded-xl border p-3'>
              <p className='text-muted-foreground mb-2 text-xs'>
                {field.label}
              </p>
              <div className='flex min-w-0 items-center justify-between gap-2'>
                <code className='min-w-0 text-sm break-all'>
                  {field.kind === 'secret' && !revealed.includes(field.id)
                    ? '••••••••••••'
                    : field.value}
                </code>
                <div className='flex shrink-0 items-center'>
                  {field.kind === 'secret' && (
                    <Button
                      size='icon'
                      variant='ghost'
                      aria-label={
                        revealed.includes(field.id)
                          ? t('Hide sensitive field')
                          : t('Show sensitive field')
                      }
                      onClick={() =>
                        setRevealed((previous) =>
                          previous.includes(field.id)
                            ? previous.filter((id) => id !== field.id)
                            : [...previous, field.id]
                        )
                      }
                    >
                      {revealed.includes(field.id) ? <EyeOff /> : <Eye />}
                    </Button>
                  )}
                  <CopyButton
                    value={field.value}
                    aria-label={t('Copy field value')}
                  />
                  {field.kind === 'link' && (
                    <Button
                      size='icon'
                      variant='ghost'
                      render={
                        <a
                          href={field.value}
                          target='_blank'
                          rel='noopener noreferrer'
                        />
                      }
                      aria-label={t('Open website')}
                    >
                      <ExternalLink />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className='rounded-xl border p-4'>
          <RichContent
            content={props.item.benefit.instructions}
            mode={props.item.benefit.format}
            className='[&_img]:h-auto [&_img]:max-w-full'
          />
        </div>
      </div>
    </Dialog>
  )
}

function isDripSubscriptionUrl(value: string, format: 'clash' | 'sub'): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.host === 'skymoni.com' &&
      url.search === '' &&
      url.hash === '' &&
      new RegExp(`^/api/drip/sub/${format}/[A-Za-z0-9_-]{8,128}$`).test(url.pathname)
    )
  } catch {
    return false
  }
}
