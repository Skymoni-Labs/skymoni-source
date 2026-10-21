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
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCanEditModelPricing } from '@/features/model-pricing/api'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'

import {
  getUpstreamMonitor,
  queueUpstreamSync,
  useUpstreamMonitor,
  type UpstreamMonitorModel,
  type UpstreamMonitorPriceChange,
  type UpstreamMonitorProvider,
  type UpstreamMonitorSnapshot,
} from '../upstream-monitor-api'
import { useModels } from './models-provider'
import {
  UpstreamMonitorPrice,
  UpstreamMonitorTiers,
  UpstreamSaleSuggestion,
} from './upstream-monitor-price'

function sourceName(provider: string): string {
  switch (provider) {
    case 'yylx':
      return 'YYLX'
    case '2000run':
      return '2000.run'
    case 'typesafe':
      return 'TypeSafe'
    default:
      return provider
  }
}

function formatCheckTime(
  value: string | null,
  locale: string | undefined,
  unknown: string
) {
  if (!value) return unknown
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? unknown : date.toLocaleString(locale)
}

function modelGroup(model: UpstreamMonitorModel): string | null {
  if ('group' in model && typeof model.group === 'string' && model.group) {
    return model.group
  }
  if ('group_id' in model && typeof model.group_id === 'string') {
    return model.group_id
  }
  return null
}

function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null
  } catch {
    return null
  }
}

function ProviderCard(props: {
  provider: UpstreamMonitorProvider
  selected: boolean
  onSelect: () => void
  locale: string | undefined
}) {
  const { t } = useTranslation()
  const source = props.provider
  const unknown = Boolean(source.error) && source.models.length === 0
  let statusLabel = t('Error')
  let variant: 'success' | 'warning' | 'danger' = 'danger'
  if (source.status === 'ok') {
    statusLabel = t('Healthy')
    variant = 'success'
  } else if (source.status === 'partial') {
    statusLabel = t('Partial data')
    variant = 'warning'
  }

  return (
    <Button
      type='button'
      variant='outline'
      aria-pressed={props.selected}
      onClick={props.onSelect}
      className='hover:bg-muted/40 aria-pressed:border-primary aria-pressed:bg-primary/5 h-auto min-w-0 flex-col items-stretch gap-3 rounded-xl p-4 text-left whitespace-normal'
    >
      <span className='flex w-full items-center justify-between gap-2'>
        <span className='min-w-0 truncate font-semibold'>
          {sourceName(source.provider)}
        </span>
        <StatusBadge
          label={statusLabel}
          variant={variant}
          copyable={false}
          className='shrink-0'
        />
      </span>
      <span className='text-muted-foreground w-full text-xs'>
        {t('Checked at')}:{' '}
        {formatCheckTime(source.checked_at, props.locale, t('Unknown'))}
      </span>
      {source.stale && (
        <span className='text-warning text-xs'>
          {t('Showing last successful upstream snapshot')}
        </span>
      )}
      {source.last_success_at && (
        <span className='text-muted-foreground w-full text-xs'>
          {t('Last successful check')}:{' '}
          {formatCheckTime(source.last_success_at, props.locale, t('Unknown'))}
        </span>
      )}
      {source.last_changed_at && (
        <span className='text-muted-foreground w-full text-xs'>
          {t('Last upstream change')}:{' '}
          {formatCheckTime(source.last_changed_at, props.locale, t('Unknown'))}
        </span>
      )}
      <span className='grid w-full grid-cols-2 gap-2 text-xs sm:grid-cols-4'>
        <span>
          <span className='text-muted-foreground block'>{t('Models')}</span>
          <strong>{unknown ? t('Unknown') : source.models.length}</strong>
        </span>
        <span>
          <span className='text-muted-foreground block'>{t('New models')}</span>
          <strong>{unknown ? t('Unknown') : source.new_models.length}</strong>
        </span>
        <span>
          <span className='text-muted-foreground block'>
            {t('Removed models')}
          </span>
          <strong>
            {unknown ? t('Unknown') : source.removed_models.length}
          </strong>
        </span>
        <span>
          <span className='text-muted-foreground block'>
            {t('Latest price changes')}
          </span>
          <strong>{source.price_changes?.length ?? 0}</strong>
        </span>
      </span>
    </Button>
  )
}

