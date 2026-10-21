import { resolveAuthentication } from '@/lib/auth-session'

export class AuthSessionUnavailableError extends Error {
  constructor(public readonly retryAt = Date.now() + 5000) {
    super('Authentication recovery is temporarily unavailable')
    this.name = 'AuthSessionUnavailableError'
  }
}
export async function resolveRouteAuthentication() {
  const result = await resolveAuthentication()
  if (result.kind === 'transient_error' || result.kind === 'out_of_sync') {
    throw new AuthSessionUnavailableError(
      result.kind === 'transient_error' ? result.retryAt : undefined
    )
  }
  return result
}
