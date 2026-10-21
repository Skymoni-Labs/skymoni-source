import { matrixRows } from '@/features/pricing/lib/matrix-price'
import { compileBillingExpression } from '@/features/pricing/lib/billing-expression/parser'
import { expressionDependencies } from '@/features/pricing/lib/billing-expression/types'
import { timePricingInfo } from '@/features/pricing/lib/time-pricing'
import type { PricingModel } from '@/features/pricing/types'

import type { PublicSale } from './api'
import { originalSaleModel } from './original-price'

export const publicSaleModelName = (name: string) =>
  name === 'deepseek-flash' ? 'deepseek-v4.1-flash' : name

export interface PromotionRate {
  label: string
  original?: number
  target: number
  unit: 'multiplier' | 'request'
}
export interface PromotionDetail {
  title: string
  models: string[]
  rates: PromotionRate[]
  schedule:
    | (NonNullable<ReturnType<typeof timePricingInfo>> & { daily: boolean })
    | null
  endAt: number
  pending: boolean
}
const rounded = (value: number) => Number(value.toFixed(4))
const family = (name: string) =>
  name.startsWith('gpt-')
    ? 'GPT Token'
    : name.startsWith('grok-')
      ? 'Grok Token'
      : name === 'deepseek-v4-pro'
        ? 'DeepSeek Pro'
        : name === 'deepseek-v4.1-flash-low'
          ? 'DeepSeek Flash Low'
          : name === 'deepseek-v4.1-flash'
            ? 'DeepSeek Flash'
            : name

// Use the public settlement expression and the stored pre-sale snapshot. Never
// infer either a price or peak hours from the activity title or the model name.
export function promotionDetails(
  sales: PublicSale[],
  catalog: PricingModel[],
  usdPerCredit: number,
  cnyPerUSD: number
): PromotionDetail[] {
  const groups = new Map<string, PromotionDetail>()
  const seen = new Set<string>()
  for (const sale of sales) {
    for (const name of sale.models.map(publicSaleModelName)) {
      if (seen.has(name)) continue
      seen.add(name)
      const model = catalog.find((item) => item.model_name === name)
      const matching = model?.promotion?.id === sale.id
      const ready = model && (sale.status !== 'active' || matching)
      const original = matching ? originalSaleModel(model!) : model
      const rows = ready ? matrixRows(model!, usdPerCredit) : []
      const oldRows = original ? matrixRows(original, usdPerCredit) : []
      const timeInfo = ready ? timePricingInfo(model!.billing_expr) : null
      const condition = timeInfo && compileBillingExpression(timeInfo.condition)
      const schedule =
        timeInfo && condition?.status === 'ready'
          ? {
              ...timeInfo,
              daily: [...expressionDependencies(condition.ast).functions].every(
                (fn) => fn === 'hour' || fn === 'minute'
              ),
            }
          : null
      // The peak row's official price is itself doubled. Use one ordinary
      // official base for both rows so 0.10 / 0.20 is an honest comparison.
      const base = schedule
        ? rows.find((row) => row.label === 'off_peak')?.official
        : undefined
      const rates = rows.flatMap((row): PromotionRate[] => {
        const previous = oldRows.find((old) => old.label === row.label)
        const label =
          row.label === 'off_peak'
            ? '普通时段'
            : row.label === 'peak'
              ? '高峰时段'
              : row.label
        if (row.unit === 'request' && row.input !== undefined && matching) {
          return [
            {
              label: label || '每次调用',
              original:
                previous?.input === undefined
                  ? undefined
                  : rounded(previous.input * cnyPerUSD),
              target: rounded(row.input * cnyPerUSD),
              unit: 'request',
            },
          ]
        }
        if (row.unit !== 'token' || !row.official) return []
        const official = base ?? row.official
        const fields = ['input', 'output', 'read', 'write', 'write1h'] as const
        const comparable = fields.flatMap((field) => {
          const reference = official[field]
          const current = row[field]
          if (!reference || current === undefined) return []
          const originalValue = previous?.[field]
          const planned = sale.model_multipliers?.[name]
          return [
            {
              field,
              original:
                originalValue === undefined
                  ? undefined
                  : rounded(originalValue / reference),
              target: rounded(
                matching
                  ? current / reference
                  : planned === undefined
                    ? (current / reference) * (1 - sale.discount_percent / 100)
                    : (planned * row.official![field]!) / reference
              ),
            },
          ]
        })
        if (!comparable.length) return []
        const uniform = comparable.every(
          (item) =>
            item.original === comparable[0].original &&
            item.target === comparable[0].target
        )
        if (uniform) return [{ label, ...comparable[0], unit: 'multiplier' }]
        return comparable.map((item) => ({
          ...item,
          label: `${label ? label + ' · ' : ''}${{ input: '输入', output: '输出', read: '缓存读取', write: '缓存写入', write1h: '1h 缓存写入' }[item.field]}`,
          unit: 'multiplier',
        }))
      })
      if (schedule)
        rates.sort(
          (a, b) =>
            Number(a.label.startsWith('高峰')) -
            Number(b.label.startsWith('高峰'))
        )
      // Context tiers with identical multipliers are one offer, not two rows.
      const uniformRows =
        !schedule &&
        rates.length > 0 &&
        rates.every(
          (rate) =>
            rate.unit === rates[0].unit &&
            rate.original === rates[0].original &&
            rate.target === rates[0].target
        )
      const displayRates = uniformRows
        ? [
            {
              ...rates[0],
              label: rates[0].unit === 'request' ? '每次调用' : '官方倍率',
            },
          ]
        : rates
      const title = family(name)
      const key = JSON.stringify([
        title,
        displayRates,
        schedule?.condition,
        schedule?.exclusions,
        sale.end_at,
        sale.status,
      ])
      const group = groups.get(key)
      if (group) group.models.push(name)
      else
        groups.set(key, {
          title,
          models: [name],
          rates: displayRates,
          schedule,
          endAt: sale.end_at,
          pending: !ready || !displayRates.length,
        })
    }
  }
  return [...groups.values()]
}
