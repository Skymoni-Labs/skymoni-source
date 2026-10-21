import { useTranslation } from 'react-i18next'

import { originalSaleModel } from '@/features/model-sales/original-price'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { useReferenceFX } from '../hooks/use-reference-fx'
import { matrixRows } from '../lib/matrix-price'
import { siteCreditUSDValue } from '../lib/standard-quote'
import type { PricingModel } from '../types'
import { SalePrice } from './sale-price'

export function OfficialPriceComparison(props: {
  model: PricingModel
  selectedGroup?: string
}) {
  const { t, i18n } = useTranslation()
  const fx = useReferenceFX()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const rows = matrixRows(
    props.model,
    siteCreditUSDValue(fx.rate),
    props.selectedGroup
  )
  const original = originalSaleModel(props.model)
  const originalRows = original
    ? matrixRows(original, siteCreditUSDValue(fx.rate), props.selectedGroup)
    : []
  const comparable = rows.flatMap((row) => {
    if (
      !row.official ||
      row.input === undefined ||
      row.output === undefined ||
      (row.official.output === 0 && row.output !== 0)
    ) {
      return []
    }
    return [
      {
        label: row.label,
        source: row.official.source,
        inputRatio: row.input / row.official.input,
        outputRatio:
          row.official.output > 0
            ? row.output / row.official.output
            : undefined,
        originalInputRatio:
          originalRows.find((r) => r.label === row.label)?.input === undefined
            ? undefined
            : originalRows.find((r) => r.label === row.label)!.input! /
              row.official.input,
        originalOutputRatio:
          row.official.output <= 0 ||
          originalRows.find((r) => r.label === row.label)?.output === undefined
            ? undefined
            : originalRows.find((r) => r.label === row.label)!.output! /
              row.official.output,
      },
    ]
  })
  if (!comparable.length) {
    return (
      <span className='text-muted-foreground text-xs'>
        {t('Official comparison unavailable')}
      </span>
    )
  }
  const ratios = comparable.flatMap((row) => [
    row.inputRatio,
    ...(row.outputRatio === undefined ? [] : [row.outputRatio]),
  ])
  const uniform = ratios.every((ratio) => Math.abs(ratio - ratios[0]) < 1e-7)
  return (
    <section
      className='bg-muted/40 space-y-1 rounded-md p-2 text-xs'
      aria-label={t('Official multiplier')}
    >
      <a
        href={comparable[0].source}
        target='_blank'
        rel='noreferrer'
        className='font-medium hover:underline'
      >
        {t('Official multiplier')}
      </a>
      {uniform ? (
        <strong className='ml-2'>
          <SalePrice
            kind='multiplier'
            original={
              comparable[0].originalInputRatio === undefined
                ? undefined
                : `${formatNumber(comparable[0].originalInputRatio, locale)}×`
            }
          >
            {formatNumber(ratios[0], locale)}×
          </SalePrice>
        </strong>
      ) : (
        comparable.map((row) => (
          <div key={row.label}>
            {row.label} · {t('Input')}{' '}
            <SalePrice
              kind='multiplier'
              original={
                row.originalInputRatio === undefined
                  ? undefined
                  : `${formatNumber(row.originalInputRatio, locale)}×`
              }
            >
              {formatNumber(row.inputRatio, locale)}×
            </SalePrice>{' '}
            · {t('Output')}{' '}
            <SalePrice
              kind='multiplier'
              original={
                row.originalOutputRatio === undefined
                  ? undefined
                  : `${formatNumber(row.originalOutputRatio, locale)}×`
              }
            >
              {row.outputRatio === undefined
                ? t('Free')
                : `${formatNumber(row.outputRatio, locale)}×`}
            </SalePrice>
          </div>
        ))
      )}
      <p className='text-muted-foreground'>
        {t('Standard quotation excludes recharge promotions')}
      </p>
    </section>
  )
}
