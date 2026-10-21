import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'

import type { UpstreamCost } from '../upstream-cost-api'

export function UpstreamCostCell(props: {
  costs?: UpstreamCost[]
  kind: 'price' | 'ratio'
  state?: 'loading' | 'error'
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const value = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n) || n < 0) return t('Unknown')
    // The shared number formatter rounds to 2 places, which loses token prices.
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(n)
  }
  if (props.state) {
    return (
      <span className='text-muted-foreground text-xs'>
        {props.state === 'loading'
          ? t('Loading...')
          : t('Unknown — cost data could not be loaded')}
      </span>
    )
  }
  if (!props.costs?.length) {
    return <span className='text-muted-foreground text-xs'>{t('Unknown')}</span>
  }
  return (
    <div className='space-y-2 py-1 text-xs'>
      {props.costs.map((cost) => (
        <div
          key={`${cost.provider}-${cost.group}-${cost.source}`}
          className='space-y-1'
        >
          <div className='font-medium'>
            {cost.provider}
            {cost.group && ` / ${cost.group}`}
          </div>
          {props.kind === 'ratio' ? (
            <>
              <div>
                {t('Upstream group multiplier')}: {value(cost.group_ratio)}
              </div>
              <div>
                {t('Original model multiplier')}:{' '}
                {cost.model_ratio == null
                  ? t('Not published by upstream')
                  : value(cost.model_ratio)}
              </div>
              <div>
                {t('Original output multiplier')}:{' '}
                {cost.completion_ratio == null
                  ? t('Not published by upstream')
                  : value(cost.completion_ratio)}
              </div>
            </>
          ) : (
            <>
              {cost.request_usd != null ? (
                <div>
                  {t('Original price')}: ${value(cost.request_usd)} /{' '}
                  {t('Request')}
                </div>
              ) : (
                <>
                  <div>
                    {t('Original input price')}:{' '}
                    {value(cost.input_usd_per_million)} USD / 1M tokens
                  </div>
                  <div>
                    {t('Original output price')}:{' '}
                    {value(cost.output_usd_per_million)} USD / 1M tokens
                  </div>
                </>
              )}
              {cost.cache_read_per_million != null && (
                <div>
                  {t('Cache Read')}: ${value(cost.cache_read_per_million)} / 1M
                </div>
              )}
              {cost.cache_write_per_million != null && (
                <div>
                  {t('Cache Write')}: ${value(cost.cache_write_per_million)} /
                  1M
                  {cost.cache_write_1h_per_million != null &&
                    ` (1h $${value(cost.cache_write_1h_per_million)})`}
                </div>
              )}
              {(cost.tiers?.length ?? 0) > 1 &&
                cost.tiers?.map((tier) => (
                  <div
                    key={`${tier.label}-${tier.min_tokens}-${tier.max_tokens}`}
                    className='text-muted-foreground'
                  >
                    {tier.label}:{' '}
                    {tier.per_request != null
                      ? `$${value(tier.per_request)} / ${t('Request')}`
                      : `${t('Input')} $${value(tier.input_per_million)} · ${t('Output')} $${value(tier.output_per_million)} / 1M`}
                  </div>
                ))}
              <div
                className='text-muted-foreground break-words'
                title={cost.source}
              >
                {t('Observed at')}: {cost.observed_at || t('Unknown')}
              </div>
              <div className='text-muted-foreground'>
                {t(
                  'Reference cost before upstream group multiplier; not the sale price.'
                )}
              </div>
            </>
          )}
          {cost.note && (
            <p className='text-muted-foreground max-w-sm'>{cost.note}</p>
          )}
          {cost.source?.startsWith('https://') && (
            <a
              href={cost.source}
              target='_blank'
              rel='noreferrer'
              className='text-primary hover:underline'
            >
              {t('Source')}
            </a>
          )}
        </div>
      ))}
    </div>
  )
}
