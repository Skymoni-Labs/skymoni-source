import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { PricingMatrix } from '../components/pricing-matrix'
import type { PricingModel } from '../types'

it('shows Gemini official prices and 0.24x instead of unknown, with cache write not separately priced', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], { reference_usd_cny: 7.3 })
  const flash: PricingModel = {
    id: 44,
    model_name: 'gemini-3.8-flash-token',
    vendor_name: 'Google',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 5,
    enable_groups: ['default'],
    group_ratio: { default: 1 },
    billing_mode: 'tiered_expr',
    billing_expr: 'tier("standard", p * 13.14 + c * 65.7 + cr * 1.314)',
  }
  render(
    <QueryClientProvider client={client}>
      <PricingMatrix
        models={[flash]}
        vendors={[]}
        groups={['default']}
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
  expect(screen.getByRole('link', { name: '0.24×' })).toHaveAttribute(
    'href',
    'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash'
  )
  expect(screen.getByRole('table')).toHaveTextContent('$0.75')
  expect(screen.getByRole('table')).toHaveTextContent('$3.75')
  expect(screen.getByRole('table')).toHaveTextContent('Not separately priced')
  client.clear()
})

it('uses editable names in filters and headings while selecting the original group key', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], {
    reference_usd_cny: 7.3,
    pricing_group_labels: JSON.stringify({ 'moni-gpt-017': 'GPT 优选' }),
  })
  const onGroup = vi.fn()
  const model: PricingModel = {
    id: 1,
    model_name: 'gpt-5.5-token',
    vendor_name: 'OpenAI',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 6,
    enable_groups: ['moni-gpt-017'],
    group_ratio: { 'moni-gpt-017': 1 },
  }
  render(
    <QueryClientProvider client={client}>
      <PricingMatrix
        models={[model]}
        vendors={[]}
        groups={['moni-gpt-017']}
        vendor='all'
        group='all'
        search=''
        onVendor={() => {}}
        onGroup={onGroup}
        onSearch={() => {}}
        onClear={() => {}}
        onModelClick={() => {}}
      />
    </QueryClientProvider>
  )
  const priceBefore = screen.getByRole('table').textContent
  expect(
    screen.getByRole('heading', { name: /OpenAI · GPT 优选/ })
  ).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'GPT 优选' }))
  expect(onGroup).toHaveBeenCalledWith('moni-gpt-017')
  await act(async () => {
    client.setQueryData(['status'], {
      reference_usd_cny: 7.3,
      pricing_group_labels: '{}',
    })
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'GPT · 0.17×' })).toBeVisible()
  )
  expect(screen.getByRole('table').textContent).toBe(priceBefore)
  client.clear()
})

it.each(['deepseek-flash', 'deepseek-flash-low'])(
  'shows %s official 0.1x across both time tiers and labels cache write as not separately priced',
  (modelName) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(['status'], { reference_usd_cny: 7.3 })
    const flash: PricingModel = {
      id: 1,
      model_name: modelName,
      vendor_name: 'DeepSeek',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 4,
      enable_groups: ['default'],
      group_ratio: { default: 1 },
      billing_mode: 'tiered_expr',
      billing_expr:
        'weekday("UTC") >= 1 && hour("UTC") >= 1 && hour("UTC") < 4 ? tier("peak", p * 2.19 + c * 8.76 + cr * 0.0438) : tier("off_peak", p * 1.095 + c * 4.38 + cr * 0.0219)',
    }
    render(
      <QueryClientProvider client={client}>
        <PricingMatrix
          models={[flash]}
          vendors={[]}
          groups={['default']}
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
    expect(screen.getByRole('link', { name: '0.1×' })).toHaveAttribute(
      'href',
      'https://api-docs.deepseek.com/quick_start/pricing/'
    )
    expect(screen.getAllByText('Not separately priced')).toHaveLength(4)
    expect(screen.queryByText('Unknown')).toBeNull()
    client.clear()
  }
)

