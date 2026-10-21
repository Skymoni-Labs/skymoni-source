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
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'

import { suggestSiteCreditPrice } from '../lib/upstream-sale-suggestion'
import type { UpstreamMonitorModel } from '../upstream-monitor-api'

function formatMonitorPrice(
  value: number | null | undefined,
  currency: string | null,
  unit: string,
  locale: string | undefined,
  t: TFunction
): string {
  if (value == null || !Number.isFinite(value) || value < 0 || !currency) {
    return t('Unknown')
  }
  const amount = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 10,
  }).format(value)
  return `${currency} ${amount} / ${unit}`
}

function PriceRow(props: { label: string; value: string }) {
  return (
    <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs'>
      <dt className='text-muted-foreground'>{props.label}</dt>
      <dd className='font-medium tabular-nums'>{props.value}</dd>
    </div>
  )
}

function formatSuggestedPrice(
  provider: string,
  value: number | null | undefined,
  unit: string,
  locale: string | undefined,
  siteCredit: string,
  unknown: string,
  referenceUSDToCNY?: number | null
) {
  const suggested = suggestSiteCreditPrice(provider, value, referenceUSDToCNY)
  if (suggested == null) return unknown
  const amount = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 6,
  }).format(suggested)
  return `${amount} ${siteCredit} / ${unit}`
}

export function UpstreamMonitorPrice(props: { model: UpstreamMonitorModel }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const model = props.model
  const raw = model.raw_price
  const known = model.price_status === 'known'
  const price = (value: number | null | undefined, unit: string) =>
    known
      ? formatMonitorPrice(value, model.currency, unit, locale, t)
      : t('Unknown')

  if (model.billing_type === 'request') {
    return (
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='bg-muted/30 rounded-lg border p-3'>
          <h4 className='mb-2 text-xs font-semibold'>{t('Original price')}</h4>
          <dl>
            <PriceRow
              label={t('Per request')}
              value={price(raw.per_request, t('Request'))}
            />
          </dl>
        </div>
        <div className='bg-muted/30 rounded-lg border p-3'>
          <h4 className='mb-2 text-xs font-semibold'>{t('Effective price')}</h4>
          <dl>
            <PriceRow
              label={t('Per request')}
              value={price(raw.effective_per_request, t('Request'))}
            />
          </dl>
        </div>
      </div>
    )
  }

  const isToken = model.billing_type === 'token'
  return (
    <div className='grid gap-3 sm:grid-cols-2'>
      <div className='bg-muted/30 rounded-lg border p-3'>
        <h4 className='mb-2 text-xs font-semibold'>{t('Original price')}</h4>
        <dl className='space-y-1.5'>
          <PriceRow
            label={t('Input')}
            value={price(isToken ? raw.input_per_million : null, '1M tokens')}
          />
          <PriceRow
            label={t('Output')}
            value={price(isToken ? raw.output_per_million : null, '1M tokens')}
          />
          {isToken && raw.cache_read_per_million != null && (
            <PriceRow
              label={t('Cache read')}
              value={price(raw.cache_read_per_million, '1M tokens')}
            />
          )}
          {isToken && raw.cache_write_per_million != null && (
            <PriceRow
              label={t('Cache write')}
              value={price(raw.cache_write_per_million, '1M tokens')}
            />
          )}
          {isToken && raw.cache_write_1h_per_million != null && (
            <PriceRow
              label={t('Cache write 1h')}
              value={price(raw.cache_write_1h_per_million, '1M tokens')}
            />
          )}
        </dl>
      </div>
      <div className='bg-muted/30 rounded-lg border p-3'>
        <h4 className='mb-2 text-xs font-semibold'>{t('Effective price')}</h4>
        <dl className='space-y-1.5'>
          <PriceRow
            label={t('Input')}
            value={price(
              isToken ? raw.effective_input_per_million : null,
              '1M tokens'
            )}
          />
          <PriceRow
            label={t('Output')}
            value={price(
              isToken ? raw.effective_output_per_million : null,
              '1M tokens'
            )}
          />
          {isToken && raw.cache_read_per_million != null && (
            <PriceRow
              label={t('Cache read')}
              value={price(raw.effective_cache_read_per_million, '1M tokens')}
            />
          )}
          {isToken && raw.cache_write_per_million != null && (
            <PriceRow
              label={t('Cache write')}
              value={price(raw.effective_cache_write_per_million, '1M tokens')}
            />
          )}
          {isToken && raw.cache_write_1h_per_million != null && (
            <PriceRow
              label={t('Cache write 1h')}
              value={price(
                raw.effective_cache_write_1h_per_million,
                '1M tokens'
              )}
            />
          )}
        </dl>
      </div>
    </div>
  )
}

