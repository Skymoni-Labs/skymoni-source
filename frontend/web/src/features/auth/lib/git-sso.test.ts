import { describe, expect, it } from 'vitest'
import { safeGitCallback } from './git-sso'

describe('Git login return URL', () => {
  it('allows only the configured Git OAuth callback with code and state', () => {
    const url = 'https://git.skymoni.com:9443/class-git/user/oauth2/skymoni/callback?code=one-use&state=browser-state'
    expect(safeGitCallback(url)).toBe(url)
  })
  it.each([
    'https://evil.example/callback?code=x&state=y',
    '//git.skymoni.com:9443/class-git/user/oauth2/skymoni/callback?code=x&state=y',
    'https://git.skymoni.com:9443/class-git/user/oauth2/skymoni/callback?code=x',
    'https://git.skymoni.com:9443/class-git/user/oauth2/skymoni/callback?code=x&state=y&redirect=https://evil.example',
    'https://user:password@git.skymoni.com:9443/class-git/user/oauth2/skymoni/callback?code=x&state=y',
  ])('rejects an untrusted or incomplete callback: %s', value => {
    expect(safeGitCallback(value)).toBeNull()
  })
})