it('groups by business and provider while showing each model once across context tiers', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['recharge-packages'], {
    plans: [
      { id: '01', price_cny: 9.9, credit_usd: 99, status: 'available' },
      { id: '07', price_cny: 999, credit_usd: 11000, status: 'available' },
    ],
  })
  client.setQueryData(['status'], { usd_exchange_rate: 7.3 })
  const base: PricingModel = {
    id: 1,
    model_name: 'gpt-6-astra-token',
    vendor_name: 'OpenAI',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 5,
    enable_groups: ['default', 'metered'],
    group_ratio: { default: 1 },
    billing_mode: 'tiered_expr',
    billing_expr:
      'len <= 272000 ? tier("short", p * 124.1 + c * 620.5) : tier("long", p * 248.2 + c * 930.75)',
  }
  render(
    <QueryClientProvider client={client}>
      <PricingMatrix
        models={[
          base,
          {
            ...base,
            id: 2,
            model_name: 'claude-opus-5-5-token',
            vendor_name: 'Anthropic',
            billing_expr: 'tier("flat", p * 95 + c * 475)',
          },
        ]}
        vendors={[]}
        groups={['default', 'metered']}
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
  expect(screen.getAllByRole('table')).toHaveLength(2)
  expect(
    screen.getAllByRole('button', { name: 'gpt-6-astra-token' })
  ).toHaveLength(1)
  expect(screen.getAllByText('≤272K')).toHaveLength(2)
  expect(screen.getByText('$1.70')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '¥999' })).toBeNull()
  expect(screen.getAllByRole('link', { name: '0.17×' })).toHaveLength(1)
  expect(
    screen.getByRole('link', { name: '0.17×' }).closest('td')?.rowSpan
  ).toBe(2)
  client.clear()
})

it('labels GPT-5.5 cache write as unlisted and shows official token prices beside request billing without a false ratio', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], { reference_usd_cny: 7.3 })
  const base: PricingModel = {
    id: 1,
    model_name: 'gpt-5.5-token',
    vendor_name: 'OpenAI',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 6,
    enable_groups: ['default', 'moni-gpt-017'],
    group_ratio: { default: 1 },
    billing_mode: 'tiered_expr',
    billing_expr: 'tier("standard", p * 62.05 + c * 372.3 + cr * 6.205)',
  }
  render(
    <QueryClientProvider client={client}>
      <PricingMatrix
        models={[
          base,
          {
            ...base,
            id: 2,
            model_name: 'gpt-5.6',
            enable_groups: ['default', 'per-request'],
            billing_expr: 'tier("request", fixed(0.5))',
          },
        ]}
        vendors={[]}
        groups={['default']}
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
  const tokenRow = screen.getByRole('row', { name: /gpt-5.5-token/ })
  expect(tokenRow.textContent).toContain('Not separately priced')
  const requestRow = screen.getByRole('row', { name: /gpt-5.6/ })
  expect(requestRow.textContent).toContain('$4.00')
  expect(requestRow.textContent).toContain('$20.00')
  expect(requestRow.textContent).toContain('Different billing units')
  client.clear()
})

it('keeps selected group buttons and an empty result when the chosen group has no visible models', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], {})
  const onGroup = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <PricingMatrix
        models={[]}
        vendors={[]}
        groups={['default', 'metered', 'vip']}
        vendor='all'
        group='vip'
        search=''
        onVendor={() => {}}
        onGroup={onGroup}
        onSearch={() => {}}
        onClear={() => {}}
        onModelClick={() => {}}
      />
    </QueryClientProvider>
  )
  expect(screen.getByRole('button', { name: 'vip' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(screen.getByRole('button', { name: 'moni-token' })).toBeVisible()
  expect(
    screen.getByText('No models match your current filters.')
  ).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Default' }))
  expect(onGroup).toHaveBeenCalledWith('default')
  client.clear()
})
