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
  Benefit,
  BenefitCode,
  InventoryItem,
  WarehouseItem,
} from './types'

interface Response<T> {
  success: boolean
  data: T
  message?: string
}
export interface BenefitPage<T> {
  items: T[]
  total: number
  counts?: { all: number; active: number; expired: number }
}
const base = '/api/benefits'

// Private responses cannot outlive the identity which requested them.
async function request<T>(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
  method: 'post' | 'put' = 'post'
): Promise<T> {
  const auth = useAuthStore.getState().auth
  const actor = `${auth.user?.id}:${auth.session?.sid}`
  const check = () => {
    const current = useAuthStore.getState().auth
    if (
      !auth.user ||
      signal?.aborted ||
      `${current.user?.id}:${current.session?.sid}` !== actor
    ) {
      throw new DOMException('Benefit owner changed', 'AbortError')
    }
  }
  check()
  const headers = await getFreshAuthHeaders()
  check()
  const options = {
    signal,
    headers,
    disableDuplicate: true,
    skipErrorHandler: true,
    skipAuthRefresh: true,
  }
  const response =
    body === undefined
      ? await api.get<Response<T>>(base + path, options)
      : await api[method]<Response<T>>(base + path, body, options)
  check()
  return requireServerSuccess(response.data).data
}

export function getBenefitWarehouse(
  page: number,
  signal: AbortSignal,
  admin = false,
  keyword = '',
  status = 'all'
) {
  return request<BenefitPage<WarehouseItem>>(
    `/warehouse?p=${page}&page_size=50&keyword=${encodeURIComponent(keyword)}&status=${status}${admin ? '&admin=1' : ''}`,
    signal
  )
}
export function getBenefitDetail(id: string, signal?: AbortSignal) {
  return request<Benefit>(`/admin/${id}`, signal)
}
export function getWarehouseDetail(id: string, signal: AbortSignal) {
  return request<WarehouseItem>(`/warehouse/${id}`, signal)
}
export function listBenefitCodes(page: number, signal: AbortSignal) {
  return request<BenefitPage<BenefitCode>>(
    `/admin/codes?p=${page}&page_size=50`,
    signal
  )
}
export function listBenefits(page: number, signal: AbortSignal) {
  return request<BenefitPage<Benefit>>(`/admin?p=${page}&page_size=50`, signal)
}
export function listBenefitInventory(
  page: number,
  signal: AbortSignal,
  filters?: { benefitId: string; status: string; keyword: string }
) {
  const params = new URLSearchParams({
    p: String(page),
    page_size: '50',
    benefit_id: filters?.benefitId || '0',
    status: filters?.status || 'all',
    keyword: filters?.keyword || '',
  })
  return request<{
    items: InventoryItem[]
    total: number
    counts: Record<string, number>
  }>(`/admin/inventory?${params}`, signal)
}
export function getInventoryDetail(id: string, signal: AbortSignal) {
  return request<InventoryItem>(`/admin/inventory/${id}`, signal)
}
export function editInventory(
  item: InventoryItem,
  reason: string,
  syncDelivered: boolean
) {
  return request<unknown>(
    `/admin/inventory/${item.id}`,
    undefined,
    { revision: item.revision, fields: item.fields, reason, syncDelivered },
    'put'
  )
}
export function manageInventory(
  items: InventoryItem[],
  action: string,
  reason: string
) {
  return request<unknown>('/admin/inventory/actions', undefined, {
    items: items.map((item) => ({
      id: Number(item.id),
      revision: item.revision,
    })),
    action,
    reason,
  })
}
export function redeemBenefit(code: string) {
  return request<WarehouseItem>('/redeem', undefined, { code })
}
export function redeemPopupBenefit(id: number, revision: number) {
  return request<WarehouseItem>(`/popup/${id}/redeem`, undefined, { revision })
}
export async function saveBenefit(benefit: Benefit, exists: boolean) {
  await request<Benefit>(
    exists ? `/admin/${benefit.id}` : '/admin',
    undefined,
    benefit,
    exists ? 'put' : 'post'
  )
}
export async function importBenefitInventory(items: InventoryItem[]) {
  if (!items.length) return
  await request<unknown>(`/admin/${items[0].benefitId}/inventory`, undefined, {
    items: items.map((x) => x.fields),
  })
}
export async function generateBenefitCodes(codes: BenefitCode[]) {
  const code = codes[0]
  if (!code) return
  await request<unknown>('/admin/codes', undefined, {
    benefit_id: Number(code.benefitId),
    count: codes.length,
    mode: code.mode,
    limit: code.limit,
    target_user_id: code.target === 'user' ? code.targetUserId : 0,
    expires_at: code.expires
      ? Math.floor(new Date(`${code.expires}T23:59:59`).getTime() / 1000)
      : 0,
  })
}
export async function setBenefitState(id: string, enabled: boolean) {
  await request<unknown>(`/admin/${id}/state`, undefined, { enabled })
}
export async function setBenefitCodeState(id: string, enabled: boolean) {
  await request<unknown>(`/admin/codes/${id}/state`, undefined, { enabled })
}
