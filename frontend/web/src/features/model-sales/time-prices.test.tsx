import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { SaleTimePrice } from './api'
import { SaleTimePrices } from './time-prices'
vi.mock('@/features/pricing/components/time-pricing-schedule', () => ({
  TimePricingSchedule: () => <p>实际计费时段</p>,
}))
const detail: SaleTimePrice = {
  model: 'deepseek-v4.1-flash-low',
  currency: 'USD',
  billing_expr: '',
  tiers: [
    {
      label: 'off_peak',
      original: { p: 0.015, c: 0.06, cr: 0.0003 },
      official: { p: 0.15, c: 0.6, cr: 0.003 },
      target: { p: 0.0135, c: 0.054, cr: 0.00027 },
      original_multiplier: 0.1,
      target_multiplier: 0.09,
    },
    {
      label: 'peak',
      original: { p: 0.03, c: 0.12, cr: 0.0006 },
      official: { p: 0.3, c: 1.2, cr: 0.006 },
      target: { p: 0.027, c: 0.108, cr: 0.00054 },
      original_multiplier: 0.1,
      target_multiplier: 0.09,
    },
  ],
}
describe('time-price sale disclosure', () => {
  it('shows both original and planned input/output/cache prices with pending warning', () => {
    const html = renderToStaticMarkup(<SaleTimePrices details={[detail]} />)
    for (const text of [
      '普通时段',
      '高峰时段',
      '$0.0135',
      '$0.027',
      '$0.054',
      '$0.108',
      '$0.00027',
      '$0.00054',
      '成本核验并启用后生效',
      '两档都须满足成本保护',
    ])
      expect(html).toContain(text)
  })
  it('updates both tiers together when the unsaved multiplier changes', () => {
    const html = renderToStaticMarkup(
      <SaleTimePrices
        details={[detail]}
        multipliers={{ [detail.model]: 0.08 }}
      />
    )
    expect(html).toContain('$0.012')
    expect(html).toContain('$0.024')
    expect(html).not.toContain('$0.0135')
  })
  it('does not advertise missing or unpublished time prices', () => {
    expect(renderToStaticMarkup(<SaleTimePrices details={undefined} />)).toBe(
      ''
    )
  })
})
