import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useAuthStore, type AuthBundle } from '@/stores/auth-store'
const post = vi.hoisted(() => vi.fn())
vi.mock('axios', async () => {
  const original = await vi.importActual<typeof import('axios')>('axios')
  return {
    ...original,
    default: { ...original.default, create: () => ({ post }) },
  }
})
import { resolveAuthentication } from './auth-session'
const bundle: AuthBundle = {
  access_token: 'test-memory-only',
  token_type: 'Bearer',
  access_expires_at: Math.floor(Date.now() / 1000) + 600,
  user: { id: 2, username: 'member', role: 1 },
  session: {
    sid: 'local-session',
    current: true,
    login_method: 'password',
    ip: '127.0.0.1',
    user_agent: 'test',
    created_at: 1,
    last_active_at: 1,
    expires_at: 9999999999,
  },
}
beforeEach(() => {
  post.mockReset()
  useAuthStore.getState().auth.reset('idle')
  document.cookie = 'new_api_has_session=;Max-Age=0;Path=/'
})
afterEach(() => useAuthStore.getState().auth.reset('idle'))
test('cold community/auth entry recovers a usable refresh cookie even when the hint is missing', async () => {
  post.mockResolvedValue({ status: 200, data: { success: true, data: bundle } })
  expect((await resolveAuthentication()).kind).toBe('authenticated')
  expect(post).toHaveBeenCalledTimes(1)
  expect(useAuthStore.getState().auth.user?.id).toBe(2)
  await resolveAuthentication()
  expect(post).toHaveBeenCalledTimes(1)
})
test('429 is unconfirmed rather than signed out and retry restores the same session without password', async () => {
  post
    .mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 429, data: { message: 'rate limited' } },
    })
    .mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: bundle },
    })
  expect((await resolveAuthentication()).kind).toBe('transient_error')
  expect(useAuthStore.getState().auth.bootstrapState).toBe('idle')
  expect((await resolveAuthentication()).kind).toBe('authenticated')
  expect(useAuthStore.getState().auth.session?.sid).toBe('local-session')
  expect(
    post.mock.calls.every(([path]) => path === '/api/user/auth/refresh')
  ).toBe(true)
})
test('only server-confirmed 401 completes anonymous state; valid memory session does not hit refresh', async () => {
  post.mockRejectedValue({
    isAxiosError: true,
    response: { status: 401, data: {} },
  })
  expect((await resolveAuthentication()).kind).toBe('anonymous')
  expect(useAuthStore.getState().auth.bootstrapState).toBe('complete')
  useAuthStore.getState().auth.setBundle(bundle)
  await resolveAuthentication()
  expect(post).toHaveBeenCalledTimes(1)
})
