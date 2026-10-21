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
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosResponse } from 'axios'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { DirectionProvider } from '@/context/direction-provider'
import { ThemeProvider } from '@/context/theme-provider'
import { publicPreviewProducts } from '@/features/shop-public-preview/catalog'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

import { StoreEntry } from '../store-entry'

let client: QueryClient
const product = { ...publicPreviewProducts[0], id: '11' }
beforeEach(() => {
  useAuthStore.getState().auth.reset()
  window.history.replaceState(null, '', '/store')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (!url?.startsWith('/api/shop/')) {
      throw new Error(`Unexpected request: ${url}`)
    }
    return {
      data: {
        success: true,
        data: {
          items: [product],
          total: 1,
          balanceCents: url.includes('/public/') ? undefined : 54321,
        },
      },
    } as AxiosResponse
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  client?.clear()
  useAuthStore.getState().auth.reset()
  window.history.replaceState(null, '', '/')
})

async function openStore() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(STATUS_QUERY_KEY, {})
  client.setQueryData(['notice'], { success: true, data: '' })
  const root = createRootRoute({ component: Outlet })
  const store = createRoute({
    getParentRoute: () => root,
    path: '/store',
    component: StoreEntry,
  })
  const router = createRouter({
    routeTree: root.addChildren([store]),
    history: createMemoryHistory({ initialEntries: ['/store'] }),
  })
  render(
    <DirectionProvider>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </DirectionProvider>
  )
  await screen.findByRole('heading', { name: 'Curated digital goods' })
}

function signIn() {
  useAuthStore.getState().auth.setBundle({
    access_token: 'store-entry-test-token',
    token_type: 'Bearer',
    access_expires_at: 4102444800,
    user: { id: 4, username: 'store-member', role: 1 },
    session: {
      sid: 'store-entry-fixture',
      current: true,
      login_method: 'password',
      ip: '',
      user_agent: '',
      created_at: 1,
      last_active_at: 1,
      expires_at: 4102444800,
    },
  })
}

test('a guest reads the live public catalog and signs in before purchase', async () => {
  const user = userEvent.setup()
  await openStore()
  expect(screen.queryByText('Available balance')).not.toBeInTheDocument()
  expect(
    screen.getByText('Browse freely. Sign in when you are ready to buy.')
  ).toBeVisible()
  expect(vi.mocked(api.get).mock.calls.map(([url]) => url)).toEqual([
    '/api/shop/public/products?p=1&page_size=100',
  ])
  const card = screen
    .getByRole('heading', { name: product.benefit.name })
    .closest('article')
  if (!card) throw new Error('Missing product card')
  await user.click(within(card).getByRole('button', { name: 'Details' }))
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Sign in to buy',
    })
  )
  expect(
    within(
      screen.getByRole('dialog', { name: 'Sign in to continue' })
    ).getByRole('link', { name: 'Go to sign in' })
  ).toHaveAttribute('href', '/sign-in?redirect=%2Fstore')
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})

test('a member retains the existing store, balance and console navigation', async () => {
  signIn()
  await openStore()
  expect(screen.getByText('Available balance')).toBeVisible()
  expect(screen.getAllByRole('button', { name: 'My orders' })[0]).toBeVisible()
  expect(screen.getByRole('button', { name: 'Wallet' })).toBeVisible()
  expect(
    screen.queryByText('Browse freely. Sign in when you are ready to buy.')
  ).not.toBeInTheDocument()
  expect(vi.mocked(api.get).mock.calls.map(([url]) => url)).toContain(
    '/api/shop/products?admin=0&p=1&page_size=100'
  )
  expect(
    vi.mocked(api.get).mock.calls.some(([url]) => url.includes('/public/'))
  ).toBe(false)
})

test('when a member signs out, the account balance disappears and the public catalog is shown', async () => {
  signIn()
  await openStore()
  act(() => useAuthStore.getState().auth.reset())
  await screen.findByText('Browse freely. Sign in when you are ready to buy.')
  expect(screen.queryByText('Available balance')).not.toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: product.benefit.name })
  ).toBeVisible()
})
