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
import { cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test } from 'vitest'

import {
  parseHeaderNavModules,
  serializeHeaderNavModules,
} from '@/features/system-settings/maintenance/config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

const clients: QueryClient[] = []

function readLinks(modules: Record<string, unknown>, docsLink?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  client.setQueryData(STATUS_QUERY_KEY, {
    HeaderNavModules: JSON.stringify(modules),
    docs_link: docsLink,
  })
  return renderHook(() => useTopNavLinks(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  useAuthStore.getState().auth.setUser(null)
})

describe('store top navigation', () => {
  test('creator platform remains public and opens as a separate destination', () => {
    const { result } = readLinks({})
    expect(
      result.current.find((link) => link.href === '/creators')
    ).toMatchObject({
      title: 'skymoni Community',
      external: true,
      requiresAuth: false,
    })
  })
  test.each([undefined, 'https://example.com/docs'])(
    'removes Docs even when enabled with an external link %s',
    (docsLink) => {
      const { result } = readLinks({ docs: true }, docsLink)
      expect(result.current.some((link) => link.title === 'Docs')).toBe(false)
      expect(result.current.some((link) => link.href === '/about')).toBe(true)
    }
  )
  test('App keeps its original independent download navigation', () => {
    const { result } = readLinks({})
    expect(result.current.find((link) => link.href === '/app')).toMatchObject({
      title: 'Download App',
      disabled: false,
    })
  })
  test('a saved disabled Software Center setting hides the entry and survives serialization', () => {
    const saved = serializeHeaderNavModules(
      parseHeaderNavModules('{"software":false}')
    )
    const { result } = readLinks(JSON.parse(saved))
    expect(parseHeaderNavModules(saved).software).toBe(false)
    expect(result.current.some((link) => link.href === '/software')).toBe(false)
  })
  test('Software Center is public for visitors', () => {
    const { result } = readLinks({})
    expect(
      result.current.find((link) => link.href === '/software')
    ).toMatchObject({
      title: 'Software Center',
      requiresAuth: false,
    })
  })
  test('old navigation settings show Store immediately after Model Square', () => {
    const { result } = readLinks({ pricing: true, rankings: true })
    expect(result.current.map((link) => link.href)).toEqual([
      '/',
      '/dashboard',
      '/pricing',
      '/store',
      '/software',
      'https://git.skymoni.com/class-git/',
      '/creators',
      '/rankings',
      '/app',
      '/docs',
      '/about',
    ])
  })

  test('a guest can open the public Store entry without a login prompt', () => {
    const { result } = readLinks({})
    expect(
      result.current.find((link) => link.href === '/store')?.requiresAuth
    ).toBe(false)
  })

  test('a signed-in user can navigate directly to Store', () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'shop-user', role: 1 })
    const { result } = readLinks({})
    expect(
      result.current.find((link) => link.href === '/store')?.requiresAuth
    ).toBe(false)
  })

  test('a saved disabled Store setting hides the entry and survives serialization', () => {
    const config = parseHeaderNavModules('{"store":false,"pricing":true}')
    const saved = serializeHeaderNavModules(config)
    expect(parseHeaderNavModules(saved).store).toBe(false)
    const { result } = readLinks(JSON.parse(saved))
    expect(result.current.some((link) => link.href === '/store')).toBe(false)
  })
})
