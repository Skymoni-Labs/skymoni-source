import domesticPolicy from '../../../../moni/domestic-official-pricing.json'
import type { PricingModel } from '../types'
import {
  getDynamicPriceEntries,
  getDynamicPricingTiers,
  getDynamicPricingSummary,
} from './dynamic-price'
import { getDisplayGroupRatio } from './model-helpers'
import { officialPrices } from './official-comparison'

type DomesticReference = {
  currency: string
  kind: string
  source: string
  tiers: Record<
    string,
    { p: number; c: number; cr: number; cc?: number; cc1h?: number }
  >
}
const domesticPrices: Record<string, DomesticReference> = domesticPolicy.models

// USD/1M; Claude 5.5 verified 2026-10-07: https://platform.claude.com/docs/en/about-claude/pricing
const claudePrices: Record<string, [number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-opus-5': [5, 25, 0.5],
  'claude-opus-4-8': [5, 25, 0.5],
  'claude-opus-4-7': [5, 25, 0.5],
  'claude-opus-4-6': [5, 25, 0.5],
  'claude-opus-4-5': [5, 25, 0.5],
  'claude-sonnet-5': [2, 10, 0.2],
  'claude-sonnet-5-5': [2, 10, 0.2],
  'claude-sonnet-4-6': [3, 15, 0.3],
  'claude-haiku-4-5': [1, 5, 0.1],
  'claude-fable-5': [10, 50, 1],
  'claude-fable-5-1': [10, 50, 0.25],
}
export type MatrixRow = {
  label: string
  unit: 'token' | 'request' | 'image' | 'other'
  input?: number
  output?: number
  read?: number
  write?: number
  write1h?: number
  official?: {
    input: number
    output: number
    read?: number
    write?: number
    write1h?: number
    source: string
  }
}

