import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import type { User } from '../types'
import { UserCreatorCell } from './user-creator-cell'

const fixture = vi.hoisted(() => ({
  root: true,
  request: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: { role: fixture.root ? 100 : 10 } } }),
}))
vi.mock('./users-provider', () => ({
  useUsers: () => ({ triggerRefresh: fixture.refresh }),
}))
vi.mock('@/features/creator-center/api', () => ({
  creatorRequest: fixture.request,
}))
vi.mock('@/lib/handle-server-error', () => ({
  handleServerError: fixture.error,
}))

const user: User = {
  id: 123,
  username: 'sample-user',
  display_name: 'Sample',
  quota: 0,
  used_quota: 0,
  request_count: 0,
  group: 'default',
  role: 1,
  status: 1,
  creator_status: 'none',
}
beforeEach(() => {
  fixture.root = true
  fixture.request.mockReset().mockResolvedValue({ status: 'authorized' })
  fixture.refresh.mockClear()
  fixture.error.mockClear()
})
afterEach(cleanup)
async function view(change: Partial<User> = {}) {
  const i18n = createInstance()
  await i18n.init({ lng: 'zh', resources: { zh } })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nextProvider i18n={i18n}>
        <UserCreatorCell user={{ ...user, ...change }} />
      </I18nextProvider>
    </QueryClientProvider>
  )
}
test('opening the named confirmation does not grant; confirming targets the right ID and refreshes', async () => {
  await view()
  const click = userEvent.setup()
  await click.click(
    screen.getByRole('button', { name: '为 sample-user 开通创作者' })
  )
  expect(screen.getByRole('alertdialog')).toHaveTextContent('ID 123')
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    '用户仍需自己填写资料'
  )
  expect(fixture.request).not.toHaveBeenCalled()
  await click.click(screen.getByRole('button', { name: '确认授权' }))
  await waitFor(() => expect(fixture.refresh).toHaveBeenCalledOnce())
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith(
    '/admin/users/123/grant',
    { method: 'post' }
  )
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})
test('failed grants keep the confirmation open and do not show a changed status', async () => {
  fixture.request.mockRejectedValue(new Error('Permission changed'))
  await view()
  const click = userEvent.setup()
  await click.click(
    screen.getByRole('button', { name: '为 sample-user 开通创作者' })
  )
  await click.click(screen.getByRole('button', { name: '确认授权' }))
  await waitFor(() => expect(fixture.error).toHaveBeenCalledOnce())
  expect(fixture.refresh).not.toHaveBeenCalled()
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  expect(screen.getByText('未开通')).toBeInTheDocument()
})
test('delegated admins only see the status; already granted, disabled and unknown states have no grant button', async () => {
  fixture.root = false
  await view()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  cleanup()
  fixture.root = true
  for (const change of [
    { creator_status: undefined },
    { status: 2 },
    { DeletedAt: '2026-10-09' },
  ]) {
    await view(change)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    cleanup()
  }
})

test('active creators can be banned separately from their shared site account', async () => {
  await view({ creator_status: 'active' })
  await userEvent.click(
    screen.getByRole('button', { name: '封禁 sample-user 的创作者身份' })
  )
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    '普通社区交流和中转站账号不受影响'
  )
  await userEvent.click(screen.getByRole('button', { name: '确认封禁创作者' }))
  await waitFor(() => expect(fixture.refresh).toHaveBeenCalledOnce())
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith(
    '/admin/users/123/status',
    { method: 'put', data: { suspended: true, expectedStatus: 'active' } }
  )
})

test('suspended creators have an explicit unban action that retains their previous qualification', async () => {
  await view({ creator_status: 'suspended' })
  await userEvent.click(
    screen.getByRole('button', { name: '解除封禁 sample-user 的创作者身份' })
  )
  await userEvent.click(screen.getByRole('button', { name: '确认解除封禁' }))
  await waitFor(() => expect(fixture.refresh).toHaveBeenCalledOnce())
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith(
    '/admin/users/123/status',
    { method: 'put', data: { suspended: false, expectedStatus: 'suspended' } }
  )
})
