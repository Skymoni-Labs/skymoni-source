/** Community membership uses the existing site account and remains free. */
export function isCommunityAuthorizationReturn(
  target?: string | null
): boolean {
  return Boolean(target && /^\/community-authorize(?:[?#]|$)/.test(target))
}
export function isCommunityAuthReturn(target?: string | null): boolean {
  return (
    Boolean(target && /^\/creators(?:[/?#]|$)/.test(target)) ||
    isCommunityAuthorizationReturn(target)
  )
}
export function safeCommunityReturn(target?: string | null): string {
  if (
    !target ||
    target.length > 1000 ||
    target.includes('\\') ||
    [...target].some((char) => char.charCodeAt(0) <= 32) ||
    !/^\/creators(?:[/?#]|$)/.test(target)
  ) {
    return '/creators'
  }
  try {
    const url = new URL(target, 'https://skymoni.com')
    const path = decodeURIComponent(url.pathname)
    if (
      path.includes('\\') ||
      [...path].some((char) => char.charCodeAt(0) <= 32)
    ) {
      return '/creators'
    }
    const normalized = new URL(path, 'https://skymoni.com')
    if (
      url.origin !== 'https://skymoni.com' ||
      normalized.origin !== url.origin ||
      !/^\/creators(?:\/|$)/.test(normalized.pathname)
    ) {
      return '/creators'
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/creators'
  }
}
