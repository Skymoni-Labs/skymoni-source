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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

import { PublicStorePreview } from '..'
import { publicPreviewData } from '../catalog'

let client: QueryClient
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  useAuthStore.getState().auth.reset()
  window.history.replaceState(null, '', '/shop')
})
afterEach(() => {
  vi.unstubAllGlobals()
  client?.clear()
  useAuthStore.getState().auth.reset()
  window.history.replaceState(null, '', '/')
})

async function openStore() {
  client = new QueryClient({ defaultOptions: { queries: { enabled: false } } })
  client.setQueryData(STATUS_QUERY_KEY, {})
  client.setQueryData(['notice'], { success: true, data: '' })
  const root = createRootRoute({ component: Outlet })
  const store = createRoute({
    getParentRoute: () => root,
    path: '/shop',
    component: PublicStorePreview,
  })
  const router = createRouter({
    routeTree: root.addChildren([store]),
    history: createMemoryHistory({ initialEntries: ['/shop'] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('heading', { name: 'Curated digital goods' })
}

describe('anonymous local storefront', () => {
  test('the header store link opens the public catalog without a login prompt', async () => {
    const user = userEvent.setup()
    await openStore()
    const links = screen.getAllByRole('link', { name: 'Store' })
    expect(links[0]).toHaveAttribute('href', '/shop')
    await user.click(links[0])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Curated digital goods' })
    ).toBeVisible()
    expect(useAuthStore.getState().auth.user).toBeNull()
  })

  test('opening the public catalog shows products without exposing an account balance', async () => {
    await openStore()
    for (const product of publicPreviewData.products) {
      expect(
        screen.getByRole('heading', { name: product.benefit.name })
      ).toBeVisible()
    }
    expect(screen.queryByText('Available balance')).not.toBeInTheDocument()
    expect(useAuthStore.getState().auth.user).toBeNull()
  })

  test('a guest can search and filter product categories before signing in', async () => {
    const user = userEvent.setup()
    await openStore()
    const search = screen.getByRole('textbox', { name: 'Search products' })
    await user.type(search, 'Muse')
    expect(screen.getByRole('heading', { name: 'Muse 账号' })).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Drip 浏览器套餐' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '邮箱服务' }))
    expect(screen.getByText('No matching products')).toBeVisible()
    await user.clear(search)
    expect(
      screen.getByRole('heading', { name: 'skymoni 邮箱注册邀请码' })
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Muse 账号' })
    ).not.toBeInTheDocument()
  })

  test('a guest can select a package and is directed to sign in before purchase', async () => {
    const user = userEvent.setup()
    await openStore()
    const card = screen
      .getByRole('heading', { name: 'Drip 浏览器套餐' })
      .closest('article')
    if (!card) throw new Error('Missing product card')
    await user.click(within(card).getByRole('button', { name: 'Details' }))
    const detail = screen.getByRole('dialog')
    await user.click(within(detail).getByRole('radio', { name: /200 GiB/ }))
    expect(within(detail).getByRole('radio', { name: /200 GiB/ })).toBeChecked()
    const footer = detail.querySelector('[data-slot="dialog-footer"]')
    if (!footer) throw new Error('Missing detail footer')
    expect(within(footer as HTMLElement).getByText('360')).toBeVisible()
    await user.click(
      within(detail).getByRole('button', { name: 'Sign in to buy' })
    )
    const login = screen.getByRole('dialog', { name: 'Sign in to continue' })
    expect(
      within(login).getByRole('link', { name: 'Go to sign in' })
    ).toHaveAttribute('href', 'https://skymoni.com/sign-in?redirect=%2Fstore')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(
      within(login).getByRole('button', { name: 'Keep browsing' })
    )
    expect(
      screen.getByRole('heading', { name: 'Curated digital goods' })
    ).toBeVisible()
    expect(useAuthStore.getState().auth.user).toBeNull()
  })
})
