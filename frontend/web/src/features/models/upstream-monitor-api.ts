/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export interface UpstreamMonitorPrice {
  input_per_million: number | null
  output_per_million: number | null
  per_request: number | null
  model_ratio: number | null
  completion_ratio: number | null
  effective_input_per_million?: number | null
  effective_output_per_million?: number | null
  effective_per_request?: number | null
  group_ratio?: number | null
  cache_read_per_million?: number | null
  cache_write_per_million?: number | null
  cache_write_1h_per_million?: number | null
  effective_cache_read_per_million?: number | null
  effective_cache_write_per_million?: number | null
  effective_cache_write_1h_per_million?: number | null
}

export interface UpstreamMonitorTier {
  label: string
  min_tokens?: number | null
  max_tokens?: number | null
  input_per_million: number | null
  output_per_million: number | null
  effective_input_per_million: number | null
  effective_output_per_million: number | null
  per_request: number | null
  effective_per_request: number | null
  cache_read_per_million?: number | null
  cache_write_per_million?: number | null
  cache_write_1h_per_million?: number | null
  effective_cache_read_per_million?: number | null
  effective_cache_write_per_million?: number | null
  effective_cache_write_1h_per_million?: number | null
}

export interface UpstreamMonitorModel {
  name: string
  group?: string
  group_id?: string
  billing_type: 'token' | 'request' | 'unknown'
  currency: string | null
  raw_price: UpstreamMonitorPrice
  price_status: 'known' | 'unknown'
  suggested_sale_price: number | null
  gross_margin: number | null
  tiers?: UpstreamMonitorTier[]
  peak_rate_multiplier?: number | null
}

export interface UpstreamMonitorPriceChange {
  name: string
  group?: string
  group_id?: string
  old_billing_type: string
  new_billing_type: string
  old_price: UpstreamMonitorPrice
  new_price: UpstreamMonitorPrice
  tiers_changed: boolean
  peak_changed: boolean
}

export interface UpstreamMonitorProvider {
  provider: string
  source_url: string
  checked_at: string | null
  last_success_at?: string | null
  last_changed_at?: string | null
  last_price_changed_at?: string | null
  stale?: boolean
  notice?: string
  status: 'ok' | 'partial' | 'error'
  error: string | null
  history_error?: string | null
  diff_scope: 'model_name_only'
  removal_actionable: false
  models: UpstreamMonitorModel[]
  new_models: string[]
  removed_models: string[]
  local_models: string[]
  price_changes?: UpstreamMonitorPriceChange[]
}

export interface UpstreamMonitorSnapshot {
  checked_at: string
  cached: boolean
  providers: UpstreamMonitorProvider[]
  auto_sync_enabled?: boolean
  auto_sync_task?: {
    status: string
    updated_at: number
    error: string
    result?: {
      auto_sync?: {
        added: string[]
        removed: string[]
        repriced: string[]
        pending: string[]
      }
    }
  }
}

export async function queueUpstreamSync() {
  const response = await api.post<{ success: boolean; message?: string }>(
    '/api/models/upstream-monitor/sync'
  )
  return requireServerSuccess(response.data)
}

export async function getUpstreamMonitor(refresh = false) {
  const response = await api.get<{
    success: boolean
    message?: string
    data: UpstreamMonitorSnapshot
  }>('/api/models/upstream-monitor', {
    params: refresh ? { refresh: 1 } : undefined,
  })
  return requireServerSuccess(response.data).data
}

export function useUpstreamMonitor(enabled = true) {
  return useQuery({
    queryKey: ['skymoni-upstream-monitor'],
    queryFn: () => getUpstreamMonitor(),
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: 'always',
  })
}
