import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { setAuthScope } from '@/lib/auth-scope'
import { authStores, type AuthBundle } from '@/stores/auth-store'

import { CommunityAuthorization } from '../community-authorization'
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({
    to,
    search,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string
    search?: Record<string, string>
    children?: ReactNode
  }) => (
    <a href={to + (search ? '?' + new URLSearchParams(search) : '')} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
  getFreshAuthHeaders: async () => ({ Authorization: 'Bearer relay-only' }),
}))
const bundle: AuthBundle = {
  access_token: 'community-only',
  token_type: 'Bearer',
  access_expires_at: 9999999999,
  user: { id: 2, username: 'relay-member', display_name: '站点昵称', role: 1 },
  session: {
    sid: 'community-session',
    current: true,
    login_method: 'community:relay-authorization',
    ip: '',
    user_agent: '',
    created_at: 1,
    last_active_at: 1,
    expires_at: 9999999999,
  },
}
const clients: QueryClient[] = []
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <CommunityAuthorization returnTo='/creators?category=general' />
    </QueryClientProvider>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  setAuthScope('relay')
  authStores.relay
    .getState()
    .auth.setBundle({
      ...bundle,
      access_token: 'relay-only',
      session: {
        ...bundle.session,
        sid: 'relay-session',
        login_method: 'password',
      },
    })
  authStores.community.getState().auth.reset('idle')
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: { redemptionRequired: false, inviteRequired: false, revision: 1 },
    },
  })
  vi.mocked(api.post).mockResolvedValue({
    data: {
      success: true,
      data: { returnTo: '/creators?category=general', bundle },
    },
  })
})
afterEach(() => {
  Object.values(authStores).forEach((store) =>
    store.getState().auth.reset('idle')
  )
  clients.splice(0).forEach((client) => client.clear())
})
test('relay approval installs a separate community session while preserving the relay token', async () => {
  show()
  expect(screen.getByText('站点昵称')).toBeVisible()
  expect(screen.queryByLabelText('密码')).not.toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: '确认授权并进入社区' })
  )
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith({
      href: '/creators?category=general',
      replace: true,
    })
  )
  expect(api.post).toHaveBeenCalledWith(
    '/api/user/community/authorize',
    expect.objectContaining({ approved: true, userId: 2 }),
    expect.objectContaining({ authScope: 'relay' })
  )
  expect(authStores.relay.getState().auth.accessToken).toBe('relay-only')
  expect(authStores.community.getState().auth.accessToken).toBe(
    'community-only'
  )
})
test('anonymous confirmation returns through relay login instead of silently creating a session', () => {
  authStores.relay.getState().auth.reset('idle')
  show()
  expect(
    screen.getByRole('link', { name: '登录中转站并继续' }).getAttribute('href')
  ).toContain('/sign-in?redirect=%2Fcommunity-authorize')
  expect(api.post).not.toHaveBeenCalled()
})
test('an approval error preserves both the existing relay identity and the confirmation', async () => {
  vi.mocked(api.post).mockRejectedValue(new Error('temporary error'))
  show()
  await userEvent.click(
    screen.getByRole('button', { name: '确认授权并进入社区' })
  )
  await screen.findByRole('alert')
  expect(authStores.relay.getState().auth.accessToken).toBe('relay-only')
  expect(authStores.community.getState().auth.user).toBeNull()
  expect(navigate).not.toHaveBeenCalled()
})
