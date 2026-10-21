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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import type { UpstreamMonitorSnapshot } from '../../upstream-monitor-api'
import { ModelsProvider, useModels } from '../models-provider'
import { UpstreamMonitorSection } from '../upstream-monitor-section'

const snapshot: UpstreamMonitorSnapshot = {
  checked_at: '2026-09-23T08:00:00Z',
  cached: false,
  providers: [
    {
      provider: 'yylx',
      diff_scope: 'model_name_only',
      removal_actionable: false,
      source_url: 'https://example.org/yylx',
      checked_at: '2026-09-23T08:00:00Z',
      status: 'ok',
      error: null,
      new_models: ['new-yylx-model'],
      removed_models: ['retired-yylx-model'],
      local_models: [],
      models: [
        {
          name: 'model-token',
          group: 'Economy',
          group_id: '11',
          billing_type: 'token',
          currency: 'USD',
          price_status: 'known',
          raw_price: {
            input_per_million: 1,
            output_per_million: 2,
            effective_input_per_million: 1.2,
            effective_output_per_million: 2.4,
            per_request: null,
            model_ratio: 1,
            completion_ratio: 2,
            group_ratio: 1.2,
          },
          suggested_sale_price: null,
          gross_margin: null,
          tiers: [
            {
              label: '0–32K',
              input_per_million: 1,
              output_per_million: 2,
              effective_input_per_million: 1.2,
              effective_output_per_million: 2.4,
              per_request: null,
              effective_per_request: null,
            },
          ],
        },
      ],
    },
    {
      provider: '2000run',
      diff_scope: 'model_name_only',
      removal_actionable: false,
      source_url: 'https://example.org/2000run',
      checked_at: '2026-09-23T08:00:00Z',
      status: 'partial',
      error: 'One source is unavailable',
      new_models: [],
      removed_models: [],
      local_models: [],
      models: [
        {
          name: 'model-request',
          group: 'Standard',
          billing_type: 'request',
          currency: 'USD',
          price_status: 'known',
          raw_price: {
            input_per_million: null,
            output_per_million: null,
            effective_per_request: 0.03,
            per_request: 0.02,
            model_ratio: null,
            completion_ratio: null,
          },
          suggested_sale_price: null,
          gross_margin: null,
        },
      ],
    },
    {
      provider: 'typesafe',
      diff_scope: 'model_name_only',
      removal_actionable: false,
      source_url: 'https://example.org/typesafe',
      checked_at: null,
      status: 'error',
      error: 'Source unavailable',
      new_models: [],
      removed_models: [],
      local_models: [],
      models: [
        {
          name: 'model-unknown',
          billing_type: 'unknown',
          currency: null,
          price_status: 'unknown',
          raw_price: {
            input_per_million: null,
            output_per_million: null,
            per_request: null,
            model_ratio: null,
            completion_ratio: null,
          },
          suggested_sale_price: null,
          gross_margin: null,
        },
      ],
    },
  ],
}

function PriceDialogProbe() {
  const { open } = useModels()
  return open === 'price-sync' ? (
    <div role='status'>Price sync opened</div>
  ) : null
}

function MonitorPage() {
  return (
    <ModelsProvider>
      <UpstreamMonitorSection />
      <PriceDialogProbe />
    </ModelsProvider>
  )
}

function renderMonitor(response: UpstreamMonitorSnapshot = snapshot) {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  const get = vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url !== '/api/models/upstream-monitor') {
      throw new Error(`Unexpected GET ${url}`)
    }
    const refreshed =
      (config?.params as { refresh?: number } | undefined)?.refresh === 1
    return {
      data: {
        success: true,
        data: refreshed
          ? {
              ...response,
              cached: true,
              checked_at: '2026-09-23T08:01:00Z',
            }
          : response,
      },
    }
  })
  const post = vi.spyOn(api, 'post')
  const put = vi.spyOn(api, 'put')
  const root = createRootRoute()
  const models = createRoute({
    getParentRoute: () => root,
    path: '/models/$section',
    component: MonitorPage,
  })
  const channels = createRoute({
    getParentRoute: () => root,
    path: '/channels',
    component: () => <div>Channels page</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([models, channels]),
    history: createMemoryHistory({
      initialEntries: ['/models/upstream-monitor'],
    }),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { get, post, put, client }
}

afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore.getState().auth.setUser(null)
})

