import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, getFreshAuthHeaders } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import {
  githubAuthorizationURL,
  githubStart,
  githubCallback,
} from '../github-api'

vi.mock('@/lib/api', () => ({
  api: { request: vi.fn() },
  getFreshAuthHeaders: vi.fn(),
}))
beforeEach(() => {
  useAuthStore.getState().auth.setUser({ id: 5, username: 'creator', role: 1 })
  vi.mocked(getFreshAuthHeaders).mockResolvedValue({
    Authorization: 'Bearer fixture-site-session',
  })
  vi.mocked(api.request).mockResolvedValue({
    data: {
      success: true,
      data: {
        authorizationUrl:
          'https://github.com/login/oauth/authorize?state=fixture',
      },
    },
  })
})
afterEach(() => {
  useAuthStore.getState().auth.reset()
  vi.resetAllMocks()
})
test('start sends the one-use security proof together with the current relay session without automatic auth replay', async () => {
  await githubStart('fixture-proof')
  expect(api.request).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/api/creators/me/github/start',
      method: 'post',
      skipAuthRefresh: true,
      headers: {
        Authorization: 'Bearer fixture-site-session',
        'X-Security-Proof': 'fixture-proof',
      },
    })
  )
})
test('a changed relay account rejects a completed OAuth callback response', async () => {
  vi.mocked(api.request).mockImplementationOnce(async () => {
    useAuthStore.getState().auth.setUser({ id: 6, username: 'other', role: 1 })
    return { data: { success: true, data: { cancelled: false } } }
  })
  await expect(
    githubCallback('fixture-code', 'fixture-state', false)
  ).rejects.toThrow('Creator account changed')
})
test('OAuth navigation permits the GitHub authorization endpoint and rejects lookalike domains or alternate paths', () => {
  expect(
    githubAuthorizationURL(
      'https://github.com/login/oauth/authorize?state=fixture'
    )
  ).toContain('github.com/login/oauth/authorize')
  for (const value of [
    'https://github.com.evil.example/login/oauth/authorize',
    'https://github.com/settings/apps',
    'javascript:alert(1)',
    'https://user:pass@github.com/login/oauth/authorize',
  ]) {
    expect(() => githubAuthorizationURL(value)).toThrow()
  }
})
