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
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import {
  acknowledgePopupNotice,
  getAvailablePopupNotices,
  getPopupHistory,
  getPopupHistoryDetail,
} from '../api'
import type { PopupNoticeDelivery } from '../types'

const boundary = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getFreshAuthHeaders: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  api: { get: boundary.get, post: boundary.post },
  getFreshAuthHeaders: boundary.getFreshAuthHeaders,
}))
const notice: PopupNoticeDelivery = {
  id: 1,
  title: 'Hello',
  content: 'Message',
  format: 'text',
  frequency: 'once',
  revision: 1,
  priority: 0,
  start_at: 0,
  end_at: 0,
  published_at: 1,
}

beforeEach(() => {
  useAuthStore.getState().auth.reset('complete')
  useAuthStore.getState().auth.setUser({ id: 10, username: 'alice', role: 1 })
  boundary.get
    .mockReset()
    .mockResolvedValue({ data: { success: true, data: [notice] } })
  boundary.post
    .mockReset()
    .mockResolvedValue({ data: { success: true, data: {} } })
  boundary.getFreshAuthHeaders
    .mockReset()
    .mockResolvedValue({ Authorization: 'Bearer refreshed-test-token' })
})

describe('popup API session boundary', () => {
  test('refreshes authentication before delivering and acknowledging on a long-lived page', async () => {
    const signal = new AbortController().signal
    expect(await getAvailablePopupNotices(10, signal)).toEqual([notice])
    await acknowledgePopupNotice(notice, 10, signal)
    expect(boundary.getFreshAuthHeaders).toHaveBeenCalledTimes(2)
    expect(boundary.get).toHaveBeenCalledWith(
      '/api/popup-notices/self',
      expect.objectContaining({
        headers: { Authorization: 'Bearer refreshed-test-token' },
        skipAuthRefresh: true,
      })
    )
    expect(boundary.post).toHaveBeenCalledWith(
      '/api/popup-notices/1/read',
      { revision: 1, expected_user_id: 10 },
      expect.objectContaining({ signal, skipAuthRefresh: true })
    )
  })

  test('a user change during token refresh cancels delivery without sending a feed request', async () => {
    let finishRefresh: (headers: Record<string, string>) => void = () => {}
    boundary.getFreshAuthHeaders.mockReturnValueOnce(
      new Promise<Record<string, string>>((resolve) => {
        finishRefresh = resolve
      })
    )
    const request = getAvailablePopupNotices(10, new AbortController().signal)
    useAuthStore.getState().auth.setUser({ id: 20, username: 'bob', role: 1 })
    finishRefresh({ Authorization: 'Bearer bob-test-token' })
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(boundary.get).not.toHaveBeenCalled()
  })

  test('a user change during acknowledgement refresh never confirms the new user receipt', async () => {
    boundary.getFreshAuthHeaders.mockImplementationOnce(async () => {
      useAuthStore.getState().auth.setUser({ id: 20, username: 'bob', role: 1 })
      return { Authorization: 'Bearer bob-test-token' }
    })
    await expect(
      acknowledgePopupNotice(notice, 10, new AbortController().signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(boundary.post).not.toHaveBeenCalled()
  })

  test('a feed arriving after logout is rejected rather than returned to the old query cache', async () => {
    boundary.get.mockImplementationOnce(async () => {
      useAuthStore.getState().auth.reset('complete')
      return { data: { success: true, data: [notice] } }
    })
    await expect(
      getAvailablePopupNotices(10, new AbortController().signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('visitors do not refresh authentication and an aborted request never reaches the network', async () => {
    useAuthStore.getState().auth.reset('complete')
    await getAvailablePopupNotices(null, new AbortController().signal)
    expect(boundary.getFreshAuthHeaders).not.toHaveBeenCalled()
    const controller = new AbortController()
    controller.abort()
    await expect(
      getAvailablePopupNotices(null, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(boundary.get).toHaveBeenCalledOnce()
  })

  test('history pages and details refresh auth, use receipt cursors and retain the captured session boundary', async () => {
    const signal = new AbortController().signal
    const item = {
      id: 41,
      notice_id: 1,
      revision: 1,
      title: 'Hello',
      format: 'text',
      published_at: 1,
      read_at: 20,
    }
    boundary.get.mockResolvedValueOnce({
      data: { success: true, data: [item] },
    })
    expect(
      await getPopupHistory(10, null, signal, {
        after_read_at: 20,
        after_id: 50,
      })
    ).toEqual([item])
    expect(boundary.get).toHaveBeenCalledWith(
      '/api/popup-notices/history',
      expect.objectContaining({
        params: { after_read_at: 20, after_id: 50 },
        signal,
        headers: { Authorization: 'Bearer refreshed-test-token' },
        skipAuthRefresh: true,
      })
    )
    boundary.get.mockResolvedValueOnce({
      data: { success: true, data: { ...item, content: 'Private snapshot' } },
    })
    expect(await getPopupHistoryDetail(41, 10, null, signal)).toMatchObject({
      content: 'Private snapshot',
    })
    expect(boundary.get).toHaveBeenLastCalledWith(
      '/api/popup-notices/history/41',
      expect.objectContaining({ signal, skipAuthRefresh: true })
    )
    expect(boundary.getFreshAuthHeaders).toHaveBeenCalledTimes(2)
    expect(boundary.post).not.toHaveBeenCalled()
  })

  test('a history response arriving after an account change never returns private content to its old cache', async () => {
    boundary.get.mockImplementationOnce(async () => {
      useAuthStore.getState().auth.setUser({ id: 20, username: 'bob', role: 1 })
      return {
        data: { success: true, data: { content: 'Alice private content' } },
      }
    })
    await expect(
      getPopupHistoryDetail(41, 10, null, new AbortController().signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('a session change during history auth refresh stops the request before the network', async () => {
    boundary.getFreshAuthHeaders.mockImplementationOnce(async () => {
      useAuthStore.setState((state) => ({
        auth: {
          ...state.auth,
          session: {
            sid: 'new-session',
            current: true,
            login_method: 'password',
            ip: '',
            user_agent: '',
            created_at: 0,
            last_active_at: 0,
            expires_at: 1,
          },
        },
      }))
      return { Authorization: 'Bearer new-session-token' }
    })
    await expect(
      getPopupHistory(10, null, new AbortController().signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(boundary.get).not.toHaveBeenCalled()
  })

  test('a history request for an obsolete actor or an aborted detail does not refresh or reach the network', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      getPopupHistoryDetail(41, 10, null, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    useAuthStore.getState().auth.reset('complete')
    await expect(
      getPopupHistory(10, null, new AbortController().signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(boundary.getFreshAuthHeaders).not.toHaveBeenCalled()
    expect(boundary.get).not.toHaveBeenCalled()
  })
})