function ChangeList(props: {
  label: string
  names: string[]
  unknown: boolean
}) {
  const { t } = useTranslation()
  let content: ReactNode
  if (props.unknown) {
    content = (
      <p className='text-muted-foreground mt-2 text-xs'>{t('Unknown')}</p>
    )
  } else if (props.names.length === 0) {
    content = <p className='text-muted-foreground mt-2 text-xs'>{t('None')}</p>
  } else {
    content = (
      <ul className='mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto'>
        {props.names.map((name) => (
          <li
            key={name}
            className='bg-muted max-w-full rounded-md px-2 py-1 text-xs break-all'
          >
            {name}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className='min-w-0 rounded-lg border p-3'>
      <h3 className='text-sm font-semibold'>
        {props.label} ({props.unknown ? t('Unknown') : props.names.length})
      </h3>
      {content}
    </div>
  )
}

function PriceChangeList(props: {
  changes: UpstreamMonitorPriceChange[]
  changedAt?: string | null
  locale: string | undefined
}) {
  const { t } = useTranslation()
  const fields = [
    { key: 'input_per_million', label: t('Input'), unit: 'USD/1M' },
    { key: 'output_per_million', label: t('Output'), unit: 'USD/1M' },
    {
      key: 'cache_read_per_million',
      label: t('Cache read'),
      unit: 'USD/1M',
    },
    {
      key: 'cache_write_per_million',
      label: t('Cache write'),
      unit: 'USD/1M',
    },
    {
      key: 'cache_write_1h_per_million',
      label: t('Cache write 1h'),
      unit: 'USD/1M',
    },
    { key: 'per_request', label: t('Per request'), unit: 'USD/request' },
    {
      key: 'effective_input_per_million',
      label: `${t('Effective price')} · ${t('Input')}`,
      unit: 'USD/1M',
    },
    {
      key: 'effective_output_per_million',
      label: `${t('Effective price')} · ${t('Output')}`,
      unit: 'USD/1M',
    },
    {
      key: 'effective_cache_read_per_million',
      label: `${t('Effective price')} · ${t('Cache read')}`,
      unit: 'USD/1M',
    },
    {
      key: 'effective_cache_write_per_million',
      label: `${t('Effective price')} · ${t('Cache write')}`,
      unit: 'USD/1M',
    },
    {
      key: 'effective_cache_write_1h_per_million',
      label: `${t('Effective price')} · ${t('Cache write 1h')}`,
      unit: 'USD/1M',
    },
    {
      key: 'effective_per_request',
      label: `${t('Effective price')} · ${t('Per request')}`,
      unit: 'USD/request',
    },
    { key: 'group_ratio', label: t('Upstream group multiplier'), unit: '×' },
    { key: 'model_ratio', label: t('Model ratio'), unit: '×' },
    { key: 'completion_ratio', label: t('Completion ratio'), unit: '×' },
  ] as const
  const amount = (value: number | null | undefined) =>
    value == null
      ? t('Unknown')
      : new Intl.NumberFormat(props.locale, {
          maximumFractionDigits: 8,
        }).format(value)

  return (
    <div className='rounded-lg border p-3'>
      <div className='flex flex-wrap items-baseline justify-between gap-2'>
        <h3 className='text-sm font-semibold'>
          {t('Latest price changes')} ({props.changes.length})
        </h3>
        {props.changedAt && (
          <span className='text-muted-foreground text-xs'>
            {formatCheckTime(props.changedAt, props.locale, t('Unknown'))}
          </span>
        )}
      </div>
      {props.changes.length === 0 ? (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t('No recorded upstream price changes')}
        </p>
      ) : (
        <ul className='mt-2 max-h-72 space-y-2 overflow-y-auto'>
          {props.changes.map((change) => {
            const changed = fields.filter(
              ({ key }) => change.old_price[key] !== change.new_price[key]
            )
            return (
              <li
                key={`${change.group_id ?? change.group ?? ''}-${change.name}`}
                className='bg-muted/30 rounded-md border p-2 text-xs'
              >
                <p className='font-medium break-all'>
                  {change.name}
                  {change.group && (
                    <span className='text-muted-foreground ml-2'>
                      {change.group}
                    </span>
                  )}
                </p>
                {change.old_billing_type !== change.new_billing_type && (
                  <p>
                    {t('Billing type')}: {change.old_billing_type} →{' '}
                    {change.new_billing_type}
                  </p>
                )}
                {changed.map(({ key, label, unit }) => (
                  <p key={key} className='text-muted-foreground mt-1'>
                    {label}: {amount(change.old_price[key])} →{' '}
                    {amount(change.new_price[key])} {unit}
                  </p>
                ))}
                {change.tiers_changed && (
                  <p className='text-warning mt-1'>
                    {t(
                      'Tiered pricing changed; review the current tiers below.'
                    )}
                  </p>
                )}
                {change.peak_changed && (
                  <p className='text-warning mt-1'>
                    {t(
                      'Peak multiplier changed; review the current rate below.'
                    )}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ModelPriceRow(props: {
  model: UpstreamMonitorModel
  provider: string
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const model = props.model
  const group = modelGroup(model)
  const ratio = model.raw_price.group_ratio
  const ratioLabel =
    ratio != null && Number.isFinite(ratio)
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(
          ratio
        )
      : t('Unknown')
  const peak = model.peak_rate_multiplier
  const peakLabel =
    peak != null && Number.isFinite(peak)
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(peak)
      : t('Unknown')

  return (
    <li className='space-y-3 rounded-xl border p-3 sm:p-4'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <h4 className='text-sm font-semibold break-all'>{model.name}</h4>
          {group && (
            <p className='text-muted-foreground mt-1 text-xs break-all'>
              {t('Group')}: {group}
            </p>
          )}
        </div>
        {model.price_status === 'unknown' && (
          <StatusBadge
            label={t('Unknown')}
            variant='warning'
            copyable={false}
          />
        )}
      </div>
      <UpstreamMonitorPrice model={model} />
      <UpstreamSaleSuggestion model={model} provider={props.provider} />
      <UpstreamMonitorTiers model={model} />
      {ratio != null && (
        <p className='text-muted-foreground text-xs'>
          {t('Upstream group multiplier')}: {ratioLabel}×
        </p>
      )}
      {peak != null && (
        <p className='text-muted-foreground text-xs'>
          {t('Peak rate multiplier')}: {peakLabel}×
        </p>
      )}
    </li>
  )
}

function MonitorData(props: {
  snapshot: UpstreamMonitorSnapshot
  locale: string | undefined
}) {
  const { t } = useTranslation()
  const [selectedProvider, setSelectedProvider] = useState('yylx')
  const [search, setSearch] = useState('')
  const provider =
    props.snapshot.providers.find(
      (item) => item.provider === selectedProvider
    ) ?? props.snapshot.providers[0]
  const sourceUrl = provider ? safeSourceUrl(provider.source_url) : null
  const models = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!provider) return []
    if (!needle) return provider.models
    return provider.models.filter((model) => {
      const group = modelGroup(model) ?? ''
      return (
        model.name.toLowerCase().includes(needle) ||
        group.toLowerCase().includes(needle)
      )
    })
  }, [provider, search])

  return (
    <div className='space-y-4'>
      <div
        className='grid gap-3 lg:grid-cols-3'
        aria-label={t('Upstream sources')}
      >
        {props.snapshot.providers.map((source) => (
          <ProviderCard
            key={source.provider}
            provider={source}
            locale={props.locale}
            selected={provider?.provider === source.provider}
            onSelect={() => {
              setSelectedProvider(source.provider)
              setSearch('')
            }}
          />
        ))}
      </div>
      {provider && (
        <div className='space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h2 className='text-base font-semibold'>
              {sourceName(provider.provider)}
            </h2>
            {sourceUrl && (
              <Button
                size='sm'
                variant='ghost'
                render={
                  <a
                    href={sourceUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                {t('View source website')}
                <ExternalLink className='size-3.5' />
              </Button>
            )}
          </div>
          {provider.notice && (
            <p
              role='status'
              className='text-muted-foreground rounded-lg border p-3 text-sm'
            >
              {t(provider.notice)}{' '}
              <a
                className='underline'
                href='https://docs.typesafe.ai/models'
                target='_blank'
                rel='noreferrer'
              >
                {t('Official model documentation')}
              </a>
            </p>
          )}
          {provider.error && (
            <p
              role='alert'
              className='text-destructive border-destructive/30 rounded-lg border p-3 text-sm break-words'
            >
              {provider.error}
            </p>
          )}
          {provider.history_error && (
            <p role='alert' className='text-warning text-xs'>
              {provider.history_error}
            </p>
          )}
          {provider.stale && (
            <p className='text-warning rounded-lg border p-3 text-xs'>
              {t('Showing last successful upstream snapshot')}
            </p>
          )}
          <div className='grid gap-3 sm:grid-cols-2'>
            <ChangeList
              label={t('New models')}
              names={provider.new_models}
              unknown={Boolean(provider.error) && provider.models.length === 0}
            />
            <ChangeList
              label={t('Removed models')}
              names={provider.removed_models}
              unknown={Boolean(provider.error) && provider.models.length === 0}
            />
          </div>
          <PriceChangeList
            changes={provider.price_changes ?? []}
            changedAt={provider.last_price_changed_at}
            locale={props.locale}
          />
          {provider.diff_scope === 'model_name_only' &&
            !provider.removal_actionable && (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Model changes are name-only comparisons; verify upstream groups manually before making removal decisions.'
                )}
              </p>
            )}
          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <h3 className='text-sm font-semibold'>
                {t('Upstream models')} ({models.length})
              </h3>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={t('Search upstream models')}
                placeholder={t('Search upstream models')}
                className='h-8 w-full sm:w-64'
              />
            </div>
            {models.length === 0 ? (
              <p className='text-muted-foreground rounded-lg border p-6 text-center text-sm'>
                {search ? t('No matching models') : t('No data')}
              </p>
            ) : (
              <ul className='space-y-3'>
                {models.map((model) => (
                  <ModelPriceRow
                    key={`${model.name}-${model.group_id ?? modelGroup(model) ?? ''}`}
                    model={model}
                    provider={provider.provider}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function UpstreamMonitorSection() {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const { setOpen } = useModels()
  const canPrice = useCanEditModelPricing()
  const [showPriceSyncWarning, setShowPriceSyncWarning] = useState(false)
  const query = useUpstreamMonitor()
  const sync = useMutation({
    mutationFn: queueUpstreamSync,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['skymoni-upstream-monitor'] }),
  })
  const check = useMutation({
    mutationFn: () => getUpstreamMonitor(true),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(['skymoni-upstream-monitor'], snapshot)
    },
  })
  const snapshot = query.data
  let content: ReactNode
  if (query.isPending && !snapshot) {
    content = <LoadingState />
  } else if (query.isError && !snapshot) {
    content = (
      <ErrorState
        title={t('Failed to check upstream sources')}
        onRetry={() => void query.refetch()}
      />
    )
  } else if (!snapshot?.providers.length) {
    content = <EmptyState title={t('No upstream snapshot available')} />
  } else {
    content = <MonitorData snapshot={snapshot} locale={locale} />
  }

  return (
    <section
      className='h-full space-y-4 overflow-y-auto pb-4'
      aria-label={t('Upstream monitor')}
    >
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <p className='text-muted-foreground text-sm'>
            {t(
              'While this page is open, status is polled every minute. Upstream quotes refresh every 5 minutes or when checked manually, subject to a 30-second minimum interval.'
            )}
          </p>
          <p className='text-muted-foreground mt-1 text-xs'>
            {snapshot?.auto_sync_enabled
              ? t(
                  'Automatic sync runs every 15 minutes. Verified prices are saved before new models are enabled.'
                )
              : t(
                  'Monitoring only; model prices are not changed automatically.'
                )}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canPrice && snapshot?.auto_sync_enabled && (
            <Button
              type='button'
              size='sm'
              disabled={
                sync.isPending ||
                snapshot.auto_sync_task?.status === 'running' ||
                snapshot.auto_sync_task?.status === 'pending'
              }
              onClick={() => sync.mutate()}
            >
              {t('Sync models and prices now')}
            </Button>
          )}
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={check.isPending}
            onClick={() => check.mutate()}
          >
            <RefreshCw
              className={check.isPending ? 'size-4 animate-spin' : 'size-4'}
            />
            {check.isPending
              ? t('Checking upstream...')
              : t('Check upstream now')}
          </Button>
          {canPrice && (
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => setShowPriceSyncWarning(true)}
            >
              {t('Check price differences')}
            </Button>
          )}
          <Button size='sm' variant='outline' render={<Link to='/channels' />}>
            {t('Review channels')}
          </Button>
        </div>
      </div>
      {check.isError && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Failed to check upstream sources')}
        </p>
      )}
      {query.isError && snapshot && (
        <p role='alert' className='text-warning text-sm'>
          {t('Refresh failed; showing the latest snapshot.')}
        </p>
      )}
      {snapshot && (
        <p className='text-muted-foreground text-xs'>
          {t('Latest snapshot')}:{' '}
          {formatCheckTime(snapshot.checked_at, locale, t('Unknown'))}
          {snapshot.cached === true && <> · {t('Recent cached result')}</>}
        </p>
      )}
      {snapshot?.auto_sync_enabled && snapshot.auto_sync_task && (
        <div className='bg-muted/30 space-y-2 rounded-lg border p-3 text-xs'>
          <p className='font-semibold'>
            {t('Automatic sync')}: {t(snapshot.auto_sync_task.status)} ·{' '}
            {new Date(snapshot.auto_sync_task.updated_at * 1000).toLocaleString(
              locale
            )}
          </p>
          {snapshot.auto_sync_task.error && (
            <p className='text-destructive'>{snapshot.auto_sync_task.error}</p>
          )}
          {snapshot.auto_sync_task.result?.auto_sync && (
            <>
              <p>
                {t('Added')}:{' '}
                {snapshot.auto_sync_task.result.auto_sync.added.length} ·{' '}
                {t('Removed')}:{' '}
                {snapshot.auto_sync_task.result.auto_sync.removed.length} ·{' '}
                {t('Prices updated')}:{' '}
                {snapshot.auto_sync_task.result.auto_sync.repriced.length}
              </p>
              {snapshot.auto_sync_task.result.auto_sync.added.length > 0 && (
                <p className='break-words'>
                  {snapshot.auto_sync_task.result.auto_sync.added.join(', ')}
                </p>
              )}
              {snapshot.auto_sync_task.result.auto_sync.pending.length > 0 && (
                <details>
                  <summary className='cursor-pointer'>
                    {t('Awaiting review')} (
                    {snapshot.auto_sync_task.result.auto_sync.pending.length})
                  </summary>
                  <ul className='mt-2 space-y-1'>
                    {snapshot.auto_sync_task.result.auto_sync.pending.map(
                      (message) => (
                        <li key={message} className='break-words'>
                          {message}
                        </li>
                      )
                    )}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
      <div className='bg-muted/30 space-y-1 rounded-lg border p-3 text-xs'>
        <p className='font-semibold'>
          {t('Current cost assumptions for suggested prices')}
        </p>
        <p className='text-muted-foreground'>
          {t(
            '¥999 buys 11,000 site credits; payment fee 1.8%. YYLX: ¥6.72 per upstream USD, 5% target margin. 2000.run: ¥0.10 per upstream credit, 10% target margin. Jev: ¥7.20 per upstream USD, 5% target margin.'
          )}
        </p>
        {typeof status?.reference_usd_cny === 'number' && (
          <p className='text-muted-foreground'>
            {t('Daily YYLX cost basis', {
              date: status.reference_fx_date,
              rate: status.reference_usd_cny.toFixed(4),
              cost: Math.max(6.72, status.reference_usd_cny).toFixed(4),
            })}
          </p>
        )}
        <p className='text-muted-foreground'>
          {t(
            'Automatic sync supports verified token tiers, caching and image size prices. Unknown quotes and unsupported peak or complex rules stay pending; disabled channels stay disabled.'
          )}
        </p>
      </div>
      {content}
      <ConfirmDialog
        open={showPriceSyncWarning}
        onOpenChange={setShowPriceSyncWarning}
        title={t('Review pricing before continuing')}
        desc={t(
          'The existing price sync dialog can copy upstream quotes and overwrite margin-adjusted site prices. Calculate prices using the current cost assumptions and review every change before applying it.'
        )}
        confirmText={t('Open price comparison')}
        handleConfirm={() => {
          setShowPriceSyncWarning(false)
          setOpen('price-sync')
        }}
      />
    </section>
  )
}
