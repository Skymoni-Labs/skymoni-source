/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { api, getFreshAuthHeaders } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import type { DocEntry, DocPage, PublicDoc } from './types'

export async function docsRequest<T>(
  path: string,
  data?: unknown,
  signal?: AbortSignal
) {
  const sid = useAuthStore.getState().auth.session?.sid
  const headers = await getFreshAuthHeaders()
  if (!sid || sid !== useAuthStore.getState().auth.session?.sid) {
    throw new Error('登录状态已改变，请重新打开文档')
  }
  let method = 'GET'
  if (data) method = data instanceof FormData ? 'POST' : 'PUT'
  const response = await api.request<{ success: boolean; data: T }>({
    url: `/api/docs${path}`,
    method,
    data,
    signal,
    headers: {
      ...headers,
      ...(data instanceof FormData ? { 'Content-Type': null } : {}),
    },
    disableDuplicate: true,
    skipAuthRefresh: true,
    skipErrorHandler: true,
  })
  if (sid !== useAuthStore.getState().auth.session?.sid) {
    throw new Error('登录状态已改变')
  }
  return requireServerSuccess(response.data).data
}
export const loadAdminDocs = () => docsRequest<DocEntry[]>('/admin')
export const saveDoc = (
  id: string,
  revision: string,
  action: string,
  draft: DocPage
) =>
  docsRequest<DocEntry>(`/admin/${encodeURIComponent(id)}`, {
    revision,
    action,
    draft,
  })
export async function publicDocs(id?: string, signal?: AbortSignal) {
  const response = await api.get<{
    success: boolean
    data: PublicDoc[] | PublicDoc
  }>(`/api/docs/public${id ? `/${encodeURIComponent(id)}` : ''}`, {
    signal,
    skipAuthRefresh: true,
    skipErrorHandler: true,
  })
  return requireServerSuccess(response.data).data
}
export function validateDocImageFile(file: File) {
  if (!file.size) throw new Error('图片文件为空，请重新选择')
  if (file.size > 5 * 1024 * 1024) throw new Error('每张图片需在 5 MB 以内')
  const accepted = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  if (
    !accepted.includes(file.type.toLowerCase()) &&
    !(file.type === '' && /\.(png|jpe?g|gif|webp)$/i.test(file.name))
  ) {
    throw new Error('请选择 PNG、JPG、GIF 或 WebP 图片')
  }
}
export async function uploadDocImage(file: File, signal?: AbortSignal) {
  validateDocImageFile(file)
  const data = new FormData()
  data.append('file', file)
  return docsRequest<{ url: string }>('/admin/images', data, signal)
}
export async function draftImageBlob(url: string, signal: AbortSignal) {
  const headers = await getFreshAuthHeaders()
  const result = await api.get<Blob>(url, {
    headers,
    responseType: 'blob',
    signal,
    skipAuthRefresh: true,
    skipErrorHandler: true,
  })
  return URL.createObjectURL(result.data)
}