it('shows each source status and the selected model raw and effective prices', async () => {
  renderMonitor()
  const user = userEvent.setup()

  expect(
    await screen.findByRole('region', { name: 'Upstream monitor' })
  ).toBeVisible()
  await screen.findByText('model-token')
  expect(
    screen.getByText(/Upstream quotes refresh every 5 minutes/)
  ).toBeVisible()
  expect(screen.getByRole('button', { name: /YYLX/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(screen.getByRole('button', { name: /2000\.run/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /TypeSafe/ })).toBeVisible()
  expect(screen.getByText('new-yylx-model')).toBeVisible()
  expect(screen.getByText('retired-yylx-model')).toBeVisible()
  expect(screen.getAllByText('USD 1 / 1M tokens').length).toBeGreaterThan(0)
  expect(screen.getAllByText('USD 1.2 / 1M tokens').length).toBeGreaterThan(0)
  expect(screen.getByText('0–32K')).toBeVisible()
  expect(screen.getByText('Suggested site price (estimate)')).toBeVisible()
  expect(
    screen.getByText('Current cost assumptions for suggested prices')
  ).toBeVisible()
  expect(
    screen.getByText(/Model changes are name-only comparisons/)
  ).toBeVisible()

  await user.click(screen.getByRole('button', { name: /2000\.run/ }))
  expect(screen.getByText('model-request')).toBeVisible()
  expect(screen.getByText('USD 0.02 / Request')).toBeVisible()
  expect(screen.getByText('USD 0.03 / Request')).toBeVisible()

  await user.click(screen.getByRole('button', { name: /TypeSafe/ }))
  expect(screen.getByText('model-unknown')).toBeVisible()
  expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0)
})

it('checks with refresh=1, reports cached data, and keeps price changes manual', async () => {
  const { get, post, put } = renderMonitor()
  const user = userEvent.setup()
  await screen.findByText('model-token')

  await user.click(screen.getByRole('button', { name: 'Check upstream now' }))
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/api/models/upstream-monitor', {
      params: { refresh: 1 },
    })
  )
  expect(await screen.findByText(/Recent cached result/)).toBeVisible()
  expect(post).not.toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()

  await user.click(
    screen.getByRole('button', { name: 'Check price differences' })
  )
  expect(
    screen.getByText(/overwrite margin-adjusted site prices/)
  ).toBeVisible()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await user.click(
    screen.getByRole('button', { name: 'Open price comparison' })
  )
  expect(screen.getByRole('status')).toHaveTextContent('Price sync opened')
  expect(
    screen.getByRole('button', { name: 'Review channels' })
  ).toHaveAttribute('href', '/channels')
})

it('shows unavailable source counts as unknown instead of zero', async () => {
  const unavailable: UpstreamMonitorSnapshot = {
    ...snapshot,
    providers: snapshot.providers.map((provider) =>
      provider.provider === 'typesafe'
        ? { ...provider, status: 'partial', models: [] }
        : provider
    ),
  }
  renderMonitor(unavailable)
  const user = userEvent.setup()
  await screen.findByText('model-token')
  await user.click(screen.getByRole('button', { name: /TypeSafe/ }))

  expect(screen.getByText('Source unavailable')).toBeVisible()
  expect(screen.getAllByText('Unknown').length).toBeGreaterThanOrEqual(3)
  expect(screen.queryByText('model-unknown')).not.toBeInTheDocument()
})

it('uses 美元额度 as the Chinese suggested-price unit', async () => {
  i18next.addResourceBundle('zh', 'translation', zh.translation)
  await i18next.changeLanguage('zh')
  try {
    renderMonitor()
    await screen.findByText('model-token')
    expect(screen.getAllByText(/美元额度 \/ 1M tokens/).length).toBe(2)
    expect(screen.queryByText(/美元站内额度/)).not.toBeInTheDocument()
  } finally {
    await i18next.changeLanguage('en')
    i18next.removeResourceBundle('zh', 'translation')
  }
})
