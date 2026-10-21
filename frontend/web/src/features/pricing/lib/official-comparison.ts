import type { PricingModel } from '../types'
import { parseTiersFromExpr, type ParsedTier } from './billing-expr'
import { getPricingQuotaType } from './billing-mode'
import { getDisplayGroupRatio } from './model-helpers'

// OpenAI Standard API USD/1M, verified against each model page.
// Local -token-pro suffix denotes a route, not OpenAI's Pro model/service tier.
export const officialPrices: Record<string, [number, number, number?]> = {
  'gpt-6-astra': [10, 50],
  'gpt-6.1-sol': [2, 10, 0.1],
  'gpt-6-sol': [2, 10],
  'gpt-6-luna': [0.1, 0.5],
  'gpt-5.6-sol': [4, 20],
  'gpt-5.6-terra': [2, 12],
  'gpt-5.6-luna': [0.2, 1.2],
  'gpt-5.5': [5, 30],
}

export type ComparisonPlan = {
  price_cny: number
  credit_usd: number
  status: string
}
export function isOfficialComparisonModel(model: PricingModel): boolean {
  return (
    model.model_name.startsWith('gpt-') &&
    !model.model_name.startsWith('gpt-image-') &&
    getPricingQuotaType(model) === 'token'
  )
}

export function getOfficialComparison(
  model: PricingModel,
  plans: ComparisonPlan[],
  cnyPerUSD: number,
  selectedGroup?: string
) {
  const name = model.model_name.replace(/-token(?:-pro)?$/, '')
  const official = officialPrices[name]
  if (!isOfficialComparisonModel(model) || !official) return null
  const rates = plans
    .filter(
      (p) => p.status === 'available' && p.price_cny > 0 && p.credit_usd > 0
    )
    .map((p) => p.price_cny / p.credit_usd / cnyPerUSD)
    .filter((n) => Number.isFinite(n) && n > 0)
  if (!Number.isFinite(cnyPerUSD) || cnyPerUSD <= 0 || !rates.length) {
    return null
  }
  const group = getDisplayGroupRatio(model, selectedGroup)
  const tiers: ParsedTier[] =
    model.billing_mode === 'tiered_expr'
      ? parseTiersFromExpr(model.billing_expr ?? '')
      : [
          {
            label: 'standard',
            conditions: [],
            inputPrice: model.model_ratio * 2,
            outputPrice: model.model_ratio * 2 * model.completion_ratio,
          },
        ]
  // Only compare matching, understood context tiers; don't guess request/time rules.
  if (
    !tiers.length ||
    tiers.length > 2 ||
    (tiers.length === 1 && tiers[0].conditions.length !== 0) ||
    (tiers.length === 2 &&
      (tiers[0].conditions.length !== 1 ||
        tiers[0].conditions[0].op !== '<=' ||
        tiers[1].conditions.length !== 0)) ||
    tiers.some(
      (t) =>
        t.billingUnit === 'request' ||
        t.conditionText ||
        t.conditions.some(
          (c) =>
            c.var !== 'len' || c.value !== 272000 || !['<=', '>'].includes(c.op)
        )
    )
  ) {
    return null
  }
  const rows = tiers.flatMap((tier, tierIndex) => {
    const long = tierIndex === 1
    return (['inputPrice', 'outputPrice'] as const).flatMap((field, index) => {
      const price = tier[field]
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        return []
      }
      const reference =
        (index === 0 ? official[0] : official[1]) * (long ? [2, 1.5][index] : 1)
      const minUSD = price * group * Math.min(...rates)
      const maxUSD = price * group * Math.max(...rates)
      return [
        {
          field,
          long,
          officialUSD: reference,
          minUSD,
          maxUSD,
          minRatio: minUSD / reference,
          maxRatio: maxUSD / reference,
        },
      ]
    })
  })
  if (!rows.length) return null
  return {
    name,
    rows,
    source: `https://developers.openai.com/api/docs/models/${name}`,
  }
}
