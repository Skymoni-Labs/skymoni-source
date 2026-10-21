import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import { useCreatorAccessStore } from '@/stores/creator-access-store'

import { CreatorAccessGate } from '../access'
import { watchCreatorAccess, type CreatorLiveAccess } from '../live-access'
import { CreatorRuntime } from '../runtime'

vi.mock('../live-access', () => ({ watchCreatorAccess: vi.fn() }))
vi.mock('../api', () => ({
  creatorRequest: vi.fn(),
  loadCreatorGallery: async () => ({ works: [], showcase: {} }),
  loadCreatorMe: async () => ({
    mode: 'creator',
    suspended: false,
    member: {
      profile: { name: 'Maker', handle: 'maker' },
      pinned: [],
      saved: [],
    },
    works: [],
    releases: [],
    files: [],
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

let client: QueryClient
afterEach(() => {
  cleanup()
  client?.clear()
  useAuthStore.getState().auth.reset()
  useCreatorAccessStore.getState().hydrate(null)
})

test('an open editor closes on live ban, resists stale profile responses and reopens on unban without logout', async () => {
  let deliver: ((value: CreatorLiveAccess) => void) | undefined
  vi.mocked(watchCreatorAccess)
    .mockImplementationOnce(async () => ({
      status: 'active',
      suspended: false,
    }))
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          deliver = resolve
        })
    )
  const now = Math.floor(Date.now() / 1000)
  useAuthStore.getState().auth.setBundle({
    access_token: 'local-token',
    token_type: 'Bearer',
    access_expires_at: now + 900,
    user: { id: 901, username: 'maker', role: 1 },
    session: {
      sid: 'logged-in-before-ban',
      current: true,
      login_method: 'community:password',
      ip: '127.0.0.1',
      user_agent: 'test',
      created_at: now,
      last_active_at: now,
      expires_at: now + 3600,
    },
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CreatorRuntime>
        <CreatorAccessGate>
          <h1>作品编辑区域</h1>
        </CreatorAccessGate>
      </CreatorRuntime>
    </QueryClientProvider>
  )
  await screen.findByRole('heading', { name: '作品编辑区域' })
  await waitFor(() => expect(watchCreatorAccess).toHaveBeenCalledTimes(2))
  await act(async () => deliver?.({ status: 'suspended', suspended: true }))
  await screen.findByRole('heading', { name: '创作者身份已被封禁' })
  expect(
    screen.queryByRole('heading', { name: '作品编辑区域' })
  ).not.toBeInTheDocument()
  expect(useAuthStore.getState().auth.session?.sid).toBe('logged-in-before-ban')
  await waitFor(() => expect(watchCreatorAccess).toHaveBeenCalledTimes(3))
  expect(useCreatorAccessStore.getState().suspended).toBe(true)
  await act(async () => deliver?.({ status: 'active', suspended: false }))
  await screen.findByRole('heading', { name: '作品编辑区域' })
  expect(useAuthStore.getState().auth.user?.id).toBe(901)
})
