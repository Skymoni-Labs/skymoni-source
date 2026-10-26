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
import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import type {
  ConfigSnapshot,
  CreateBan,
  ProtectionBan,
  ProtectionConfig,
  ProtectionEvent,
  ProtectionOverview,
  ProtectionPage,
} from './types'

const base = '/api/security-protection'
const requestOptions = { skipErrorHandler: true, skipBusinessError: true }

export class ProtectionError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number
  ) {
    super(code)
    this.name = 'ProtectionError'
  }
}

export function requireProtectionRoot() {
  if (useAuthStore.getState().auth.user?.role !== ROLE.SUPER_ADMIN) {
    throw new ProtectionError('forbidden', 403)
  }
}

async function result<T>(
  request: () => Promise<{ data: unknown }>
): Promise<T> {
  // Use the existing authenticated client. Never collect, persist or expose keys.
  requireProtectionRoot()
  try {
    const response = await request()
    requireProtectionRoot()
    const body = response.data as { success?: boolean; code?: string; data?: T }
    if (body.success !== true || body.data === undefined) {
      throw new ProtectionError(body.code || 'request_failed')
    }
    return body.data
  } catch (error) {
    if (error instanceof ProtectionError) throw error
    const response = (
      error as { response?: { status?: number; data?: { code?: string } } }
    )?.response
    throw new ProtectionError(
      response?.data?.code || 'request_failed',
      response?.status
    )
  }
}

export const protectionApi = {
  config: () =>
    result<ConfigSnapshot>(() => api.get(`${base}/config`, requestOptions)),
  saveConfig: (expected_revision: number, config: ProtectionConfig) =>
    result<ConfigSnapshot>(() =>
      api.put(`${base}/config`, { expected_revision, config }, requestOptions)
    ),
  overview: () =>
    result<ProtectionOverview>(() =>
      api.get(`${base}/overview`, requestOptions)
    ),
  events: (page: number) =>
    result<ProtectionPage<ProtectionEvent>>(() =>
      api.get(`${base}/events`, {
        ...requestOptions,
        params: { page, page_size: 20 },
      })
    ),
  bans: (page: number) =>
    result<ProtectionPage<ProtectionBan>>(() =>
      api.get(`${base}/bans`, {
        ...requestOptions,
        params: { page, page_size: 20 },
      })
    ),
  createBan: (payload: CreateBan) =>
    result<ProtectionBan>(() =>
      api.post(`${base}/bans`, payload, requestOptions)
    ),
  revokeBan: (id: number, reason: string) =>
    result<ProtectionBan>(() =>
      api.post(`${base}/bans/${id}/revoke`, { reason }, requestOptions)
    ),
}

export function protectionErrorMessage(error: unknown): string {
  const failure = error as ProtectionError
  if (failure.status === 409 || /revision|conflict/i.test(failure.code || '')) {
    return '配置已被其他管理员更新。你的修改仍保留，请先载入最新版本后重新调整。'
  }
  if (failure.status === 401 || failure.status === 403) {
    return '管理员权限已失效，请重新登录。'
  }
  if (/self|protected|admin|allowlist/i.test(failure.code || '')) {
    return '该目标受到管理员或白名单保护，不能限制。'
  }
  if (failure.status === 400) {
    return '参数未通过服务器校验，请检查目标、时长和阈值。'
  }
  return '操作失败，请稍后重试。修改尚未保存。'
}
