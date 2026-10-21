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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { PricingMatrix } from '../components/pricing-matrix'
import { TimePricingSchedule } from '../components/time-pricing-schedule'
import { timePricingInfo } from '../lib/time-pricing'
import type { PricingModel } from '../types'
import fixtures from './deepseek-time-fixture.json'

afterEach(() => vi.useRealTimers())

it.each(fixtures)(
  'selects $model_name prices at Beijing boundaries, weekends and excluded dates',
  (model) => {
    for (const [date, tier] of [
      ['2026-10-12T08:59:59+08:00', 'off_peak'],
      ['2026-10-12T09:00:00+08:00', 'peak'],
      ['2026-10-12T11:59:59+08:00', 'peak'],
      ['2026-10-12T12:00:00+08:00', 'off_peak'],
      ['2026-10-12T13:59:59+08:00', 'off_peak'],
      ['2026-10-12T14:00:00+08:00', 'peak'],
      ['2026-10-12T18:00:00+08:00', 'off_peak'],
      ['2026-10-11T10:00:00+08:00', 'off_peak'],
      ['2026-10-05T10:00:00+08:00', 'off_peak'],
    ])
      expect(
        timePricingInfo(model.billing_expr, new Date(date))?.currentLabel
      ).toBe(tier)
    const info = timePricingInfo(model.billing_expr)!
    expect(info.condition).not.toContain('month(')
    expect(info.exclusions).toHaveLength(1)
    expect(info.exclusions[0]).toContain('month("Asia/Shanghai") == 10')
  }
)

it('does not invent a schedule for context tiers or request-dependent prices', () => {
  expect(
    timePricingInfo('len > 100 ? tier("peak", p) : tier("off_peak", p*2)')
  ).toBeNull()
  expect(
    timePricingInfo('hour("UTC") > 9 ? tier("custom", p) : tier("normal", p*2)')
  ).toBeNull()
  expect(timePricingInfo('invalid')).toBeNull()
})

it('updates the visible period on the minute boundary without reloading the page', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-12T08:59:30+08:00'))
  render(<TimePricingSchedule expression={fixtures[0].billing_expr} />)
  expect(screen.getByText('Now: Off-peak price')).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(30000))
  expect(screen.getByText('Now: Peak price')).toBeInTheDocument()
})

it('shows both real prices in phone cards, with details available and the current price identified', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], { reference_usd_cny: 6.692129216491165 })
  const models = fixtures.map((model, id) => ({
    ...model,
    id,
    vendor_name: 'DeepSeek',
    group_ratio: { default: 1, deepseek: 1 },
  })) as PricingModel[]
  render(
    <QueryClientProvider client={client}>
      <PricingMatrix
        models={models}
        vendors={[]}
        groups={['default', 'deepseek']}
        vendor='all'
        group='all'
        search=''
        onVendor={() => {}}
        onGroup={() => {}}
        onSearch={() => {}}
        onClear={() => {}}
        onModelClick={() => {}}
      />
    </QueryClientProvider>
  )
  const card = screen.getByRole('table', {
    name: 'deepseek-flash-low Time-based prices',
  })
  expect(
    within(card).getByRole('row', { name: /Peak price/ })
  ).toHaveTextContent('$0.03')
  expect(
    within(card).getByRole('row', { name: /Off-peak price/ })
  ).toHaveTextContent('$0.015')
  expect(within(card).getAllByText('Current period')).toHaveLength(1)
  expect(screen.getAllByText(/Beijing time · UTC\+8/).length).toBeGreaterThan(0)
  expect(
    screen.getAllByRole('button', { name: 'View pricing details →' })
  ).toHaveLength(3)
  client.clear()
})