export function matrixRows(
  model: PricingModel,
  usdPerCredit: number,
  group?: string
): MatrixRow[] {
  if (getDynamicPricingSummary(model, { tokenUnit: 'M' })?.hasRequestRules) {
    return []
  }
  const ratio = getDisplayGroupRatio(model, group)
  const factor = usdPerCredit * ratio
  const convert = (value: unknown) =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isFinite(factor) &&
    factor >= 0
      ? value * factor
      : undefined
  const name = model.model_name
    .replace(/-token(?:-pro|-api)?$/, '')
    .replace(/-\d{8}$/, '')
  const officialName = name === 'gpt-5.6' ? 'gpt-5.6-sol' : name
  const openai = officialPrices[officialName]
  const claude = claudePrices[name]
  const tiers = getDynamicPricingTiers(model)
  if (!tiers.length) {
    if (
      model.billing_mode === 'tiered_expr' ||
      model.billing_usage_schema ||
      model.billing_plugin_variants?.length
    ) {
      return []
    }
    return [
      {
        label: '',
        unit: model.quota_type === 1 ? 'request' : 'token',
        input: convert(
          model.quota_type === 1 ? model.model_price : model.model_ratio * 2
        ),
        output:
          model.quota_type === 1
            ? undefined
            : convert(model.model_ratio * 2 * model.completion_ratio),
      },
    ]
  }
  return tiers.map((tier, index) => {
    const entries = getDynamicPriceEntries(tier, {
      tokenUnit: 'M',
      usageSchema: model.billing_usage_schema,
    })
    const value = (field: string) =>
      convert(entries.find((entry) => entry.field === field)?.value)
    const token =
      entries.length > 0 && entries.every((entry) => entry.unit === 'token')
    if (
      entries.some((entry) => entry.field === 'constant') ||
      (!token && entries.length !== 1)
    ) {
      return { label: tier.label, unit: 'other' as const }
    }
    const unit = token ? 'token' : entries[0]?.unit
    const first = tiers[0].conditions[0]
    let contextThreshold = 272000
    const grok = ['grok-4.5', 'grok-4.6', 'grok-4.7'].includes(name)
    if (grok) contextThreshold = 199999
    if (name === 'minimax-m3') contextThreshold = 512000
    const hasContextTiers =
      tiers.length === 2 &&
      first &&
      'var' in first &&
      first.var === 'len' &&
      first.op === '<=' &&
      first.value === contextThreshold &&
      tiers[0].conditions.length === 1 &&
      tiers[1].conditions.length === 0
    const long = hasContextTiers && index === 1
    const row: MatrixRow = {
      label: tiers.length === 1 ? '' : tier.label,
      unit:
        unit === 'token' || unit === 'request' || unit === 'image'
          ? unit
          : 'other',
      input:
        value('inputPrice') ?? value('input_tokens') ?? value('fixedPrice'),
      output: value('outputPrice') ?? value('output_tokens'),
      read: value('cacheReadPrice'),
      write: value('cacheCreatePrice'),
      write1h: value('cacheCreate1hPrice'),
    }
    const domestic = domesticPrices[name]
    // Match the reviewed tier structure, including low aliases and source currency.
    // Never attach a reference to an unrecognised administrator custom tier.
    if (
      domestic &&
      token &&
      ((domestic.kind === 'peak' &&
        tiers.length === 2 &&
        tiers[0].label === 'peak' &&
        tiers[1].label === 'off_peak') ||
        (domestic.kind === 'context' && hasContextTiers) ||
        (domestic.kind === 'flat' &&
          tiers.length === 1 &&
          tier.conditions.length === 0 &&
          !tier.conditionText))
    ) {
      const reference = domestic.tiers[tier.label]
      const toUSD =
        domestic.currency === 'CNY'
          ? usdPerCredit / domesticPolicy.cny_per_credit
          : 1
      if (reference && Number.isFinite(toUSD) && toUSD > 0) {
        row.official = {
          input: reference.p * toUSD,
          output: reference.c * toUSD,
          read: reference.cr * toUSD,
          write: reference.cc === undefined ? undefined : reference.cc * toUSD,
          write1h:
            reference.cc1h === undefined ? undefined : reference.cc1h * toUSD,
          source: domestic.source,
        }
      }
    }
    if (unit === 'request' && openai && tiers.length === 1) {
      row.official = {
        input: openai[0],
        output: openai[1],
        read: openai[2] ?? openai[0] / 10,
        write: officialName === 'gpt-5.5' ? undefined : openai[0] * 1.25,
        source: `https://developers.openai.com/api/docs/models/${officialName}`,
      }
    }
    if (hasContextTiers) {
      row.label = long ? '>272K' : '≤272K'
      if (grok) row.label = long ? '≥200K' : '<200K'
      if (name === 'minimax-m3') row.label = long ? '>512K' : '≤512K'
    }
    if (
      token &&
      !tier.conditionText &&
      (hasContextTiers || (tiers.length === 1 && tier.conditions.length === 0))
    ) {
      if (['jev-latest', 'jev-preview', 'jev-1.13.0'].includes(name)) {
        row.official = {
          input: 0.042,
          output: 0,
          source:
            'https://typesafe.ai/blog/introducing-system-one-models-and-jev',
        }
      } else if (openai) {
        const input = openai[0] * (long ? 2 : 1)
        row.official = {
          input,
          output: openai[1] * (long ? 1.5 : 1),
          read: (openai[2] ?? openai[0] / 10) * (long ? 2 : 1),
          write: name === 'gpt-5.5' ? undefined : input * 1.25,
          source: `https://developers.openai.com/api/docs/models/${officialName}`,
        }
      } else if (name === 'gemini-3.8-flash' && tiers.length === 1) {
        // Standard introductory prices through 2026-12-31, verified 2026-10-08.
        // Google bills explicit-cache storage by time, not cache-write tokens.
        row.official = {
          input: 0.75,
          output: 3.75,
          read: 0.075,
          source:
            'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash',
        }
      } else if (grok && hasContextTiers) {
        // xAI standard pricing, verified 2026-10-08; long context starts at 200K.
        const cacheRead = name === 'grok-4.5' ? 0.3 : 0.5
        row.official = {
          input: long ? 4 : 2,
          output: long ? 12 : 6,
          read: cacheRead * (long ? 2 : 1),
          source: 'https://docs.x.ai/developers/pricing',
        }
      } else if (claude && tiers.length === 1) {
        row.official = {
          input: claude[0],
          output: claude[1],
          read: claude[2],
          write: claude[0] * 1.25,
          write1h: claude[0] * 2,
          source: 'https://platform.claude.com/docs/en/about-claude/pricing',
        }
      }
    }
    return row
  })
}
