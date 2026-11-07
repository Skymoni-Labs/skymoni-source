import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export type AccountChannel = {
  id: number
  name: string
  status: number
  priority: number
  weight: number
  groups: string[]
  models: string[]
  upstream_model: string
}

export type ModelAccount = {
  id: number
  name: string
  provider: string
  remaining: number | null
  unit: string
  pending: number
  enabled: number
  version: string
  channels: AccountChannel[]
}

export type AccountModel = {
  model: string
  channels: number
  enabled: number
  accounts: ModelAccount[]
}

export async function getModelAccounts() {
  const response = await api.get<{ success: boolean; data: AccountModel[] }>(
    '/api/model-accounts'
  )
  return requireServerSuccess(response.data).data
}

export async function saveAccountPriority(values: {
  model: string
  account_id: number
  version: string
  priority: number
}) {
  const response = await api.put<{
    success: boolean
    data: { updated: number }
  }>('/api/model-accounts/priority', values, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  return requireServerSuccess(response.data).data
}

export function priorityLabel(account: ModelAccount) {
  return [...new Set(account.channels.map((channel) => channel.priority))]
    .sort((a, b) => b - a)
    .join(' / ')
}

export function orderedAccounts(accounts: ModelAccount[]) {
  const highest = (account: ModelAccount) =>
    account.channels.reduce(
      (value, channel) => Math.max(value, channel.priority),
      Number.MIN_SAFE_INTEGER
    )
  return accounts
    .map((account) => ({
      ...account,
      channels: [...account.channels].sort(
        (a, b) => b.priority - a.priority || a.id - b.id
      ),
    }))
    .sort((a, b) => highest(b) - highest(a) || a.id - b.id)
}

export function balanceLabel(account: ModelAccount) {
  if (
    account.remaining === null ||
    account.remaining === undefined ||
    !Number.isFinite(account.remaining)
  ) {
    return '余额待核对'
  }
  return `余额 ≈ ${account.remaining.toLocaleString('zh-CN', { maximumFractionDigits: 8 })} ${account.unit || '原生单位'}`
}

export function affectedModels(model: string, account: ModelAccount) {
  return [...new Set(account.channels.flatMap((channel) => channel.models))]
    .filter((alias) => alias !== model)
    .sort()
}

export function parsePriority(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) &&
    parsed >= -2147483648 &&
    parsed <= 2147483647
    ? parsed
    : null
}
