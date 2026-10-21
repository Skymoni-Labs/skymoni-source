import type { AxiosRequestConfig } from 'axios'

import { api, getFreshAuthHeaders } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import {
  accountIdentity,
  loadSiteIdentities,
  saveAccountIdentity,
} from '@/lib/site-identity'
import { useAuthStore } from '@/stores/auth-store'

import type { CreatorProfile, CreatorRelease } from './lib/hub'
import {
  defaultShowcaseLayout,
  type ShowcaseLayout,
} from './lib/showcase-layout'
import type { Work } from './types'

export type CreatorFile = { id: string; name: string; size: number }
export type CreatorMe = {
  manuallyGranted?: boolean
  autoApproveWorks?: boolean
  mode: 'member' | 'eligible' | 'creator'
  suspended: boolean
  termsVersion: string
  member: { profile: CreatorProfile; pinned: string[]; saved: string[] }
  works: Work[]
  releases: CreatorRelease[]
  files: CreatorFile[]
}
export async function creatorRequest<T>(
  path: string,
  options: AxiosRequestConfig = {}
): Promise<T> {
  const auth = useAuthStore.getState().auth
  const actor = `${auth.user?.id}:${auth.session?.sid}`
  const check = () => {
    const current = useAuthStore.getState().auth
    if (
      !auth.user ||
      options.signal?.aborted ||
      `${current.user?.id}:${current.session?.sid}` !== actor
    ) {
      throw new DOMException('Creator account changed', 'AbortError')
    }
  }
  check()
  const headers = await getFreshAuthHeaders()
  check()
  const response = await api.request<{ success: boolean; data: T }>({
    ...options,
    url: `/api/creators${path}`,
    headers: {
      ...headers,
      ...options.headers,
      ...(options.data instanceof FormData ? { 'Content-Type': null } : {}),
    },
    disableDuplicate: true,
    skipErrorHandler: true,
    skipAuthRefresh: true,
  })
  check()
  const data = requireServerSuccess(response.data).data
  return syncOwnCreator(data)
}

function syncOwnCreator<T>(value: T): T {
  const user = useAuthStore.getState().auth.user
  const me = value as CreatorMe | undefined
  if (!user || !me?.member?.profile) return value
  const identity = accountIdentity(user)
  return {
    ...me,
    member: {
      ...me.member,
      profile: {
        ...me.member.profile,
        name: identity.name,
        avatar: identity.avatar,
      },
    },
    works: me.works.map((work) => ({ ...work, author: identity.name })),
  } as T
}

async function syncWorks(works: Work[], signal?: AbortSignal) {
  const identities = await loadSiteIdentities(
    works.filter((work) => !work.sample).map((work) => work.ownerId ?? 0),
    signal
  )
  return works.map((work) =>
    !work.sample && identities[work.ownerId ?? 0]
      ? { ...work, author: identities[work.ownerId ?? 0].name }
      : work
  )
}
export async function loadCreatorWorks(signal?: AbortSignal): Promise<Work[]> {
  const response = await api.get<{ success: boolean; data: Work[] }>(
    '/api/creators/public?view=cards',
    { signal, skipAuthRefresh: true, skipErrorHandler: true }
  )
  return syncWorks(requireServerSuccess(response.data).data, signal)
}
export async function loadCreatorGallery(signal?: AbortSignal) {
  const response = await api.get<{
    success: boolean
    data: Work[]
    showcase?: ShowcaseLayout
  }>('/api/creators/public?view=cards', {
    signal,
    skipAuthRefresh: true,
    skipErrorHandler: true,
  })
  const result = requireServerSuccess(response.data)
  return {
    works: await syncWorks(result.data, signal),
    showcase: result.showcase ?? defaultShowcaseLayout(),
  }
}
export async function loadCreatorWork(id: string, signal?: AbortSignal) {
  const response = await api.get<{
    success: boolean
    data: { work: Work; releases: CreatorRelease[] }
  }>(`/api/creators/public/${encodeURIComponent(id)}`, {
    signal,
    skipAuthRefresh: true,
    skipErrorHandler: true,
  })
  const result = requireServerSuccess(response.data).data
  return { ...result, work: (await syncWorks([result.work], signal))[0] }
}
export const loadCreatorMe = (signal?: AbortSignal) =>
  creatorRequest<CreatorMe>('/me', { signal })
export type PublicCreatorProfile = {
  userId: number
  profile: CreatorProfile
  avatar: string
  pinned: string[]
  works: Work[]
}
export async function loadPublicCreatorProfile(
  id: number,
  signal?: AbortSignal
) {
  const response = await api.get<{
    success: boolean
    data: PublicCreatorProfile
  }>(`/api/creators/people/${id}?view=cards`, {
    signal,
    skipAuthRefresh: true,
    skipErrorHandler: true,
  })
  const result = requireServerSuccess(response.data).data
  const identity = (await loadSiteIdentities([id], signal))[id]
  return identity
    ? {
        ...result,
        avatar: identity.avatar,
        profile: {
          ...result.profile,
          name: identity.name,
          avatar: identity.avatar,
        },
        works: result.works.map((work) => ({ ...work, author: identity.name })),
      }
    : result
}
export const saveCreatorProfile = async (
  profile: CreatorProfile,
  pinned: string[],
  saved: string[]
) => {
  const me = await creatorRequest<CreatorMe>('/me/profile', {
    method: 'put',
    data: { profile, pinned, saved },
  })
  await saveAccountIdentity({
    name: profile.name,
    avatar: profile.avatar ?? '',
  })
  return syncOwnCreator(me)
}
