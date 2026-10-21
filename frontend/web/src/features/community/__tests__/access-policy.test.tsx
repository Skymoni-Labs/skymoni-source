import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { setAuthScope } from '@/lib/auth-scope'
import { authStores } from '@/stores/auth-store'

import { CommunityAccessManagement } from '../access-policy'
vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), put: vi.fn() } }))
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})
const policy = { redemptionRequired: false, inviteRequired: false, revision: 3 }
function show() {
  render(
    <QueryClientProvider client={client}>
      <CommunityAccessManagement />
    </QueryClientProvider>
  )
}
beforeEach(() => {
  setAuthScope('community')
  authStores.community
    .getState()
    .auth.setUser({ id: 1, username: 'admin', role: 100 })
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { policy, invites: [] } },
  })
  vi.mocked(api.put).mockResolvedValue({
    data: { success: true, data: { ...policy, revision: 4 } },
  })
})
afterEach(() => {
  client.clear()
  authStores.community.getState().auth.reset('idle')
  setAuthScope('relay')
})
test('free defaults are visible and each switch preserves the other setting and revision', async () => {
  show()
  const redemption = await screen.findByRole('switch', {
    name: '兑换额度后开通社区',
  })
  expect(redemption).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByRole('switch', { name: '社区邀请码' })).toHaveAttribute(
    'aria-checked',
    'false'
  )
  await userEvent.click(redemption)
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(
      '/api/creators/community-access',
      expect.objectContaining({
        action: 'policy',
        redemptionRequired: true,
        inviteRequired: false,
        revision: 3,
      }),
      expect.anything()
    )
  )
})
test('a regular member cannot load or render admission management', () => {
  authStores.community
    .getState()
    .auth.setUser({ id: 2, username: 'member', role: 1 })
  show()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  expect(api.get).not.toHaveBeenCalled()
})