export function UpstreamSaleSuggestion(props: {
  model: UpstreamMonitorModel
  provider: string
}) {
  const { t, i18n } = useTranslation()
  const { status } = useStatus()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { model, provider } = props
  const raw = model.raw_price
  const price = (value: number | null | undefined, unit: string) =>
    model.price_status === 'known' && model.currency
      ? formatSuggestedPrice(
          provider,
          value,
          unit,
          locale,
          t('USD site credit'),
          t('Unknown'),
          status?.reference_usd_cny
        )
      : t('Unknown')

  return (
    <div className='bg-primary/5 rounded-lg border p-3'>
      <h4 className='mb-2 text-xs font-semibold'>
        {t('Suggested site price (estimate)')}
      </h4>
      <dl className='space-y-1.5'>
        {model.billing_type === 'request' ? (
          <PriceRow
            label={t('Per request')}
            value={price(raw.effective_per_request, t('Request'))}
          />
        ) : (
          <>
            <PriceRow
              label={t('Input')}
              value={price(raw.effective_input_per_million, '1M tokens')}
            />
            <PriceRow
              label={t('Output')}
              value={price(raw.effective_output_per_million, '1M tokens')}
            />
            {raw.cache_read_per_million != null && (
              <PriceRow
                label={t('Cache read')}
                value={price(raw.effective_cache_read_per_million, '1M tokens')}
              />
            )}
            {raw.cache_write_per_million != null && (
              <PriceRow
                label={t('Cache write')}
                value={price(
                  raw.effective_cache_write_per_million,
                  '1M tokens'
                )}
              />
            )}
            {raw.cache_write_1h_per_million != null && (
              <PriceRow
                label={t('Cache write 1h')}
                value={price(
                  raw.effective_cache_write_1h_per_million,
                  '1M tokens'
                )}
              />
            )}
          </>
        )}
      </dl>
      <p className='text-muted-foreground mt-2 text-xs'>
        {t('Standard-period estimate; tiered and peak prices may differ.')}
      </p>
    </div>
  )
}

export function UpstreamMonitorTiers(props: { model: UpstreamMonitorModel }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const tiers = props.model.tiers ?? []
  if (tiers.length === 0) return null

  const price = (value: number | null | undefined, unit: string) =>
    props.model.price_status === 'known'
      ? formatMonitorPrice(value, props.model.currency, unit, locale, t)
      : t('Unknown')

  return (
    <div className='space-y-2'>
      <h5 className='text-xs font-semibold'>{t('Tiered prices')}</h5>
      <ul className='grid gap-2 lg:grid-cols-2'>
        {tiers.map((tier) => (
          <li
            key={`${tier.label}-${tier.min_tokens ?? ''}-${tier.max_tokens ?? ''}`}
            className='rounded-lg border p-3'
          >
            <p className='mb-2 text-xs font-medium break-words'>{tier.label}</p>
            <dl className='space-y-1.5'>
              {props.model.billing_type === 'request' ? (
                <>
                  <PriceRow
                    label={t('Original price')}
                    value={price(tier.per_request, t('Request'))}
                  />
                  <PriceRow
                    label={t('Effective price')}
                    value={price(tier.effective_per_request, t('Request'))}
                  />
                </>
              ) : (
                <>
                  <PriceRow
                    label={`${t('Original price')} · ${t('Input')}`}
                    value={price(tier.input_per_million, '1M tokens')}
                  />
                  <PriceRow
                    label={`${t('Original price')} · ${t('Output')}`}
                    value={price(tier.output_per_million, '1M tokens')}
                  />
                  {tier.cache_read_per_million != null && (
                    <PriceRow
                      label={`${t('Original price')} · ${t('Cache read')}`}
                      value={price(tier.cache_read_per_million, '1M tokens')}
                    />
                  )}
                  {tier.cache_write_per_million != null && (
                    <PriceRow
                      label={`${t('Original price')} · ${t('Cache write')}`}
                      value={price(tier.cache_write_per_million, '1M tokens')}
                    />
                  )}
                  {tier.cache_write_1h_per_million != null && (
                    <PriceRow
                      label={`${t('Original price')} · ${t('Cache write 1h')}`}
                      value={price(
                        tier.cache_write_1h_per_million,
                        '1M tokens'
                      )}
                    />
                  )}
                  <PriceRow
                    label={`${t('Effective price')} · ${t('Input')}`}
                    value={price(tier.effective_input_per_million, '1M tokens')}
                  />
                  <PriceRow
                    label={`${t('Effective price')} · ${t('Output')}`}
                    value={price(
                      tier.effective_output_per_million,
                      '1M tokens'
                    )}
                  />
                  {tier.cache_read_per_million != null && (
                    <PriceRow
                      label={`${t('Effective price')} · ${t('Cache read')}`}
                      value={price(
                        tier.effective_cache_read_per_million,
                        '1M tokens'
                      )}
                    />
                  )}
                  {tier.cache_write_per_million != null && (
                    <PriceRow
                      label={`${t('Effective price')} · ${t('Cache write')}`}
                      value={price(
                        tier.effective_cache_write_per_million,
                        '1M tokens'
                      )}
                    />
                  )}
                  {tier.cache_write_1h_per_million != null && (
                    <PriceRow
                      label={`${t('Effective price')} · ${t('Cache write 1h')}`}
                      value={price(
                        tier.effective_cache_write_1h_per_million,
                        '1M tokens'
                      )}
                    />
                  )}
                </>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
