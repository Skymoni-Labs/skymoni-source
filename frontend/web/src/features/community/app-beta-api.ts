import type { AxiosRequestConfig } from 'axios'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export type BetaAccount = {
  user_id: number
  status: 'none' | 'pending' | 'approved' | 'rejected' | 'suspended'
  balance: number
  reserved: number
  used: number
  version: number
  application: string
  review_note: string
  applied_at: number
  username?: string
  display_name?: string
}
export type BetaDevice = { id: string; label: string; expires_at: number }
export type BetaSelf = {
  account: BetaAccount
  devices: BetaDevice[]
  app_available: boolean
}
export type BetaLedger = {
  id: number
  kind: string
  delta: number
  balance: number
  reserved: number
  used: number
  note: string
  created_at: number
  actor_id: number
}
export type BetaDetail = { account: BetaAccount; ledger: BetaLedger[] }
export type BetaList = {
  items: BetaAccount[]
  total: number
  app_available: boolean
}
export type BetaAction = 'approve' | 'reject' | 'suspend' | 'adjust'

export async function betaRequest<T>(
  url: string,
  options: AxiosRequestConfig = {}
): Promise<T> {
  const response = await api.request({
    url,
    ...options,
    skipErrorHandler: true,
    disableDuplicate: true,
  })
  return requireServerSuccess(response.data).data as T
}
export const betaSelf = (signal?: AbortSignal) =>
  betaRequest<BetaSelf>('/api/creators/app-beta', { signal })
export const betaApply = (application: string) =>
  betaRequest('/api/creators/app-beta/apply', {
    method: 'POST',
    data: { application },
  })
export const betaPair = (code: string) =>
  betaRequest('/api/creators/app-beta/pair', { method: 'POST', data: { code } })
export const betaRevokeDevice = (id: string) =>
  betaRequest(`/api/creators/app-beta/devices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
export const betaList = (status: string, page: number, signal?: AbortSignal) =>
  betaRequest<BetaList>('/api/user/app-beta', {
    params: { status, page },
    signal,
  })
export const betaDetail = (id: number, signal?: AbortSignal) =>
  betaRequest<BetaDetail>(`/api/user/app-beta/${id}`, { signal })
export const betaReview = (
  id: number,
  data: {
    action: BetaAction
    amount: number
    version: number
    operation_id: string
    note: string
  }
) => betaRequest(`/api/user/app-beta/${id}`, { method: 'POST', data })

export const betaStatusText = {
  none: 'Not applied',
  pending: 'Awaiting review',
  approved: 'Beta enabled',
  rejected: 'Application declined',
  suspended: 'Beta suspended',
} as const
