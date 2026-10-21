export type AuthScope = 'relay' | 'community'
let active: AuthScope = 'relay'
const listeners = new Set<() => void>()
export const getAuthScope = () => active
export function setAuthScope(scope: AuthScope) {
  if (scope === active) return false
  active = scope
  listeners.forEach((listener) => listener())
  return true
}
export const subscribeAuthScope = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function scopeForLocation(pathname: string, search = ''): AuthScope {
  if (pathname === '/creators' || pathname.startsWith('/creators/')) {
    return 'community'
  }
  const params = new URLSearchParams(search)
  if (['/sign-in', '/sign-up', '/forgot-password'].includes(pathname)) {
    const target = params.get('redirect') ?? ''
    return /^\/creators(?:[/?#]|$)/.test(target) ? 'community' : 'relay'
  }
  if (pathname.startsWith('/oauth/')) {
    try {
      const state = params.get('state') ?? ''
      const target =
        sessionStorage.getItem(`oauth_login_redirect:${state}`) ?? ''
      return /^\/creators(?:[/?#]|$)/.test(target) ? 'community' : 'relay'
    } catch {
      return 'relay'
    }
  }
  if (pathname === '/otp') return active
  return 'relay'
}
