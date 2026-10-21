import { Fragment, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { StaticDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { originalSaleModel } from '@/features/model-sales/original-price'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'

import { useBillingTime } from '../hooks/use-billing-time'
import { usePricingGroupLabel } from '../hooks/use-pricing-group-label'
import { useReferenceFX } from '../hooks/use-reference-fx'
import { matrixRows, type MatrixRow } from '../lib/matrix-price'
import { siteCreditUSDValue } from '../lib/standard-quote'
import { timePricingInfo, timeTierLabel } from '../lib/time-pricing'
import type { PricingModel, PricingVendor } from '../types'
import { SalePrice } from './sale-price'
import { SearchBar } from './search-bar'
import { TimePricingSchedule } from './time-pricing-schedule'

function FilterRow(props: { label: string; children: ReactNode }) {
  return (
    <div className='flex items-start gap-3'>
      <span className='text-muted-foreground w-14 shrink-0 pt-2 text-xs'>
        {props.label}
      </span>
      <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
        {props.children}
      </div>
    </div>
  )
}

export function PricingMatrix(props: {
  models: PricingModel[]
  vendors: PricingVendor[]
  groups: string[]
  vendor: string
  group: string
  onVendor: (v: string) => void
  onGroup: (v: string) => void
  search: string
  onSearch: (v: string) => void
  onClear: () => void
  onModelClick: (v: string) => void
  personalGroups?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const groupLabel = usePricingGroupLabel()
  const fx = useReferenceFX()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [discount, setDiscount] = useState('all')
  const clockExpression = props.models.find((model) =>
    timePricingInfo(model.billing_expr)
  )?.billing_expr
  const billingTime = useBillingTime(clockExpression)
  const now = billingTime === undefined ? new Date() : new Date(billingTime)
  // Recharge bonuses do not change this standard quotation table.
  const factor = siteCreditUSDValue(fx.rate)
  const money = (n?: number) =>
    n === undefined || !Number.isFinite(n)
      ? t('Unknown')
      : `$${new Intl.NumberFormat(locale, {
          maximumFractionDigits: 4,
          minimumFractionDigits: 2,
        }).format(n)}`
  const priceCompare = (value?: number, original?: number) => (
    <span className='inline-flex flex-wrap items-baseline gap-x-2'>
      {original !== undefined && Number.isFinite(original) && (
        <del className='text-muted-foreground text-[11px] font-normal'>
          {money(original)}
        </del>
      )}
      <span
        className={original !== undefined ? 'font-semibold text-sky-500' : ''}
      >
        {money(value)}
      </span>
    </span>
  )
  const rows = props.models.map((model) => {
    const values = matrixRows(model, factor, props.group)
    const originalModel = originalSaleModel(model)
    const ratios = values.flatMap((price) => {
      if (
        !price.official ||
        price.unit !== 'token' ||
        price.input === undefined ||
        price.output === undefined
      ) {
        return []
      }
      return [
        price.input / price.official.input,
        ...(price.official.output > 0
          ? [price.output / price.official.output]
          : []),
      ]
    })
    const uniformMultiplier =
      values.every(
        (price) =>
          price.official &&
          price.input !== undefined &&
          price.output !== undefined &&
          (price.official.output > 0 || price.output === 0)
      ) &&
      ratios.length > 0 &&
      ratios.every(
        (ratio) => Number.isFinite(ratio) && Math.abs(ratio - ratios[0]) < 1e-7
      )
        ? ratios[0]
        : undefined
    return {
      model,
      timePricing: timePricingInfo(model.billing_expr, now),
      uniformMultiplier,
      originalPrices: originalModel
        ? matrixRows(originalModel, factor, props.group)
        : [],
      prices: values.length ? values : [{ label: '', unit: 'other' as const }],
    }
  })
  const multiplier = (price: MatrixRow) =>
    price.unit === 'token' && price.official && price.input !== undefined
      ? (price.input / price.official.input).toFixed(2)
      : undefined
  const discounts = [
    ...new Set(
      rows.flatMap((row) =>
        row.prices.map(multiplier).filter((v): v is string => v !== undefined)
      )
    ),
  ].sort((a, b) => Number(a) - Number(b))
  const filtered = rows.filter(
    (row) =>
      discount === 'all' ||
      row.prices.some((price) => multiplier(price) === discount)
  )
  const sections = new Map<
    string,
    { name: string; vendor: string; icon: string; rows: typeof rows }
  >()
  for (const row of filtered) {
    let business =
      props.group !== 'all'
        ? props.group
        : row.model.enable_groups.find((group) =>
            props.groups.includes(group)
          ) || 'metered'
    if (
      props.group === 'all' &&
      row.model.enable_groups.includes('moni-gpt-017')
    ) {
      business = 'moni-gpt-017'
    } else if (
      props.group === 'all' &&
      row.model.enable_groups.includes('typesafe')
    ) {
      business = 'typesafe'
    } else if (
      props.group === 'all' &&
      row.model.enable_groups.includes('per-request')
    ) {
      business = 'per-request'
    }
    const vendor = row.model.vendor_name || t('Unknown')
    const key = `${business}-${vendor}`
    const section = sections.get(key) ?? {
      name: groupLabel(business),
      vendor,
      icon: row.model.vendor_icon || '',
      rows: [],
    }
    section.rows.push(row)
    sections.set(key, section)
  }
  const tones = (vendor: string) => {
    if (/anthropic|claude/i.test(vendor)) {
      return {
        border: 'border-orange-200 dark:border-orange-900',
        fill: 'bg-orange-50/70 dark:bg-orange-950/20',
        text: 'text-orange-600',
        button:
          'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300',
      }
    }
    if (/google|gemini/i.test(vendor)) {
      return {
        border: 'border-blue-200 dark:border-blue-900',
        fill: 'bg-blue-50/60 dark:bg-blue-950/20',
        text: 'text-blue-600',
        button:
          'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300',
      }
    }
    if (/typesafe/i.test(vendor)) {
      return {
        border: 'border-violet-200 dark:border-violet-900',
        fill: 'bg-violet-50/60 dark:bg-violet-950/20',
        text: 'text-violet-600',
        button:
          'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300',
      }
    }
    return {
      border: 'border-emerald-200 dark:border-emerald-900',
      fill: 'bg-emerald-50/60 dark:bg-emerald-950/20',
      text: 'text-emerald-600',
      button:
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
    }
  }
  const chip = 'h-8 rounded-md px-3 text-xs shadow-none'
  const activeChip = `${chip} bg-teal-600 text-white hover:bg-teal-700`
  const unitLabel = (unit: MatrixRow['unit']) => {
    if (unit === 'request') return t('Per Request')
    if (unit === 'image') return t('Per image')
    return t('See details for pricing')
  }
  const cache = (
    price: Pick<MatrixRow, 'read' | 'write' | 'write1h'>,
    modelName: string,
    original?: MatrixRow
  ) => (
    <div className='space-y-0.5 text-[11px] leading-4 whitespace-nowrap'>
      <div>
        <span className='text-muted-foreground mr-2'>{t('Cache Write')}</span>
        <span className='font-mono'>
          {price.write === undefined &&
          [
            'gpt-5.5-token',
            'gpt-5.5',
            'gemini-3.8-flash-token',
            'deepseek-flash',
            'deepseek-flash-low',
            'deepseek-v4-pro',
            'glm-5.3',
            'glm-5.3-flash',
            'minimax-m3',
          ].includes(modelName)
            ? t('Not separately priced')
            : priceCompare(price.write, original?.write)}
          {price.write1h !== undefined && (
            <>
              {' (1h '}
              {priceCompare(price.write1h, original?.write1h)}
              {')'}
            </>
          )}
        </span>
      </div>
      <div>
        <span className='text-muted-foreground mr-2'>{t('Cache Read')}</span>
        <span className='font-mono'>
          {priceCompare(price.read, original?.read)}
        </span>
      </div>
    </div>
  )
  const officialMultiplier = (
    price: MatrixRow,
    uniformMultiplier?: number,
    original?: MatrixRow
  ): ReactNode => {
    if (price.unit === 'request' && price.official) {
      return t('Different billing units')
    }
    if (
      price.unit !== 'token' ||
      !price.official ||
      price.input === undefined
    ) {
      return '—'
    }
    return (
      <a
        href={price.official.source}
        target='_blank'
        rel='noreferrer'
        className='whitespace-nowrap underline-offset-2 hover:underline'
      >
        {uniformMultiplier !== undefined ? (
          <SalePrice
            kind='multiplier'
            original={
              original?.input === undefined
                ? undefined
                : `${formatNumber(original.input / price.official.input, locale)}×`
            }
          >
            {formatNumber(uniformMultiplier, locale)}×
          </SalePrice>
        ) : (
          <>
            {t('Input')}{' '}
            <SalePrice
              kind='multiplier'
              original={
                original?.input === undefined
                  ? undefined
                  : `${formatNumber(original.input / price.official.input, locale)}×`
              }
            >
              {formatNumber(price.input / price.official.input, locale)}×
            </SalePrice>
            <br />
            {t('Output')}{' '}
            {price.output === undefined || price.official.output <= 0 ? (
              '—'
            ) : (
              <SalePrice
                kind='multiplier'
                original={
                  original?.output === undefined
                    ? undefined
                    : `${formatNumber(original.output / price.official.output, locale)}×`
                }
              >
                {formatNumber(price.output / price.official.output, locale)}×
              </SalePrice>
            )}
          </>
        )}
      </a>
    )
  }
  return (
    <div className='space-y-5'>
      <div className='bg-background/90 text-muted-foreground rounded-2xl border px-5 py-4 text-xs shadow-sm'>
        {t('Standard real USD notice')}
      </div>
      <div className='space-y-2' aria-label={t('Model filters')}>
        <FilterRow label={t('Provider')}>
          {[
            { id: 'all', name: t('All'), icon: '' },
            ...props.vendors.map((v) => ({ ...v, id: String(v.id) })),
          ].map((v) => (
            <Button
              key={v.id}
              size='sm'
              variant={props.vendor === v.id ? 'default' : 'outline'}
              className={
                props.vendor === v.id
                  ? activeChip
                  : `${chip} ${tones(v.name).button}`
              }
              aria-pressed={props.vendor === v.id}
              onClick={() => {
                props.onVendor(v.id)
                setDiscount('all')
              }}
            >
              {v.icon && getLobeIcon(v.icon, 14)}
              {v.name}
            </Button>
          ))}
        </FilterRow>
        <FilterRow label={t('Groups')}>
          {['all', ...props.groups].map((g) => (
            <Button
              key={g}
              size='sm'
              variant={props.group === g ? 'default' : 'outline'}
              className={
                props.group === g ? activeChip : `${chip} bg-background/70`
              }
              aria-pressed={props.group === g}
              onClick={() => {
                props.onGroup(g)
                setDiscount('all')
              }}
            >
              {g === 'all' ? t('All') : groupLabel(g)}
            </Button>
          ))}
        </FilterRow>
        <FilterRow label={t('Official multiplier')}>
          {[
            ['all', t('All')],
            ...discounts.map((value) => [
              value,
              `${formatNumber(Number(value), locale)}×`,
            ]),
          ].map(([id, label]) => (
            <Button
              key={id}
              size='sm'
              variant={discount === id ? 'default' : 'outline'}
              className={
                discount === id ? activeChip : `${chip} bg-background/70`
              }
              aria-pressed={discount === id}
              onClick={() => setDiscount(id)}
            >
              {label}
            </Button>
          ))}
        </FilterRow>

        <FilterRow label={t('Model')}>
          <SearchBar
            value={props.search}
            onChange={props.onSearch}
            onClear={props.onClear}
            className='w-full max-w-xs [&_input]:h-8 [&_input]:rounded-md'
          />
        </FilterRow>
        {props.personalGroups}
      </div>
      {!filtered.length && (
        <div className='bg-background text-muted-foreground rounded-xl border p-10 text-center text-sm'>
          {t('No models match your current filters.')}
        </div>
      )}
      {[...sections.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, section]) => {
          const tone = tones(section.vendor)
          const timeModels = [
            ...new Map(
              section.rows
                .filter((row) => row.timePricing)
                .map((row) => [
                  JSON.stringify([
                    row.timePricing?.condition,
                    row.timePricing?.exclusions,
                  ]),
                  row.model,
                ])
            ).values(),
          ]
          const mobileTimeCards = section.rows.every(
            (row) =>
              row.timePricing &&
              row.prices.every((price) => price.unit === 'token')
          )
          return (
            <section
              key={key}
              className={`bg-background overflow-hidden rounded-[16px] border ${tone.border}`}
            >
              <div className='space-y-2 border-b px-5 py-4'>
                <h2
                  className={`inline-flex items-center gap-2 rounded px-2 py-1 text-xs font-medium ${tone.fill} ${tone.text}`}
                >
                  {getLobeIcon(section.icon, 14)}
                  {section.vendor} · {section.name}
                </h2>
                <p className='text-muted-foreground text-xs'>
                  {t('Matrix official note')}
                </p>
                {timeModels.map((model) => (
                  <TimePricingSchedule
                    key={model.model_name}
                    expression={model.billing_expr}
                  />
                ))}
              </div>
              {mobileTimeCards && (
                <div className='space-y-3 p-3 md:hidden'>
                  {section.rows.map(
                    ({
                      model,
                      prices,
                      originalPrices,
                      timePricing,
                      uniformMultiplier,
                    }) => (
                      <article
                        key={model.model_name}
                        className='overflow-hidden rounded-xl border'
                      >
                        <div className='bg-muted/30 flex items-center gap-2 px-3 py-2.5'>
                          {getLobeIcon(
                            model.icon || model.vendor_icon || '',
                            16
                          )}
                          <button
                            type='button'
                            className='min-w-0 flex-1 text-left font-mono text-xs font-semibold break-all'
                            onClick={() => props.onModelClick(model.model_name)}
                          >
                            {model.model_name}
                          </button>
                          <CopyButton value={model.model_name} />
                        </div>
                        <div className='px-3 py-2'>
                          <div className='text-muted-foreground mb-2 flex items-center justify-between text-[10px]'>
                            <span>$ / 1M Token</span>
                            {uniformMultiplier !== undefined && (
                              <span>
                                {t('Official multiplier')}{' '}
                                <SalePrice
                                  kind='multiplier'
                                  original={
                                    originalPrices[0]?.input === undefined ||
                                    !prices[0].official
                                      ? undefined
                                      : `${formatNumber(originalPrices[0].input / prices[0].official.input, locale)}×`
                                  }
                                >
                                  {formatNumber(uniformMultiplier, locale)}×
                                </SalePrice>
                              </span>
                            )}
                          </div>
                          <table
                            className='w-full table-fixed text-[11px]'
                            aria-label={`${model.model_name} ${t('Time-based prices')}`}
                          >
                            <thead>
                              <tr className='text-muted-foreground'>
                                <th className='w-[30%] pb-1 text-left font-normal'>
                                  {t('Period')}
                                </th>
                                {['Input', 'Output', 'Cache Read'].map(
                                  (label) => (
                                    <th
                                      key={label}
                                      className='pb-1 text-right font-normal'
                                    >
                                      {t(label)}
                                    </th>
                                  )
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {prices.map((price) => {
                                const current =
                                  price.label === timePricing?.currentLabel
                                const original = originalPrices.find(
                                  (row) => row.label === price.label
                                )
                                return (
                                  <tr
                                    key={price.label}
                                    className={current ? 'bg-sky-500/5' : ''}
                                  >
                                    <th className='py-2 text-left font-normal'>
                                      {t(timeTierLabel(price.label))}
                                      {current && (
                                        <span className='mt-0.5 block text-[10px] text-sky-500'>
                                          {t('Current period')}
                                        </span>
                                      )}
                                    </th>
                                    <td className='text-right font-mono'>
                                      {priceCompare(
                                        price.input,
                                        original?.input
                                      )}
                                    </td>
                                    <td className='text-right font-mono'>
                                      {priceCompare(
                                        price.output,
                                        original?.output
                                      )}
                                    </td>
                                    <td className='text-right font-mono'>
                                      {priceCompare(price.read, original?.read)}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          <button
                            type='button'
                            className='mt-2 text-[11px] text-sky-500'
                            onClick={() => props.onModelClick(model.model_name)}
                          >
                            {t('View pricing details')} →
                          </button>
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
              <StaticDataTable
                className={`rounded-none border-0 ${mobileTimeCards ? 'hidden md:block' : ''}`}
                tableClassName='min-w-[1180px] table-fixed text-xs [&_th]:px-3 [&_th]:text-xs [&_td]:px-3 [&_tr]:border-slate-100 dark:[&_tr]:border-slate-800'
                tableProps={{
                  normalizeTypography: false,
                  'aria-label': `${section.vendor} ${section.name}`,
                }}
              >
                <colgroup>
                  {[25, 11, 9, 14, 11, 8, 14, 8].map((width, index) => (
                    <col
                      key={
                        [
                          'model',
                          'input',
                          'output',
                          'cache',
                          'official-input',
                          'official-output',
                          'official-cache',
                          'multiplier',
                        ][index]
                      }
                      style={{ width: `${width}%` }}
                    />
                  ))}
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className='pl-5!'>
                      {t('Model')}
                    </TableHead>
                    <TableHead
                      colSpan={3}
                      className={`text-center ${tone.fill} ${tone.text}`}
                    >
                      {t('Standard real USD price')} · $ / 1M Token
                    </TableHead>
                    <TableHead
                      colSpan={3}
                      className='text-muted-foreground text-center'
                    >
                      {t('Official price')} · $ / 1M Token
                    </TableHead>
                    <TableHead rowSpan={2} className='text-right'>
                      {t('Official multiplier')}
                    </TableHead>
                  </TableRow>
                  <TableRow>
                    {[
                      'Input',
                      'Output',
                      'Cached',
                      'Input',
                      'Output',
                      'Cached',
                    ].map((label, i) => (
                      <TableHead
                        key={`${i < 3 ? 'actual' : 'official'}-${label}`}
                        className={`text-muted-foreground h-8 text-xs ${i < 3 ? tone.fill : ''}`}
                      >
                        {t(label)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className='[&>tr]:h-[55px]'>
                  {section.rows
                    .sort((a, b) =>
                      a.model.model_name.localeCompare(b.model.model_name)
                    )
                    .map(
                      ({
                        model,
                        prices,
                        uniformMultiplier,
                        originalPrices,
                        timePricing,
                      }) => (
                        <Fragment key={model.model_name}>
                          {prices.map((price, index) => {
                            const original = originalPrices.find(
                              (row) =>
                                row.label === price.label &&
                                row.unit === price.unit
                            )
                            return (
                              <TableRow
                                key={`${model.model_name}-${price.label}-${price.input}-${price.output}`}
                                className={`${prices.length > 1 ? 'h-[42px]!' : ''} ${index < prices.length - 1 ? 'border-b-0' : ''}`}
                              >
                                {index === 0 && (
                                  <TableCell
                                    rowSpan={prices.length}
                                    className='py-2 pl-5! align-middle'
                                  >
                                    <div className='flex items-center gap-2'>
                                      {getLobeIcon(
                                        model.icon || model.vendor_icon || '',
                                        16
                                      )}
                                      <Button
                                        variant='link'
                                        className='text-foreground h-auto p-0 text-left text-sm font-normal'
                                        onClick={() =>
                                          props.onModelClick(model.model_name)
                                        }
                                      >
                                        {model.model_name}
                                      </Button>
                                      <CopyButton value={model.model_name} />
                                    </div>
                                    {model.promotion && (
                                      <a
                                        href={`/model-offers/${model.promotion.id}`}
                                        className='mt-1 inline-block rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-500'
                                      >
                                        {model.promotion.request_price_cny
                                          ? `优惠 ¥${model.promotion.request_price_cny.toFixed(4)}/次`
                                          : `${model.promotion.pricing_basis === 'official' ? '官方倍率' : '优惠倍率'} ${(model.promotion.multiplier ?? 1 - model.promotion.discount_percent / 100).toFixed(3)}×`}
                                      </a>
                                    )}
                                    {price.unit !== 'token' && (
                                      <div className='text-muted-foreground mt-1 text-xs'>
                                        {unitLabel(price.unit)}
                                      </div>
                                    )}
                                  </TableCell>
                                )}
                                <TableCell
                                  className={`${tone.fill} py-2 font-mono font-semibold`}
                                >
                                  <span
                                    className={`text-muted-foreground font-sans text-[11px] font-normal ${timePricing ? 'mb-0.5 block' : 'mr-2'}`}
                                  >
                                    {timePricing
                                      ? t(timeTierLabel(price.label))
                                      : price.label}
                                  </span>
                                  {priceCompare(price.input, original?.input)}
                                  {timePricing?.currentLabel ===
                                    price.label && (
                                    <span className='ml-1 inline-block rounded-full bg-sky-500/10 px-1 py-0.5 font-sans text-[9px] font-medium text-sky-500'>
                                      {t('Current period')}
                                    </span>
                                  )}
                                  {price.unit === 'request' &&
                                    ` / ${t('request')}`}
                                  {price.unit === 'image' && ` / ${t('image')}`}
                                </TableCell>
                                <TableCell
                                  className={`${tone.fill} py-2 font-mono font-semibold`}
                                >
                                  {price.unit === 'token'
                                    ? priceCompare(
                                        price.output,
                                        original?.output
                                      )
                                    : '—'}
                                </TableCell>
                                <TableCell className={`${tone.fill} py-2`}>
                                  {price.unit === 'token'
                                    ? cache(price, model.model_name, original)
                                    : '—'}
                                </TableCell>
                                <TableCell className='text-muted-foreground py-2 font-mono text-[11px]'>
                                  {price.official && (
                                    <span className='mr-2 font-sans text-[11px]'>
                                      {timePricing
                                        ? t(timeTierLabel(price.label))
                                        : price.label}
                                    </span>
                                  )}
                                  {money(price.official?.input)}
                                </TableCell>
                                <TableCell className='text-muted-foreground py-2 font-mono text-[11px]'>
                                  {money(price.official?.output)}
                                </TableCell>
                                <TableCell className='py-2'>
                                  {price.official
                                    ? cache(price.official, model.model_name)
                                    : t('Unknown')}
                                </TableCell>
                                {(uniformMultiplier === undefined ||
                                  index === 0) && (
                                  <TableCell
                                    rowSpan={
                                      uniformMultiplier === undefined
                                        ? 1
                                        : prices.length
                                    }
                                    className='py-2 text-right font-mono text-[11px]'
                                  >
                                    {officialMultiplier(
                                      price,
                                      uniformMultiplier,
                                      original
                                    )}
                                  </TableCell>
                                )}
                              </TableRow>
                            )
                          })}
                        </Fragment>
                      )
                    )}
                </TableBody>
              </StaticDataTable>
            </section>
          )
        })}
    </div>
  )
}
