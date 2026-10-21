import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'

import { PricingMatrix } from '@/features/pricing/components/pricing-matrix'
import type { PricingModel } from '@/features/pricing/types'

import { originalSaleModel } from './original-price'
import fixture from './promotion-details.fixture.json'
import { PricingSaleBanner } from './pricing-promotion'

it('shows stored original prices and promotional prices with the same group conversion', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], { reference_usd_cny: 7.3 })
  const model: PricingModel = {
    id: 1,
    model_name: 'sale-fixture',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 2,
    enable_groups: ['vip'],
    group_ratio: { vip: 0.5 },
    billing_mode: 'tiered_expr',
    billing_expr: 'tier("standard",p*69.35+c*138.7+cc1h*34.675)',
    promotion: {
      id: 'a'.repeat(32),
      title: '限时降价',
      start_at: 1,
      end_at: 9999999999,
      discount_percent: 5,
      original: {
        'billing_setting.billing_mode': 'tiered_expr',
        'billing_setting.billing_expr': 'tier("standard",p*73+c*146+cc1h*36.5)',
      },
    },
  }
  const { container, rerender } = render(
    <QueryClientProvider client={client}>
      <PricingMatrix
        models={[model]}
        vendors={[]}
        groups={['vip']}
        vendor="all"
        group="vip"
        search=""
        onVendor={() => {}}
        onGroup={() => {}}
        onSearch={() => {}}
        onClear={() => {}}
        onModelClick={() => {}}
      />
    </QueryClientProvider>
  )
  expect(
    [...container.querySelectorAll('del')].map((n) => n.textContent)
  ).toEqual(['$0.50', '$1.00', '$0.25'])
  expect(screen.getByRole('table')).toHaveTextContent('$0.475')
  expect(screen.getByRole('table')).toHaveTextContent('$0.95')
  expect(screen.getByRole('table')).not.toHaveTextContent('[object Object]')
  expect(screen.getByRole('table')).toHaveTextContent('$0.2375')
  expect(screen.getByRole('link', { name: '优惠倍率 0.950×' })).toHaveAttribute(
    'href',
    `/model-offers/${'a'.repeat(32)}`
  )
  expect(originalSaleModel(model)?.billing_expr).toBe(
    'tier("standard",p*73+c*146+cc1h*36.5)'
  )
  rerender(
    <QueryClientProvider client={client}>
      <PricingMatrix
        models={[{ ...model, promotion: undefined }]}
        vendors={[]}
        groups={['vip']}
        vendor="all"
        group="vip"
        search=""
        onVendor={() => {}}
        onGroup={() => {}}
        onSearch={() => {}}
        onClear={() => {}}
        onModelClick={() => {}}
      />
    </QueryClientProvider>
  )
  expect(container.querySelectorAll('del')).toHaveLength(0)
  client.clear()
})

it('renders an enabled offer at the top with its deadline and live timer', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const now = Math.floor(Date.now() / 1000)
  client.setQueryData(['public-model-sales'], {
    server_time: now,
    items: [
      {
        id: 'b'.repeat(32),
        title: '精选模型限时降价',
        status: 'active',
        start_at: now - 60,
        end_at: now + 86400,
        countdown_mode: 'end',
        models: ['sale-fixture'],
        discount_percent: 3,
      },
    ],
  })
  client.setQueryData(['pricing'], { success: true, data: [] })
  render(
    <QueryClientProvider client={client}>
      <PricingSaleBanner />
    </QueryClientProvider>
  )
  expect(
    screen.getByRole('heading', { name: '精选模型限时降价' })
  ).toBeVisible()
  expect(screen.getByRole('timer')).toBeVisible()
  expect(screen.getByText(/详情直接查看/)).toBeVisible()
  client.clear()
})

it('shows all model IDs and crossed original multipliers without opening details or navigating', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  const now = Math.floor(Date.now() / 1000)
  client.setQueryData(['public-model-sales'], {
    server_time: now,
    items: fixture.sales.map((sale) => ({
      ...sale,
      start_at: now - 60,
      end_at: now + 604740,
    })),
  })
  client.setQueryData(['pricing'], { success: true, data: fixture.models })
  client.setQueryData(['status'], { reference_usd_cny: fixture.rate })
  const { container } = render(
    <QueryClientProvider client={client}>
      <PricingSaleBanner />
    </QueryClientProvider>
  )
  expect(screen.getAllByRole('timer')).toHaveLength(1)
  expect(container.querySelectorAll('.sale-square-banner')).toHaveLength(1)
  expect(screen.getByText(/11 个模型/)).toBeVisible()
  expect(container.querySelectorAll('details')).toHaveLength(0)
  expect(container.querySelectorAll('.sale-promotion-group')).toHaveLength(5)
  expect(container.querySelectorAll('.sale-promotion-models li')).toHaveLength(
    11
  )
  expect(container.querySelectorAll('del')).toHaveLength(8)
  for (const model of fixture.models)
    expect(screen.getByText(model.model_name, { exact: true })).toBeVisible()
  const low = screen.getByRole('region', { name: 'DeepSeek Flash Low降价详情' })
  expect(low).toHaveTextContent('0.09×')
  expect(low).toHaveTextContent('0.18×')
  expect(low).toHaveTextContent('高峰')
  expect(low).toHaveTextContent('北京时间 UTC+8')
  expect(
    within(low)
      .getAllByLabelText('原倍率')
      .map((node) => node.textContent)
  ).toEqual(['0.1×', '0.2×'])
  client.clear()
})
