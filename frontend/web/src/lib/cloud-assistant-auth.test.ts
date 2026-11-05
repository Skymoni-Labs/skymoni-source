import { afterEach, expect, test, vi } from 'vitest'

import { useAuthStore as community } from '@/stores/community-auth-store'
import { useAuthStore as relay } from '@/stores/relay-auth-store'

import { setAuthScope } from './auth-scope'
import { getFreshAuthHeaders, resolveAuthentication } from './auth-session'
import { installCloudAssistantAuth } from './cloud-assistant-auth'

vi.mock('./auth-session', () => ({
  resolveAuthentication: vi.fn(),
  getFreshAuthHeaders: vi.fn(),
}))
let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  relay.getState().auth.reset()
  community.getState().auth.reset()
  setAuthScope('relay')
  vi.resetAllMocks()
})
test('anonymous and temporary authentication failures do not expose credentials', async () => {
  cleanup = installCloudAssistantAuth()
  vi.mocked(resolveAuthentication).mockResolvedValue({ kind: 'anonymous' })
  expect(await window.skymoniCloudAssistantAuth?.resolve()).toEqual({
    kind: 'anonymous',
  })
  vi.mocked(resolveAuthentication).mockRejectedValue(
    new Error('temporarily offline')
  )
  expect(await window.skymoniCloudAssistantAuth?.resolve()).toEqual({
    kind: 'unavailable',
  })
  expect(getFreshAuthHeaders).not.toHaveBeenCalled()
})
test('uses fresh login credentials in the current scope and signals logout without tokens', async () => {
  setAuthScope('community')
  const bundle = {
    access_token: 'session-secret',
    token_type: 'Bearer',
    access_expires_at: 9999999999,
    user: { id: 7, username: 'test', role: 1 },
    session: {
      sid: 'sid',
      current: true,
      login_method: 'community:password',
      ip: '',
      user_agent: '',
      created_at: 1,
      last_active_at: 1,
      expires_at: 9999999999,
    },
  }
  community.getState().auth.setBundle(bundle)
  vi.mocked(resolveAuthentication).mockResolvedValue({
    kind: 'authenticated',
    bundle,
  })
  vi.mocked(getFreshAuthHeaders).mockResolvedValue({
    Authorization: 'Bearer refreshed-session',
  })
  cleanup = installCloudAssistantAuth()
  const result = await window.skymoniCloudAssistantAuth?.resolve()
  expect(result).toEqual({
    kind: 'authenticated',
    identity: 'community:7',
    headers: {
      Authorization: 'Bearer refreshed-session',
      'X-Skymoni-Auth-Scope': 'community',
    },
  })
  const listener = vi.fn()
  window.addEventListener('skymoni:cloud-auth-change', listener)
  community.getState().auth.reset()
  expect(listener).toHaveBeenCalledTimes(1)
  expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe('')
  window.removeEventListener('skymoni:cloud-auth-change', listener)
})
