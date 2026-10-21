import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosAdapter } from 'axios'
import { afterEach, expect, it } from 'vitest'

import { api } from '@/lib/http-client'
import { createAppQueryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'
import { usePricingPreferencesStore } from '@/stores/pricing-preferences-store'

import type { ModelPricingConfig } from '../api'
import { ModelPricingPanel } from '../model-pricing-panel'
import { pricingOptions } from '../pricing'

const originalAdapter = api.defaults.adapter
const client = createAppQueryClient()

afterEach(() => {
  client.clear()
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().auth.setUser(null)
  localStorage.clear()
})

it('explicitly releases a fixed price with its saved version and can fix it again', async () => {
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'administrator', role: 100 })
  usePricingPreferencesStore.setState({ currency: 'USD' })
  const values = {
    'billing_setting.billing_mode': 'tiered_expr',
    'billing_setting.billing_expr': 'tier("standard", p * 1 + c * 2)',
  }
  const snapshot: ModelPricingConfig = {
    entries: [
      {
        model_name: 'example',
        version: 'manual-v1',
        pricing_source: 'manual',
        configured: values,
        effective: values,
      },
    ],
    options: pricingOptions({}),
    empty_version: 'empty',
  }
  const requests: {
    changes: {
      pricing_source: string
      expected_version: string
      pricing: unknown
    }[]
  }[] = []
  const adapter: AxiosAdapter = async (config) => {
    let data: unknown = { success: true, data: {} }
    if (config.method === 'get' && config.url === '/api/option/model_pricing') {
      data = { success: true, data: snapshot }
    } else if (config.method === 'get' && config.url === '/api/pricing') {
      data = { success: true, data: [], vendors: [] }
    } else if (config.method === 'get' && config.url === '/api/status') {
      data = { success: true, data: {} }
    } else if (
      config.method === 'patch' &&
      config.url === '/api/option/model_pricing'
    ) {
      const body = JSON.parse(config.data)
      requests.push(body)
      snapshot.entries[0] = {
        ...snapshot.entries[0],
        pricing_source: body.changes[0].pricing_source,
        version: 'source-v2',
      }
    } else if (config.method === 'post') {
      data = { success: true, data: { effective: values } }
    } else {
      throw new Error(`Unexpected request: ${config.method} ${config.url}`)
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
  api.defaults.adapter = adapter
  render(
    <QueryClientProvider client={client}>
      <ModelPricingPanel modelName='example' />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Resume automatic pricing' })
  )
  expect(requests).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(requests).toHaveLength(1))
  expect(requests[0].changes[0]).toEqual({
    model_name: 'example',
    expected_version: 'manual-v1',
    pricing: values,
    pricing_source: 'upstream',
  })
  await user.click(
    await screen.findByRole('button', { name: 'Fix current pricing' })
  )
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[1].changes[0].pricing_source).toBe('manual')
  expect(requests[1].changes[0].expected_version).toBe('source-v2')
})
