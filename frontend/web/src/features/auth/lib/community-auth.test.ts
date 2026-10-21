import { expect, test } from 'vitest'

import {
  isCommunityAuthReturn,
  isCommunityAuthorizationReturn,
  safeCommunityReturn,
} from './community-auth'

test('recognizes only local community return paths', () => {
  for (const path of [
    '/creators',
    '/creators?view=latest',
    '/creators/works/work',
    '/creators#content',
  ]) {
    expect(isCommunityAuthReturn(path)).toBe(true)
  }
  for (const path of [
    undefined,
    '',
    '/dashboard',
    '/creators-fake',
    '//example.test/creators',
    'https://example.test/creators',
  ]) {
    expect(isCommunityAuthReturn(path)).toBe(false)
  }
})

test('authorization return is part of free community sign-up without accepting similar or external paths', () => {
  expect(
    isCommunityAuthorizationReturn('/community-authorize?returnTo=%2Fcreators')
  ).toBe(true)
  expect(
    isCommunityAuthReturn('/community-authorize?returnTo=%2Fcreators')
  ).toBe(true)
  expect(isCommunityAuthReturn('/community-authorize-fake')).toBe(false)
  expect(
    isCommunityAuthReturn('https://elsewhere.test/community-authorize')
  ).toBe(false)
})

test('approval can return only to normalized community destinations', () => {
  expect(safeCommunityReturn('/creators?category=general&view=new')).toBe(
    '/creators?category=general&view=new'
  )
  for (const target of [
    'https://evil.test/creators',
    '//evil.test/creators',
    '/creators/../dashboard',
    '/creators/%2e%2e/dashboard',
    '/creators/%5c../dashboard',
    '/dashboard',
    '/community-authorize',
    '/creators-fake',
    '/creators\n',
  ]) {
    expect(safeCommunityReturn(target)).toBe('/creators')
  }
})
