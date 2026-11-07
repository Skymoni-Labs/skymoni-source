import { api } from '@/lib/api'
import { resolveModelProvider } from '@/lib/model-provider'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { AccountModel } from './api'

export type ProviderModel = {
  model_name: string
  name_rule: number
  vendor_id?: number
  icon?: string
  matched_models?: string[]
}
export type AccountVendor = { id: number; name: string; icon?: string }
export type ProviderCatalog = {
  models: ProviderModel[]
  vendors: AccountVendor[]
}
export type AccountProvider = { name: string; icon?: string }
export type ProviderGroup = AccountProvider & { models: AccountModel[] }

const providerOrder = [
  'DeepSeek',
  'TypeSafe',
  'OpenAI',
  'xAI',
  'Zhipu',
  'MiniMax',
  'Moonshot',
  'Anthropic',
  'Google',
]

async function getPages<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; ; page++) {
    const response = await api.get<{
      success: boolean
      data: { items: T[]; total: number }
    }>(path, {
      params: { p: page, page_size: 100 },
      signal,
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    })
    const data = requireServerSuccess(response.data).data
    if (
      !data ||
      !Array.isArray(data.items) ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0
    ) {
      throw new Error('提供商资料格式无效')
    }
    items.push(...data.items)
    if (items.length >= data.total) return items
    if (data.items.length === 0) throw new Error('提供商资料分页不完整')
  }
}

export async function getProviderCatalog(
  signal?: AbortSignal
): Promise<ProviderCatalog> {
  const [models, vendors] = await Promise.all([
    getPages<ProviderModel>('/api/models/', signal),
    getPages<AccountVendor>('/api/vendors/', signal),
  ])
  // Keep only classification fields, not enriched channel names or metadata notes.
  return {
    models: models.map(
      ({ model_name, name_rule, vendor_id, icon, matched_models }) => ({
        model_name,
        name_rule,
        vendor_id,
        icon,
        matched_models,
      })
    ),
    vendors: vendors.map(({ id, name, icon }) => ({ id, name, icon })),
  }
}

function providerName(name: string) {
  if (name === 'Gemini') return 'Google'
  return name
}

export function accountModelProvider(
  name: string,
  catalog?: ProviderCatalog | null
): AccountProvider {
  const records = catalog?.models ?? []
  const metadata =
    records.find((m) => m.name_rule === 0 && m.model_name === name) ??
    [...records]
      .sort((a, b) => {
        const rank = (rule: number) => ({ 1: 0, 3: 1, 2: 2 })[rule] ?? 3
        return (
          rank(a.name_rule) - rank(b.name_rule) ||
          b.model_name.length - a.model_name.length
        )
      })
      .find((m) => m.matched_models?.includes(name))
  const vendor =
    catalog?.vendors.find((v) => v.id === metadata?.vendor_id) ??
    catalog?.vendors.find(
      (v) => Boolean(metadata?.icon) && v.icon === metadata?.icon
    )
  if (vendor) {
    return {
      name: providerName(vendor.name),
      icon: vendor.icon || metadata?.icon,
    }
  }
  const inferred = resolveModelProvider(name)
  return inferred
    ? { name: providerName(inferred.name), icon: inferred.icon }
    : { name: '未分类' }
}

export function groupAccountModels(
  models: AccountModel[],
  catalog?: ProviderCatalog | null
): ProviderGroup[] {
  const groups = new Map<string, ProviderGroup>()
  for (const model of models) {
    const provider = accountModelProvider(model.model, catalog)
    let group = groups.get(provider.name)
    if (!group) {
      group = { ...provider, models: [] }
      groups.set(provider.name, group)
    }
    group.models.push(model)
  }
  const rank = (name: string) => {
    const index = providerOrder.indexOf(name)
    return index === -1 ? providerOrder.length : index
  }
  return [...groups.values()].sort((a, b) => {
    if (a.name === b.name) return 0
    if (a.name === '未分类') return 1
    if (b.name === '未分类') return -1
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)
  })
}
