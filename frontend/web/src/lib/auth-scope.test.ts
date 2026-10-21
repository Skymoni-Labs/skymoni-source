import { afterEach, expect, test } from 'vitest'

import { authStores, type AuthBundle, useAuthStore } from '@/stores/auth-store'

import { setAuthScope, scopeForLocation } from './auth-scope'
import {
  applyAuthBundle,
  clearAuthentication,
  sessionRuntimes,
} from './auth-session'

const bundle = (scope: 'relay' | 'community', id = 4): AuthBundle => ({
  access_token: `${scope}-only`,
  token_type: 'Bearer',
  access_expires_at: Math.floor(Date.now() / 1000) + 600,
  user: { id, username: `account-${id}`, role: 1 },
  session: {
    sid: `${scope}-${id}`,
    current: true,
    login_method: scope === 'community' ? 'community:password' : 'password',
    ip: '',
    user_agent: '',
    created_at: 1,
    last_active_at: 1,
    expires_at: 9999999999,
  },
})
afterEach(() => {
  Object.values(authStores).forEach((store) =>
    store.getState().auth.reset('idle')
  )
  setAuthScope('relay')
  sessionStorage.clear()
})
test('the same account has independent store, access token, and logout state in both modules', () => {
  applyAuthBundle(bundle('relay'), false)
  applyAuthBundle(bundle('community'), false)
  expect(authStores.relay.getState().auth.user?.id).toBe(
    authStores.community.getState().auth.user?.id
  )
  setAuthScope('community')
  expect(useAuthStore.getState().auth.accessToken).toBe('community-only')
  clearAuthentication(false)
  expect(authStores.relay.getState().auth.accessToken).toBe('relay-only')
  expect(authStores.community.getState().auth.user).toBeNull()
  applyAuthBundle(bundle('community'), false)
  setAuthScope('relay')
  clearAuthentication(false)
  expect(authStores.community.getState().auth.accessToken).toBe(
    'community-only'
  )
})
test('a delayed community bundle cannot replace the relay identity or token', () => {
  setAuthScope('relay')
  applyAuthBundle(bundle('relay', 4), false)
  applyAuthBundle(bundle('community', 9), false)
  expect(useAuthStore.getState().auth.user?.id).toBe(4)
  expect(authStores.community.getState().auth.user?.id).toBe(9)
})
test('each scope resolves only its own memory session', async () => {
  applyAuthBundle(bundle('relay'), false)
  authStores.community.getState().auth.reset('complete')
  expect((await sessionRuntimes.community.resolveAuthentication()).kind).toBe(
    'anonymous'
  )
  expect((await sessionRuntimes.relay.resolveAuthentication()).kind).toBe(
    'authenticated'
  )
})
test('community forms and OAuth callbacks use community scope while relay authorization uses relay scope', () => {
  expect(scopeForLocation('/creators/projects')).toBe('community')
  expect(scopeForLocation('/sign-in', '?redirect=%2Fcreators%2Fnew')).toBe(
    'community'
  )
  expect(
    scopeForLocation(
      '/sign-in',
      '?redirect=%2Fcommunity-authorize%3FreturnTo%3D%252Fcreators'
    )
  ).toBe('relay')
  expect(scopeForLocation('/community-authorize')).toBe('relay')
  sessionStorage.setItem('oauth_login_redirect:abc', '/creators/new')
  expect(scopeForLocation('/oauth/github', '?state=abc')).toBe('community')
  expect(scopeForLocation('/oauth/github', '?state=unknown')).toBe('relay')
})
