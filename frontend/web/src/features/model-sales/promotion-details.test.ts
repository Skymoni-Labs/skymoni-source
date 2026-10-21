import { describe, expect, it } from 'vitest'

import { siteCreditUSDValue } from '@/features/pricing/lib/standard-quote'
import type { PricingModel } from '@/features/pricing/types'

import type { PublicSale } from './api'
import fixture from './promotion-details.fixture.json'
import { promotionDetails } from './promotion-details'

const sales: PublicSale[] = fixture.sales.map((sale) => ({
  ...sale,
  server_time: sale.start_at,
  model_multipliers: Object.fromEntries(
    Object.entries(sale.model_multipliers).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number'
    )
  ),
}))
const catalog = fixture.models as PricingModel[]
const summarize = (items = sales, models = catalog) =>
  promotionDetails(
    items,
    models,
    siteCreditUSDValue(fixture.rate),
    fixture.rate
  )

describe('public promotion details from live settlement snapshots', () => {
  it('lists all 11 public models and separates the GPT and Grok original rates', () => {
    const groups = summarize()
    expect(groups).toHaveLength(5)
    expect(groups.flatMap((group) => group.models)).toHaveLength(11)
    expect(groups.flatMap((group) => group.models)).not.toContain(
      'deepseek-flash'
    )
    expect(groups.flatMap((group) => group.models)).not.toContain(
      'gpt-5.6-sol-token'
    )
    const gpt = groups.find((group) => group.title === 'GPT Token')!
    const grok = groups.find((group) => group.title === 'Grok Token')!
    expect(gpt.models).toHaveLength(5)
    expect(grok.models).toHaveLength(3)
    expect(gpt.rates).toEqual([
      expect.objectContaining({ original: 0.17, target: 0.14 }),
    ])
    expect(grok.rates).toEqual([
      expect.objectContaining({ original: 0.15, target: 0.14 }),
    ])
    expect(groups.every((group) => !group.pending)).toBe(true)
  })

  it('compares both DeepSeek tiers against the same ordinary official base', () => {
    const groups = summarize()
    for (const [title, ordinary, peak] of [
      ['DeepSeek Pro', [0.15, 0.1], [0.3, 0.2]],
      ['DeepSeek Flash', [0.15, 0.14], [0.3, 0.28]],
      ['DeepSeek Flash Low', [0.1, 0.09], [0.2, 0.18]],
    ] as const) {
      const group = groups.find((item) => item.title === title)!
      expect(
        group.rates.find((rate) => rate.label === '普通时段')
      ).toMatchObject({ original: ordinary[0], target: ordinary[1] })
      expect(
        group.rates.find((rate) => rate.label === '高峰时段')
      ).toMatchObject({ original: peak[0], target: peak[1] })
      expect(group.schedule?.condition).toContain('Asia/Shanghai')
      expect(group.schedule?.condition).toContain('>= 9')
      expect(group.schedule?.condition).toContain('< 12')
      expect(group.schedule?.condition).toContain('>= 14')
      expect(group.schedule?.condition).toContain('< 18')
      expect(group.schedule?.condition.includes('weekday')).toBe(
        title.endsWith('Low')
      )
    }
  })

  it('does not advertise an active rate if pricing has a different activity snapshot', () => {
    const changed = catalog.map((model) => ({ ...model, promotion: undefined }))
    expect(
      summarize(sales, changed).every(
        (group) => group.pending && !group.rates.length
      )
    ).toBe(true)
  })

  it('shows a reused scheduled template target without treating it as a live price', () => {
    const gptSale = sales[0]
    const originalModels = catalog.map((model) => ({
      ...model,
      billing_expr: model.promotion!.original[
        'billing_setting.billing_expr'
      ] as string,
      promotion: undefined,
    }))
    const groups = summarize(
      [
        {
          ...gptSale,
          id: 'future-template',
          status: 'scheduled',
          model_multipliers: Object.fromEntries(
            gptSale.models.map((name) => [name, 0.13])
          ),
        },
      ],
      originalModels
    )
    expect(
      groups.find((group) => group.title === 'GPT Token')?.rates[0]
    ).toMatchObject({ original: 0.17, target: 0.13 })
  })

  it('can show a per-request sale in yuan without calling it an official token multiplier', () => {
    const sale = { ...sales[0], models: ['per-request-fixture'] }
    const model: PricingModel = {
      id: 1,
      model_name: sale.models[0],
      quota_type: 1,
      model_price: 0.5,
      model_ratio: 0,
      completion_ratio: 0,
      enable_groups: [],
      promotion: {
        id: sale.id,
        title: sale.title,
        start_at: sale.start_at,
        end_at: sale.end_at,
        discount_percent: 0,
        original: { ModelPrice: 1 },
      },
    }
    expect(summarize([sale], [model])[0].rates).toEqual([
      expect.objectContaining({ unit: 'request', original: 0.1, target: 0.05 }),
    ])
  })
})
