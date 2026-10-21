import type { AxiosRequestConfig } from 'axios'

import { api, getFreshAuthHeaders } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import type { SoftwareCatalog, SoftwareFile, SoftwareFiles } from './types'

export async function loadPublicSoftware(signal?: AbortSignal) {
  const response = await api.get<{
    success: boolean
    data: Pick<SoftwareCatalog, 'items' | 'featured'>
  }>('/api/software/public', {
    signal,
    skipAuthRefresh: true,
    skipErrorHandler: true,
  })
  return requireServerSuccess(response.data).data
}

async function softwareAdminRequest<T>(
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
      throw new DOMException('Software manager changed', 'AbortError')
    }
  }
  check()
  const headers = await getFreshAuthHeaders()
  check()
  const response = await api.request<{ success: boolean; data: T }>({
    ...options,
    url: `/api/software/admin${path}`,
    headers: {
      ...headers,
      ...(options.data instanceof FormData ? { 'Content-Type': null } : {}),
    },
    disableDuplicate: true,
    skipErrorHandler: true,
    skipAuthRefresh: true,
  })
  check()
  return requireServerSuccess(response.data).data
}

export const loadSoftwareCatalog = (signal?: AbortSignal) =>
  softwareAdminRequest<SoftwareCatalog>('/catalog', { signal })
export const saveSoftwareCatalog = (data: SoftwareCatalog) =>
  softwareAdminRequest<SoftwareCatalog>('/catalog', { method: 'put', data })
export const loadSoftwareFiles = (signal?: AbortSignal) =>
  softwareAdminRequest<SoftwareFiles>('/files', { signal })
export const deleteSoftwareFile = (id: string) =>
  softwareAdminRequest<undefined>(`/files/${encodeURIComponent(id)}`, {
    method: 'delete',
  })

export function uploadSoftwareFile(
  file: File,
  signal: AbortSignal,
  onProgress: (percentage: number) => void
) {
  const body = new FormData()
  body.append('file', file)
  return softwareAdminRequest<SoftwareFile>('/files', {
    method: 'post',
    data: body,
    signal,
    timeout: 30 * 60 * 1000,
    onUploadProgress: (event) =>
      onProgress(
        Math.min(
          100,
          Math.round((100 * event.loaded) / (event.total || file.size))
        )
      ),
  })
}
