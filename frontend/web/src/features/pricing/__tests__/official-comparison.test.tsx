import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OfficialPriceComparison } from '../components/official-price-comparison'
import { getOfficialComparison } from '../lib/official-comparison'
import type { PricingModel } from '../types'

const model: PricingModel = {
  id: 1,
  model_name: 'gpt-6-astra-token',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 5,
  enable_groups: ['default', 'metered'],
  group_ratio: { default: 1, metered: 2 },
  billing_mode: 'tiered_expr',
  billing_expr:
    'len <= 272000 ? tier("short", p * 79.316105 + c * 396.580524) : tier("long", p * 158.632210 + c * 594.870785)',
}
const plans = [
  { price_cny: 9.9, credit_usd: 99, status: 'available' },
  { price_cny: 999, credit_usd: 11000, status: 'available' },
]

it('shows Jev at 1x without dividing free output by zero', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], { reference_usd_cny: 7.3 })
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <OfficialPriceComparison
        model={{
          ...model,
          model_name: 'jev-latest',
          billing_expr:
            'tier("base", u("input_tokens") * 3.066 / 1000000 + u("output_tokens") * 0 / 1000000)',
          billing_usage_schema: {
            input_tokens: { type: 'number', unit: 'token' },
            output_tokens: { type: 'number', unit: 'token' },
          },
        }}
      />
    </QueryClientProvider>
  )
  expect(screen.getByText('1×')).toBeTruthy()
  expect(screen.queryByText(/NaN|Infinity/)).toBeNull()
  rerender(
    <QueryClientProvider client={client}>
      <OfficialPriceComparison
        model={{
          ...model,
          model_name: 'jev-latest',
          billing_expr: 'tier("base", p * 3.066 + c * 1)',
        }}
      />
    </QueryClientProvider>
  )
  expect(screen.getByText('Official comparison unavailable')).toBeTruthy()
  client.clear()
})

describe('official USD comparison', () => {
  it('converts credit through actual purchase cost and FX before comparing matching tiers', () => {
    const result = getOfficialComparison(model, plans, 7.3)
    expect(result?.rows).toHaveLength(4)
    expect(result?.rows[0].maxUSD).toBeCloseTo(1.086522, 5)
    expect(result?.rows[0].maxRatio).toBeCloseTo(0.1086522, 6)
    expect(result?.rows[2].officialUSD).toBe(20)
    expect(result?.rows[3].officialUSD).toBe(75)
    expect(result?.rows[2].maxRatio).toBeCloseTo(
      result?.rows[0].maxRatio ?? Number.NaN
    )
  })
  it('respects selected group without treating the route pro suffix as an official pro model', () => {
    const result = getOfficialComparison(
      { ...model, model_name: 'gpt-6-astra-token-pro' },
      plans,
      7.3,
      'metered'
    )
    expect(result?.name).toBe('gpt-6-astra')
    expect(result?.rows[0].maxRatio).toBeCloseTo(0.2173044, 6)
  })
  it('does not invent multipliers for missing exchange rates, unknown models or request billing', () => {
    expect(getOfficialComparison(model, plans, 0)).toBeNull()
    expect(getOfficialComparison(model, [], 7.3)).toBeNull()
    expect(
      getOfficialComparison(
        { ...model, model_name: 'gpt-unknown-token' },
        plans,
        7.3
      )
    ).toBeNull()
    expect(
      getOfficialComparison(
        { ...model, billing_expr: 'tier("request", fixed(0.5))' },
        plans,
        7.3
      )
    ).toBeNull()
  })
  it('excludes unavailable plans and rejects mismatched context rules', () => {
    const result = getOfficialComparison(
      model,
      [plans[0], { ...plans[1], status: 'paused' }],
      7.3
    )
    expect(result?.rows[0].minRatio).toBe(result?.rows[0].maxRatio)
    expect(
      getOfficialComparison(
        {
          ...model,
          billing_expr: model.billing_expr?.replaceAll('272000', '128000'),
        },
        plans,
        7.3
      )
    ).toBeNull()
  })
  it('shows one standard multiplier without depending on recharge promotions', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(['recharge-packages'], { plans })
    client.setQueryData(['status'], { usd_exchange_rate: 7.3 })
    render(
      <QueryClientProvider client={client}>
        <OfficialPriceComparison model={model} />
      </QueryClientProvider>
    )
    expect(screen.getByRole('link').getAttribute('href')).toContain(
      '/models/gpt-6-astra'
    )
    expect(screen.getByText('0.11×')).toBeTruthy()
    expect(screen.queryByText(/0.10–/)).toBeNull()
    client.clear()
  })
})

it('shows verified Claude comparison and never assigns a GPT ratio to an unknown alias', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], { reference_usd_cny: 7.3 })
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <OfficialPriceComparison
        model={{
          ...model,
          model_name: 'claude-opus-5-5-token',
          billing_expr: 'tier("base", p * 95.1793 + c * 475.8966)',
        }}
      />
    </QueryClientProvider>
  )
  expect(screen.getByRole('link').getAttribute('href')).toContain(
    'platform.claude.com'
  )
  rerender(
    <QueryClientProvider client={client}>
      <OfficialPriceComparison
        model={{ ...model, model_name: 'codex-auto-review-token' }}
      />
    </QueryClientProvider>
  )
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.getByText('Official comparison unavailable')).toBeTruthy()
  client.clear()
})

it('resolves new catalog descriptions from the Chinese translation namespace', async () => {
  const { createInstance } = await import('i18next')
  const { default: zh } = await import('@/i18n/locales/zh.json')
  const instance = createInstance()
  await instance.init({ lng: 'zh', resources: { zh } })
  expect(
    instance.t('Pricing model description fallback', { mode: '按次计费' })
  ).toContain('按次计费，')
  expect(
    instance.t('Base tier price; see details for all tiers', { count: 2 })
  ).toContain('2 档')
  expect(
    instance.t('Standard quotation excludes recharge promotions')
  ).toContain('不计充值优惠')
})
