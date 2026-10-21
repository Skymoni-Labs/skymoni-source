import type { AxiosRequestConfig } from 'axios'

import { api, getFreshAuthHeaders } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import type { CommunityAdminData, CommunityMeta, CommunityNotification, CommunitySearch, TopicDetail, TopicListing } from './types'

export async function communityRequest<T>(path: string, options: AxiosRequestConfig = {}): Promise<T> {
  const snapshot = useAuthStore.getState().auth
  const actor = `${snapshot.user?.id}:${snapshot.session?.sid}`
  const headers = snapshot.user ? await getFreshAuthHeaders() : {}
  const check = () => {
    const current = useAuthStore.getState().auth
    if (options.signal?.aborted || actor !== `${current.user?.id}:${current.session?.sid}`) {
      throw new DOMException('Community account changed', 'AbortError')
    }
  }
  check()
  const response = await api.request<{ success: boolean; data: T }>({
    ...options, url: `/api/community${path}`, headers: { ...headers, ...options.headers },
    disableDuplicate: true, skipErrorHandler: true, skipAuthRefresh: true,
  })
  check()
  return requireServerSuccess(response.data).data
}
export const loadCommunityMeta = (signal?: AbortSignal) => communityRequest<CommunityMeta>('/meta', { signal })
export const loadTopics = (search: CommunitySearch, signal?: AbortSignal) => communityRequest<TopicListing>('/topics', { params: search, signal })
export const loadTopic = (id: string, signal?: AbortSignal, page = 1) => communityRequest<TopicDetail>(`/topics/${encodeURIComponent(id)}`, { signal, params: { page } })
export const loadCommunityNotifications = (signal?: AbortSignal) => communityRequest<CommunityNotification[]>('/me/notifications', { signal })
export const loadCommunityAdmin = (signal?: AbortSignal) => communityRequest<CommunityAdminData>('/admin', { signal })
