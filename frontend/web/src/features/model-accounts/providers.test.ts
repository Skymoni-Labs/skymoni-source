import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import type { AccountModel } from './api'
import {
  accountModelProvider,
  getProviderCatalog,
  groupAccountModels,
  type ProviderCatalog,
} from './providers'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
const catalog: ProviderCatalog = {
  vendors: [
    { id: 1, name: 'DeepSeek', icon: 'DeepSeek.Color' },
    { id: 2, name: 'TypeSafe', icon: 'TypeSafe' },
    { id: 3, name: 'Google', icon: 'Gemini.Color' },
  ],
  models: [
    { model_name: 'jev-1.14.0', name_rule: 0, vendor_id: 2 },
    { model_name: 'deepseek-v4.1-flash-s', name_rule: 0, vendor_id: 1 },
    {
      model_name: 'gemini-',
      name_rule: 1,
      vendor_id: 3,
      matched_models: ['gemini-3.1-pro'],
    },
  ],
}

beforeEach(() => vi.mocked(api.get).mockReset())

describe('model account provider classification', () => {
  it('uses registered model families and server-matched rules', () => {
    expect(accountModelProvider('jev-1.14.0', catalog)).toEqual({
      name: 'TypeSafe',
      icon: 'TypeSafe',
    })
    expect(accountModelProvider('deepseek-v4.1-flash-s', catalog).name).toBe(
      'DeepSeek'
    )
    expect(accountModelProvider('gemini-3.1-pro', catalog).name).toBe('Google')
    expect(
      accountModelProvider('custom-tool', {
        ...catalog,
        models: [{ model_name: 'custom-tool', name_rule: 0, icon: 'TypeSafe' }],
      }).name
    ).toBe('TypeSafe')
  })
  it('retains models without metadata in a fallback brand or unclassified group', () => {
    expect(accountModelProvider('gpt-6.1-sol').name).toBe('OpenAI')
    expect(accountModelProvider('gemini-3.1-pro').name).toBe('Google')
    expect(accountModelProvider('custom-private-model').name).toBe('未分类')
    const names = [
      'custom-private-model',
      'gemini-3.1-pro',
      'jev-1.14.0',
      'deepseek-v4.1-flash-s',
    ]
    const groups = groupAccountModels(
      names.map(
        (model) =>
          ({
            model,
            accounts: [],
            channels: 0,
            enabled: 0,
          }) satisfies AccountModel
      ),
      catalog
    )
    expect(groups.map((g) => g.name)).toEqual([
      'DeepSeek',
      'TypeSafe',
      'Google',
      '未分类',
    ])
    expect(groups.flatMap((g) => g.models)).toHaveLength(names.length)
  })
  it('loads metadata beyond the first page and keeps only classification fields', async () => {
    vi.mocked(api.get).mockImplementation(async (path, config) => {
      if (path === '/api/vendors/') {
        return {
          data: { success: true, data: { items: catalog.vendors, total: 3 } },
        }
      }
      const items =
        config?.params.p === 1
          ? Array.from({ length: 100 }, (_, i) => ({
              model_name: `model-${i}`,
              name_rule: 0,
              bound_channels: [{ name: 'omit-this-field' }],
            }))
          : [catalog.models[0]]
      return { data: { success: true, data: { items, total: 101 } } }
    })
    const result = await getProviderCatalog()
    expect(result.models).toHaveLength(101)
    expect(result.models[100].vendor_id).toBe(2)
    expect(JSON.stringify(result)).not.toContain('omit-this-field')
  })
})
