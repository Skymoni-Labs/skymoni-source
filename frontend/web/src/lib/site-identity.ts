import { api, getFreshAuthHeaders } from '@/lib/api'
import { userAvatarSource } from '@/lib/avatar'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

export type SiteIdentity = {
  id: number
  name: string
  username: string
  avatar: string
}

export function accountIdentity(user: AuthUser): SiteIdentity {
  const source = userAvatarSource(user.setting)
  return {
    id: user.id,
    name: user.display_name || user.username || '社区成员',
    username: user.username,
    avatar: source === '/skymoni-avatar.png' ? '' : source,
  }
}

export function currentIdentity(identity: SiteIdentity): SiteIdentity {
  const user = useAuthStore.getState().auth.user
  return user?.id === identity.id ? accountIdentity(user) : identity
}

export async function loadSiteIdentities(
  ids: number[],
  signal?: AbortSignal
): Promise<Record<string, SiteIdentity>> {
  const unique = [
    ...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ]
  if (!unique.length) return {}
  const result: Record<string, SiteIdentity> = {}
  for (let start = 0; start < unique.length; start += 100) {
    const response = await api.get<{
      success: boolean
      data: Record<string, SiteIdentity>
    }>('/api/community/identities', {
      params: { ids: unique.slice(start, start + 100).join(',') },
      signal,
      skipErrorHandler: true,
      skipAuthRefresh: true,
    })
    Object.assign(result, requireServerSuccess(response.data).data)
  }
  const user = useAuthStore.getState().auth.user
  if (user && unique.includes(user.id)) result[user.id] = accountIdentity(user)
  return result
}

export function publishSiteProfileUpdate() {
  const user = useAuthStore.getState().auth.user
  if (!user || typeof window === 'undefined') return
  // Only an invalidation signal crosses tabs. Never copy account settings or credentials.
  const event = { userId: user.id, timestamp: Date.now() }
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('skymoni:profile-updated')
    channel.postMessage(event)
    channel.close()
  } else {
    try {
      localStorage.setItem('skymoni:profile-updated', JSON.stringify(event))
      localStorage.removeItem('skymoni:profile-updated')
    } catch {
      /* Storage may be unavailable. */
    }
  }
}

export async function refreshSiteProfile() {
  const auth = useAuthStore.getState().auth
  if (!auth.user) return
  const actor = `${auth.user.id}:${auth.session?.sid}`
  const headers = await getFreshAuthHeaders()
  const response = await api.get<{ success: boolean; data: AuthUser }>(
    '/api/user/self',
    {
      headers,
      skipErrorHandler: true,
      skipAuthRefresh: true,
      disableDuplicate: true,
    }
  )
  const user = requireServerSuccess(response.data).data
  const current = useAuthStore.getState().auth
  if (
    actor !== `${current.user?.id}:${current.session?.sid}` ||
    user.id !== auth.user.id
  ) {
    throw new DOMException('Account changed', 'AbortError')
  }
  current.setUser(user)
  return user
}

export async function saveAccountIdentity(update: {
  name?: string
  avatar?: string
}) {
  const auth = useAuthStore.getState().auth
  if (!auth.user) throw new Error('请先登录')
  const existing = accountIdentity(auth.user)
  if (
    (update.name === undefined || update.name === existing.name) &&
    (update.avatar === undefined || update.avatar === existing.avatar)
  ) {
    return
  }
  if (
    update.name !== undefined &&
    (!update.name.trim() || update.name.length > 20)
  ) {
    throw new Error('显示名称需为 1 至 20 个字符')
  }
  const actor = `${auth.user.id}:${auth.session?.sid}`
  const check = () => {
    const current = useAuthStore.getState().auth
    if (actor !== `${current.user?.id}:${current.session?.sid}`) {
      throw new DOMException('Account changed', 'AbortError')
    }
  }
  const headers = await getFreshAuthHeaders()
  check()
  try {
    if (
      update.name !== undefined &&
      update.name !== accountIdentity(auth.user).name
    ) {
      requireServerSuccess(
        (
          await api.put(
            '/api/user/self',
            { display_name: update.name },
            {
              headers,
              skipErrorHandler: true,
              skipAuthRefresh: true,
              disableDuplicate: true,
            }
          )
        ).data
      )
      check()
    }
    if (
      update.avatar !== undefined &&
      update.avatar !== accountIdentity(auth.user).avatar
    ) {
      requireServerSuccess(
        (
          await api.put(
            '/api/user/self/avatar',
            { avatar: update.avatar },
            {
              headers,
              skipErrorHandler: true,
              skipAuthRefresh: true,
              disableDuplicate: true,
            }
          )
        ).data
      )
      check()
    }
  } finally {
    check()
    await refreshSiteProfile()
    publishSiteProfileUpdate()
  }
}
