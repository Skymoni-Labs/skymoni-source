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

import type {
  PopupHistoryDetail,
  PopupHistoryItem,
  PopupNotice,
  PopupNoticeDelivery,
  PopupNoticeInput,
  PopupNoticeList,
  PopupStatus,
  PopupTemplate,
  PopupTemplateInput,
  PopupTemplateList,
} from './types'

interface Response<T> {
  success: boolean
  message?: string
  data: T
}
export interface PopupFeedCursor {
  after_id: number
  after_priority: number
}
export interface PopupHistoryCursor {
  after_read_at: number
  after_id: number
}
const adminPath = '/api/popup-notices/admin'

export async function listPopupTemplates(
  page = 1,
  keyword = ''
): Promise<PopupTemplateList> {
  const response = await api.get<Response<PopupTemplateList>>(
    `${adminPath}/templates`,
    {
      params: { p: page, page_size: 20, keyword },
    }
  )
  return requireServerSuccess(response.data).data
}

export async function savePopupTemplate(
  input: PopupTemplateInput,
  id?: number
): Promise<PopupTemplate> {
  const response = id
    ? await api.put<Response<PopupTemplate>>(
        `${adminPath}/templates/${id}`,
        input
      )
    : await api.post<Response<PopupTemplate>>(`${adminPath}/templates`, input)
  return requireServerSuccess(response.data).data
}

export async function deletePopupTemplate(
  id: number,
  revision: number
): Promise<void> {
  const response = await api.delete<Response<unknown>>(
    `${adminPath}/templates/${id}`,
    { data: { revision } }
  )
  requireServerSuccess(response.data)
}

function assertPopupActor(
  userId: number | null,
  sid: string | null,
  signal: AbortSignal
): void {
  const auth = useAuthStore.getState().auth
  if (
    signal.aborted ||
    (auth.user?.id ?? null) !== userId ||
    (auth.session?.sid ?? null) !== sid
  ) {
    throw new DOMException('Popup audience changed', 'AbortError')
  }
}

export async function listPopupNotices(page = 1): Promise<PopupNoticeList> {
  const response = await api.get<Response<PopupNoticeList>>(adminPath, {
    params: { p: page, page_size: 20 },
  })
  return requireServerSuccess(response.data).data
}

export async function savePopupNotice(
  input: PopupNoticeInput,
  id?: number
): Promise<PopupNotice> {
  const response = id
    ? await api.put<Response<PopupNotice>>(`${adminPath}/${id}`, input)
    : await api.post<Response<PopupNotice>>(adminPath, input)
  return requireServerSuccess(response.data).data
}

export async function setPopupNoticeState(
  id: number,
  status: PopupStatus,
  resend = false
): Promise<PopupNotice> {
  const response = await api.post<Response<PopupNotice>>(
    `${adminPath}/${id}/state`,
    { status, resend }
  )
  return requireServerSuccess(response.data).data
}

export async function deletePopupNotice(id: number): Promise<void> {
  const response = await api.delete<Response<unknown>>(`${adminPath}/${id}`)
  requireServerSuccess(response.data)
}

export async function getAvailablePopupNotices(
  userId: number | null,
  signal: AbortSignal,
  cursor?: PopupFeedCursor
): Promise<PopupNoticeDelivery[]> {
  const sid = useAuthStore.getState().auth.session?.sid ?? null
  assertPopupActor(userId, sid, signal)
  const headers = userId === null ? undefined : await getFreshAuthHeaders()
  assertPopupActor(userId, sid, signal)
  const response = await api.get<Response<PopupNoticeDelivery[]>>(
    `/api/popup-notices/${userId === null ? 'guest' : 'self'}`,
    {
      signal,
      headers,
      params: cursor,
      disableDuplicate: true,
      skipErrorHandler: true,
      skipAuthRefresh: true,
    }
  )
  assertPopupActor(userId, sid, signal)
  return requireServerSuccess(response.data).data
}

export async function acknowledgePopupNotice(
  notice: PopupNoticeDelivery,
  expectedUserId: number,
  signal: AbortSignal
): Promise<void> {
  const sid = useAuthStore.getState().auth.session?.sid ?? null
  assertPopupActor(expectedUserId, sid, signal)
  const headers = await getFreshAuthHeaders()
  assertPopupActor(expectedUserId, sid, signal)
  const response = await api.post<Response<unknown>>(
    `/api/popup-notices/${notice.id}/read`,
    { revision: notice.revision, expected_user_id: expectedUserId },
    { signal, headers, skipErrorHandler: true, skipAuthRefresh: true }
  )
  assertPopupActor(expectedUserId, sid, signal)
  requireServerSuccess(response.data)
}

export async function getPopupHistory(
  expectedUserId: number,
  expectedSid: string | null,
  signal: AbortSignal,
  cursor?: PopupHistoryCursor
): Promise<PopupHistoryItem[]> {
  assertPopupActor(expectedUserId, expectedSid, signal)
  const headers = await getFreshAuthHeaders()
  assertPopupActor(expectedUserId, expectedSid, signal)
  const response = await api.get<Response<PopupHistoryItem[]>>(
    '/api/popup-notices/history',
    {
      signal,
      headers,
      params: cursor,
      disableDuplicate: true,
      skipErrorHandler: true,
      skipAuthRefresh: true,
    }
  )
  assertPopupActor(expectedUserId, expectedSid, signal)
  return requireServerSuccess(response.data).data
}

export async function getPopupHistoryDetail(
  id: number,
  expectedUserId: number,
  expectedSid: string | null,
  signal: AbortSignal
): Promise<PopupHistoryDetail> {
  assertPopupActor(expectedUserId, expectedSid, signal)
  const headers = await getFreshAuthHeaders()
  assertPopupActor(expectedUserId, expectedSid, signal)
  const response = await api.get<Response<PopupHistoryDetail>>(
    `/api/popup-notices/history/${id}`,
    {
      signal,
      headers,
      disableDuplicate: true,
      skipErrorHandler: true,
      skipAuthRefresh: true,
    }
  )
  assertPopupActor(expectedUserId, expectedSid, signal)
  return requireServerSuccess(response.data).data
}
