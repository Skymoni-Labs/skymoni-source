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

import { getWarehouseDetail, redeemBenefit } from '../api'

const boundary = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  refresh: vi.fn(),
  auth: { user: { id: 10 }, session: { sid: 'owner-session' } } as {
    user: { id: number } | null
    session: { sid: string } | null
  },
}))
vi.mock('@/lib/api', () => ({
  api: { get: boundary.get, post: boundary.post },
  getFreshAuthHeaders: boundary.refresh,
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ auth: boundary.auth }) },
}))

describe('private resource responses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    boundary.auth = { user: { id: 10 }, session: { sid: 'owner-session' } }
    boundary.refresh.mockResolvedValue({ Authorization: 'Bearer fixture-only' })
    boundary.get.mockResolvedValue({
      data: {
        success: true,
        data: { id: '1', fields: [{ value: 'private' }] },
      },
    })
    boundary.post.mockResolvedValue({
      data: { success: true, data: { id: '1', fields: [] } },
    })
  })
  test('private details use a fresh token, cancellation and server-only ownership', async () => {
    const signal = new AbortController().signal
    await getWarehouseDetail('1', signal)
    expect(boundary.get).toHaveBeenCalledWith(
      '/api/benefits/warehouse/1',
      expect.objectContaining({
        signal,
        headers: { Authorization: 'Bearer fixture-only' },
        skipAuthRefresh: true,
      })
    )
    await redeemBenefit('fixture-code')
    expect(boundary.post).toHaveBeenCalledWith(
      '/api/benefits/redeem',
      { code: 'fixture-code' },
      expect.anything()
    )
  })
  test('a changed identity during refresh never sends a private request', async () => {
    boundary.refresh.mockImplementationOnce(async () => {
      boundary.auth.user = { id: 20 }
      return {}
    })
    await expect(
      getWarehouseDetail('1', new AbortController().signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(boundary.get).not.toHaveBeenCalled()
  })
  test('a late response cannot expose credentials after logout or a session change', async () => {
    boundary.get.mockImplementationOnce(async () => {
      boundary.auth.session = { sid: 'new-session' }
      return {
        data: {
          success: true,
          data: { fields: [{ value: 'must-not-render' }] },
        },
      }
    })
    await expect(
      getWarehouseDetail('1', new AbortController().signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    boundary.auth.user = null
    await expect(redeemBenefit('fixture-code')).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(boundary.post).not.toHaveBeenCalled()
  })
  test('aborted requests cannot return private content', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      getWarehouseDetail('1', controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(boundary.get).not.toHaveBeenCalled()
  })
})
