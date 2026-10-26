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
import type { ProtectionBan, ProtectionConfig } from './types'

export function isExactIP(value: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value
      .split('.')
      .every((part) => String(Number(part)) === part && Number(part) <= 255)
  }
  if (!value.includes(':') || /[^0-9a-f:]/i.test(value)) return false
  try {
    return new URL(`http://[${value}]/`).hostname.startsWith('[')
  } catch {
    return false
  }
}

export function isSafeBanIP(value: string): boolean {
  if (!isExactIP(value)) return false
  if (value.includes(':')) {
    const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1)
    return (
      normalized !== '::' &&
      normalized !== '::1' &&
      !/^(fc|fd|fe[89ab]|ff)/i.test(normalized) &&
      !normalized.startsWith('::ffff:')
    )
  }
  const [a, b] = value.split('.').map(Number)
  return (
    a !== 0 &&
    a !== 10 &&
    a !== 127 &&
    a < 224 &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && b === 168)
  )
}

export function parseUserIds(value: string): number[] | null {
  const parts = value.split(/[\s,，]+/).filter(Boolean)
  if (
    parts.some(
      (part) => !/^[1-9]\d*$/.test(part) || !Number.isSafeInteger(Number(part))
    )
  ) {
    return null
  }
  return [...new Set(parts.map(Number))]
}

export const ruleLimits: Partial<
  Record<keyof ProtectionConfig, readonly [number, number]>
> = {
  registration_ip_hour_limit: [10, 10000],
  registration_window_seconds: [600, 86400],
  first_checkin_cooldown_seconds: [0, 604800],
  new_account_age_seconds: [3600, 2592000],
  ip_daily_new_user_limit: [1, 1000],
  burst_window_seconds: [60, 3600],
  burst_new_user_threshold: [2, 1000],
  burst_rapid_user_threshold: [2, 1000],
  rapid_claim_seconds: [1, 3600],
  auto_ip_window_seconds: [600, 86400],
  auto_ip_new_user_threshold: [10, 10000],
  auto_ip_denied_threshold: [5, 10000],
  auto_ip_ban_seconds: [60, 86400],
  retention_days: [7, 180],
}

export function validateConfig(config: ProtectionConfig): string | null {
  for (const [key, limits] of Object.entries(ruleLimits)) {
    const value = Number(config[key as keyof ProtectionConfig])
    if (
      !Number.isSafeInteger(value) ||
      value < limits[0] ||
      value > limits[1]
    ) {
      return '阈值超出允许范围，请检查输入框标注的最小值和最大值。'
    }
  }
  if (config.first_checkin_cooldown_seconds > config.new_account_age_seconds) {
    return '首次领奖冷静期不能大于新账号认定窗口。'
  }
  if (config.burst_rapid_user_threshold > config.burst_new_user_threshold) {
    return '聚集快速领奖账号阈值不能大于聚集新账号阈值。'
  }
  return null
}

export function banIsActive(ban: ProtectionBan, now = Date.now() / 1000) {
  return !ban.revoked_at && (!ban.expires_at || ban.expires_at > now)
}

export function formatTime(seconds: number) {
  return seconds
    ? new Date(seconds * 1000).toLocaleString('zh-CN', { hour12: false })
    : '—'
}

export const scopeLabels = {
  account: '账号限制',
  checkin: '暂缓领奖',
  ip: 'IP 限制',
} as const

export function eventActionLabel(
  decision: string,
  rule: string,
  kind = '',
  scope = ''
) {
  if (decision === 'observed') return '只观察'
  if (decision === 'exempt') return '豁免通过'
  if (decision === 'allowed') return '正常通过'
  if (scope === 'ip') return 'IP 限制'
  if (scope === 'account') return '账号限制'
  if (scope === 'checkin') return '暂缓领奖'
  if (scope === 'registration') return '暂缓注册'
  if (/ip.*ban|ban.*ip/i.test(rule) || rule === 'persistent_batch_abuse') {
    return 'IP 限制'
  }
  if (
    rule === 'native_account_disabled' ||
    /^(manual_account_|account_restriction|user_ban|ban_user)/i.test(rule)
  ) {
    return '账号限制'
  }
  if (kind.startsWith('registration')) return '暂缓注册'
  if (kind === 'access_denied' || rule === 'manual_restriction') {
    return '请求受限'
  }
  return '暂缓领奖'
}

export function eventKindLabel(kind: string) {
  const labels: Record<string, string> = {
    checkin_attempt: '签到领奖',
    registration: '注册',
    registration_attempt: '注册提交',
    login: '登录',
    activity: '账号活动',
    access_denied: '访问拦截',
    token_created: '创建令牌',
    automatic_action: '自动处置',
  }
  return labels[kind] || '账号活动'
}
