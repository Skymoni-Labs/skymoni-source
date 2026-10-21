import { api, getFreshAuthHeaders } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useCreatorStore } from '@/stores/creator-store'

import { creatorRequest, type CreatorFile } from '../api'

export async function storeFile(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const uploaded = await creatorRequest<CreatorFile>('/me/files', {
    method: 'post',
    data: body,
  })
  useCreatorStore.setState((state) => ({ files: [uploaded, ...state.files] }))
  return uploaded.id
}
export async function downloadFile(id: string, name: string): Promise<void> {
  const auth = useAuthStore.getState().auth
  let path = `/api/creators/files/${encodeURIComponent(id)}`
  if (auth.user) path = `/api/creators/me/files/${encodeURIComponent(id)}`
  if (auth.user?.role === 100) {
    path = `/api/creators/admin/files/${encodeURIComponent(id)}`
  }
  const headers = auth.user ? await getFreshAuthHeaders() : {}
  const response = await api.get<Blob>(path, {
    headers,
    responseType: 'blob',
    skipAuthRefresh: true,
    skipErrorHandler: true,
    disableDuplicate: true,
  })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
