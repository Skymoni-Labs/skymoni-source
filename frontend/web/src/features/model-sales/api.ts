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

import type { MailCampaign } from '@/features/admin-mail/types'
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export interface SalePolicy {
  cny_per_credit: number
  cny_per_usd: number
  minimum_margin_percent: number
  cost_buffer_percent: number
  revenue_reserve_percent: number
  max_cost_age_hours: number
}
export interface SaleConfig {
  pricing_basis?: 'official'
  request_prices_cny?: Record<string, number>
  models: string[]
  discount_percent: number
  model_multipliers?: Record<string, number>
  policy: SalePolicy
  countdown_mode: 'end' | 'start' | 'auto'
}
export interface Sale {
  time_prices?: SaleTimePrice[]
  id: string
  title: string
  status: string
  start_at: number
  end_at: number
  revision: number
  config: SaleConfig
  message: string
  announcement_managed?: boolean
  announcement_enabled?: boolean
  announcement_at?: number
}
export interface SaleInput {
  title: string
  start_at: number
  end_at: number
  revision: number
  config: SaleConfig
}
// Go omits empty optional maps. Compare their meaning, not object key order,
// so loading a token-only saved template does not look like an unsaved edit.
export function saleInputMatches(sale: Sale, input: SaleInput): boolean {
  const entries = (map: Record<string, number> | undefined) =>
    Object.entries(map ?? {}).sort(([a], [b]) => a.localeCompare(b))
  const config = (c: SaleConfig) => ({
    basis: c.pricing_basis ?? '',
    models: [...c.models].sort(),
    discount: c.discount_percent,
    multipliers: entries(c.model_multipliers),
    requests: entries(c.request_prices_cny),
    policy: Object.entries(c.policy).sort(([a], [b]) => a.localeCompare(b)),
    countdown: c.countdown_mode,
  })
  return (
    sale.title === input.title &&
    sale.start_at === input.start_at &&
    sale.end_at === input.end_at &&
    JSON.stringify(config(sale.config)) === JSON.stringify(config(input.config))
  )
}
export interface SaleQuote {
  pricing_basis?: 'official' | 'request'
  official_source?: string
  official_usd_cny?: number
  official_prices_cny?: Record<string, Record<string, number>>
  maximum_current_multiplier?: number
  current_request_cny?: number
  minimum_request_cny?: number
  target_request_cny?: number
  current_multiplier: number
  minimum_multiplier: number
  target_multiplier: number
  cash_cny_per_credit: number
  cost_conversion: Record<string, number>
  model: string
  eligible: boolean
  reason: string
  max_discount_percent: number
  target_margin_percent: number
  providers: string[]
  groups: string[]
  observed_at: string
  lines: {
    tier: string
    official_cny?: number
    component: string
    sale_cny: number
    cost_cny: number
    floor_cny: number
    target_cny: number
  }[]
}
export interface PublicSale {
  time_prices?: SaleTimePrice[]
  model_multipliers?: Record<string, number>
  id: string
  title: string
  status: string
  start_at: number
  end_at: number
  countdown_mode: string
  models: string[]
  discount_percent: number
  server_time: number
  announcement_only?: boolean
  announcement_at?: number
}
interface Response<T> {
  success: boolean
  message?: string
  data: T
}
export interface SaleTimePrice {
  model: string
  billing_expr: string
  currency: string
  schedule_text?: string
  tiers: {
    label: string
    original: Record<string, number>
    target: Record<string, number>
    official: Record<string, number>
    original_multiplier: number
    target_multiplier: number
  }[]
}
const base = '/api/model-sales'
export async function refreshSaleCosts() {
  return requireServerSuccess(
    (
      await api.post<
        Response<{ updated_quotes: number; prices_changed: boolean }>
      >(`${base}/costs/refresh`, {})
    ).data
  ).data
}
export async function listSales() {
  return requireServerSuccess(
    (
      await api.get<
        Response<{
          items: Sale[]
          default_policy: SalePolicy
          server_time: number
        }>
      >(base)
    ).data
  ).data
}
export async function quoteSales(
  policy: SalePolicy,
  model_multipliers: Record<string, number> = {},
  request_prices_cny: Record<string, number> = {}
) {
  return requireServerSuccess(
    (
      await api.post<Response<{ quotes: SaleQuote[]; server_time: number }>>(
        `${base}/quotes`,
        {
          policy,
          discount_percent: 0,
          pricing_basis: 'official',
          model_multipliers,
          request_prices_cny,
        }
      )
    ).data
  ).data
}
export async function saveSale(input: SaleInput, id?: string) {
  const res = id
    ? await api.put<Response<Sale>>(`${base}/${id}`, input)
    : await api.post<Response<Sale>>(base, input)
  return requireServerSuccess(res.data).data
}
export async function changeSale(sale: Sale, action: 'enable' | 'disable') {
  return requireServerSuccess(
    (
      await api.post<Response<Sale>>(`${base}/${sale.id}/${action}`, {
        revision: sale.revision,
      })
    ).data
  ).data
}
export async function publishSale(sale: Sale, publishAt: number) {
  return requireServerSuccess(
    (
      await api.post<Response<Sale>>(`${base}/${sale.id}/publish`, {
        revision: sale.revision,
        publish_at: publishAt,
      })
    ).data
  ).data
}
export async function unpublishSale(sale: Sale) {
  return requireServerSuccess(
    (
      await api.post<Response<Sale>>(`${base}/${sale.id}/unpublish`, {
        revision: sale.revision,
      })
    ).data
  ).data
}
export async function getPublicSale(id: string) {
  return requireServerSuccess(
    (await api.get<Response<PublicSale>>(`${base}/public/${id}`)).data
  ).data
}
export async function listPublicSales() {
  return requireServerSuccess(
    (
      await api.get<Response<{ items: PublicSale[]; server_time: number }>>(
        `${base}/public`
      )
    ).data
  ).data
}
export async function checkSavedSale(id: string) {
  return requireServerSuccess(
    (
      await api.get<
        Response<{ sale: Sale; quotes: SaleQuote[]; server_time: number }>
      >(`${base}/${id}/check`)
    ).data
  ).data
}
export async function createSaleMailDraft(
  sale: Sale,
  baseDraftId: number,
  requestKey: string
) {
  return requireServerSuccess(
    (
      await api.post<Response<MailCampaign>>(`${base}/${sale.id}/mail-draft`, {
        revision: sale.revision,
        base_draft_id: baseDraftId,
        request_key: requestKey,
      })
    ).data
  ).data
}
export const defaultPolicy: SalePolicy = {
  cny_per_credit: 0.1,
  cny_per_usd: 7.3,
  minimum_margin_percent: 20,
  cost_buffer_percent: 10,
  revenue_reserve_percent: 5,
  max_cost_age_hours: 48,
}
export const saleStatus: Record<string, string> = {
  announced: '降价预告 · 价格待启用',
  unpublished: '公告尚未发布',
  draft: '未启用',
  scheduled: '待开始',
  active: '降价中',
  paused: '已停用',
  ended: '已结束',
  blocked: '保本拦截',
  conflict: '价格已另行调整',
}
export function appendSaleMarker(content: string, id: string): string {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('活动标识无效')
  const doc = new DOMParser().parseFromString(content, 'text/html')
  const root = doc.querySelector('[data-mail-template]') ?? doc.body
  const block = doc.createElement('div')
  block.dataset.modelSale = id
  block.textContent = '模型优惠翻页倒计时'
  root
    .querySelectorAll('[data-model-sale]')
    .forEach((marker) => marker.remove())
  root.prepend(block)
  return doc.body.innerHTML
}
