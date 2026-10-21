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
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useStatus } from '@/hooks/use-status'

import { getPricing } from '../../api'
import type { PricingData } from '../../types'
import { usePricingData } from '../use-pricing-data'

vi.mock('../../api', () => ({ getPricing: vi.fn() }))
vi.mock('@/hooks/use-status', () => ({ useStatus: vi.fn() }))
beforeEach(() => {
  vi.mocked(useStatus).mockReturnValue({
    status: null,
    loading: false,
    error: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('refreshes the open catalog within 30 seconds of a channel change', async () => {
  vi.useFakeTimers()
  vi.mocked(getPricing).mockResolvedValue({
    success: true,
    data: [],
    vendors: [],
    group_ratio: {},
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )

  renderHook(() => usePricingData(), { wrapper })
  await act(async () => {
    await Promise.resolve()
  })
  expect(getPricing).toHaveBeenCalledTimes(1)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
  })
  expect(getPricing).toHaveBeenCalledTimes(2)
  client.clear()
})

it('selected groups control the catalog and model details without mutating prices or source memberships', () => {
  vi.mocked(useStatus).mockReturnValue({
    status: { pricing_visible_groups: '["vip","moni-gpt-premium"]' },
    loading: false,
    error: null,
  })
  const data: PricingData = {
    success: true,
    data: [
      {
        id: 1,
        model_name: 'shared-model',
        enable_groups: ['default', 'vip'],
        quota_type: 0,
        model_ratio: 2,
        completion_ratio: 3,
      },
      {
        id: 2,
        model_name: 'hidden-model',
        enable_groups: ['default'],
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
      },
      {
        id: 3,
        model_name: 'selected-legacy-model',
        enable_groups: ['moni-gpt-premium'],
        quota_type: 0,
        model_ratio: 4,
        completion_ratio: 2,
      },
    ],
    vendors: [],
    group_ratio: { default: 1, vip: 2, 'moni-gpt-premium': 1 },
    usable_group: {
      default: { desc: 'Default', ratio: 1 },
      vip: { desc: 'VIP', ratio: 2 },
      'moni-gpt-premium': { desc: 'GPT', ratio: 1 },
    },
    supported_endpoint: {},
    auto_groups: [],
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['pricing'], data)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result, rerender } = renderHook(() => usePricingData(false), {
    wrapper,
  })
  expect(result.current.visibleGroups).toEqual(['vip', 'moni-gpt-premium'])
  expect(result.current.models.map((model) => model.model_name)).toEqual([
    'shared-model',
    'selected-legacy-model',
  ])
  expect(result.current.models[0].enable_groups).toEqual(['vip'])
  expect(result.current.models[0].model_ratio).toBe(2)
  expect(result.current.groupRatio).toEqual(data.group_ratio)
  expect(data.data[0].enable_groups).toEqual(['default', 'vip'])
  vi.mocked(useStatus).mockReturnValue({
    status: { pricing_visible_groups: '[]' },
    loading: false,
    error: null,
  })
  rerender()
  expect(result.current.visibleGroups).toEqual([])
  expect(result.current.models).toEqual([])
  client.clear()
})

it('shows selected filter buttons while retaining the API-allowed model groups and prices', () => {
  vi.mocked(useStatus).mockReturnValue({
    status: { pricing_visible_groups: '["default","metered","vip"]' },
    loading: false,
    error: null,
  })
  const data: PricingData = {
    success: true,
    data: [
      {
        id: 1,
        model_name: 'shared-model',
        enable_groups: ['default', 'metered'],
        quota_type: 0,
        model_ratio: 2,
        completion_ratio: 3,
      },
    ],
    vendors: [],
    group_ratio: { default: 1.5 },
    usable_group: { default: { desc: 'Default', ratio: 1.5 } },
    supported_endpoint: {},
    auto_groups: [],
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['pricing'], data)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => usePricingData(false), { wrapper })
  expect(result.current.visibleGroups).toEqual(['default', 'metered', 'vip'])
  expect(result.current.models[0].enable_groups).toEqual(['default'])
  expect(result.current.models[0].model_ratio).toBe(2)
  expect(result.current.groupRatio).toEqual({ default: 1.5 })
  expect(result.current.usableGroup).toEqual(data.usable_group)
  expect(data.data[0].enable_groups).toEqual(['default', 'metered'])
  client.clear()
})
