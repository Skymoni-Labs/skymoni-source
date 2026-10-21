const callbackPaths = new Set([
  'https://git.skymoni.com/class-git/user/oauth2/skymoni/callback',
  'https://git.skymoni.com:9443/class-git/user/oauth2/skymoni/callback',
  'https://skymoni.com/class-git/user/oauth2/skymoni/callback',
  'https://210.126.232.60:9443/class-git/user/oauth2/skymoni/callback',
])

export function isGitRegistrationReturn(value: string | undefined): boolean {
  if (!value || !value.startsWith('/git-authorize?')) return false
  try {
    const url = new URL(value, 'https://skymoni.com')
    return url.origin === 'https://skymoni.com' && url.pathname === '/git-authorize' &&
      /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('request') ?? '')
  } catch {
    return false
  }
}

export function safeGitCallback(value: unknown): string | null {
  if (typeof value !== 'string' || value.includes('\\')) return null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hash) return null
    if (!callbackPaths.has(`${url.origin}${url.pathname}`)) return null
    if (!url.searchParams.get('state')) return null
    if (!url.searchParams.get('code') && !url.searchParams.get('error')) return null
    if ([...url.searchParams.keys()].some(k => !['state', 'code', 'error'].includes(k))) return null
    return url.href
  } catch {
    return null
  }
}
