import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import { AppAccountAuthorization } from './authorize'

const fixture = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ api: { get: fixture.get, post: fixture.post } }))
vi.mock('@/lib/handle-server-error', () => ({
  handleServerError: fixture.error,
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({
      auth: {
        user: { id: 31, username: 'ordinary-user' },
        session: { sid: 'browser-session' },
      },
    }),
}))
const i18n = createInstance()
await i18n.init({ lng: 'zh', resources: { en, zh } })
beforeEach(() => {
  fixture.get.mockReset()
  fixture.post.mockReset()
  fixture.error.mockReset()
  fixture.get.mockResolvedValue({
    data: {
      success: true,
      data: {
        user_code: 'abcdefghijklmnop',
        device_name: '我的手机',
        state: 'pending',
        expires_at: 2000000000,
      },
    },
  })
  fixture.post.mockResolvedValue({ data: { success: true, data: null } })
})
afterEach(cleanup)
function view() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <I18nextProvider i18n={i18n}>
        <AppAccountAuthorization initialCode='abcdefghijklmnop' />
      </I18nextProvider>
    </QueryClientProvider>
  )
}
test('authorization requires matching-own-phone confirmation and sends only the decision', async () => {
  view()
  const click = userEvent.setup()
  const allow = await screen.findByRole('button', { name: '允许登录 Skivu' })
  expect(allow).toBeDisabled()
  expect(
    screen.getByText(/聊天按你已有的中转钱包或订阅计费/)
  ).toBeInTheDocument()
  await click.click(screen.getByRole('checkbox'))
  await click.click(allow)
  await screen.findByText('已确认授权，请返回 App 完成登录。')
  expect(fixture.post).toHaveBeenCalledExactlyOnceWith(
    '/api/app-account/authorization',
    { user_code: 'abcdefghijklmnop', decision: 'approve' },
    { skipErrorHandler: true }
  )
})
test('users can deny a request without granting access', async () => {
  view()
  const click = userEvent.setup()
  await click.click(await screen.findByRole('button', { name: '拒绝' }))
  await screen.findByText('已拒绝授权，可以关闭本页。')
  expect(fixture.post).toHaveBeenCalledWith(
    '/api/app-account/authorization',
    expect.objectContaining({ decision: 'deny' }),
    expect.anything()
  )
})
test('expired or invalid requests do not offer an approval action', async () => {
  fixture.get.mockRejectedValue(new Error('expired'))
  view()
  await screen.findByRole('alert')
  expect(
    screen.queryByRole('button', { name: '允许登录 Skivu' })
  ).not.toBeInTheDocument()
  await waitFor(() => expect(fixture.post).not.toHaveBeenCalled())
})
