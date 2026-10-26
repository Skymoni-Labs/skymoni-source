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
export type ProtectionMode = 'observe' | 'enforce'
export type BanScope = 'account' | 'checkin' | 'ip'

export interface ProtectionConfig {
  enabled: boolean
  mode: ProtectionMode
  registration_ip_hour_limit: number
  registration_window_seconds: number
  first_checkin_cooldown_seconds: number
  new_account_age_seconds: number
  ip_daily_new_user_limit: number
  burst_window_seconds: number
  burst_new_user_threshold: number
  burst_rapid_user_threshold: number
  rapid_claim_seconds: number
  auto_ip_window_seconds: number
  auto_ip_new_user_threshold: number
  auto_ip_denied_threshold: number
  auto_ip_ban_seconds: number
  allowlist_ips: string[]
  allowlist_user_ids: number[]
  retention_days: number
}

export interface ConfigSnapshot {
  revision: number
  config: ProtectionConfig
  updated_at: number
  updated_by: number
}

export interface ProtectionOverview {
  enabled: boolean
  mode: ProtectionMode
  revision: number
  healthy: boolean
  active_user_bans: number
  active_ip_bans: number
  events_24h: number
  denied_24h: number
  observed_24h: number
  last_event_at: number
}

export interface ProtectionBan {
  id: number
  subject_type: 'user' | 'ip'
  user_id: number
  ip: string
  scope: BanScope
  source: 'manual' | 'automatic'
  reason: string
  rule: string
  created_at: number
  expires_at: number
  revoked_at: number
  operator_id: number
  request_id?: string
  policy_revision?: number
  evidence?: Record<string, number>
  revoked_request_id?: string
}

export interface CreateBan {
  subject_type: 'user' | 'ip'
  user_id?: number
  ip?: string
  scope: BanScope
  duration_seconds: number
  reason: string
}

export interface ProtectionEvent {
  id: number
  created_at: number
  kind: string
  route: string
  decision: 'allowed' | 'denied' | 'observed' | 'exempt'
  scope?: BanScope | 'registration'
  request_id?: string
  policy_revision?: number
  evidence?: Record<string, number>
  rule: string
  user_id: number
  ip: string
  ip_prefix: string
  summary: string
  new_user: boolean
  rapid: boolean
}

export interface ProtectionPage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
