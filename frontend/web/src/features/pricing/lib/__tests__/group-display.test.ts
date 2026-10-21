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
import { expect, it } from 'vitest'

import type { PricingModel } from '../../types'
import {
  filterBusinessPricingGroups,
  getVisiblePricingGroups,
  normalizePricingGroupFilter,
} from '../group-display'

it('shows four station presets first and any active custom group afterward', () => {
  const usableGroups = {
    default: { desc: 'All models', ratio: 1 },
    metered: { desc: 'Metered', ratio: 1 },
    'per-request': { desc: 'By request', ratio: 1 },
    typesafe: { desc: 'Jev', ratio: 1 },
    'moni-gpt-standard': { desc: 'GPT', ratio: 1 },
    'my-team': { desc: 'My team', ratio: 1 },
    idle: { desc: 'Unused', ratio: 1 },
    auto: { desc: 'Automatic', ratio: 1 },
  }
  const models = [
    {
      enable_groups: [
        'default',
        'metered',
        'per-request',
        'typesafe',
        'moni-gpt-standard',
        'my-team',
      ],
    },
  ] as PricingModel[]

  expect(getVisiblePricingGroups(usableGroups, models)).toEqual([
    'default',
    'metered',
    'per-request',
    'typesafe',
    'my-team',
  ])
  expect(getVisiblePricingGroups(usableGroups, [])).toEqual([])
})

it('ignores an obsolete group saved in a pricing page URL', () => {
  expect(normalizePricingGroupFilter('moni-gpt-premium')).toBe('all')
  expect(normalizePricingGroupFilter('metered')).toBe('metered')
  expect(normalizePricingGroupFilter('my-team')).toBe('my-team')
})

it('shows only administrator-selected existing groups, including a previously hidden group', () => {
  const available = {
    default: { desc: 'Default', ratio: 1 },
    vip: { desc: 'VIP', ratio: 1 },
    'moni-gpt-premium': { desc: 'GPT', ratio: 1 },
    idle: { desc: 'No models', ratio: 1 },
  }
  const models = [
    { enable_groups: ['default', 'vip', 'moni-gpt-premium'] },
  ] as PricingModel[]
  expect(
    getVisiblePricingGroups(available, models, [
      'vip',
      'moni-gpt-premium',
      'idle',
      'missing',
    ])
  ).toEqual(['vip', 'moni-gpt-premium', 'idle', 'missing'])
  expect(getVisiblePricingGroups(available, models, [])).toEqual([])
  expect(
    filterBusinessPricingGroups(models[0].enable_groups, [
      'vip',
      'moni-gpt-premium',
    ])
  ).toEqual(['vip', 'moni-gpt-premium'])
  expect(
    normalizePricingGroupFilter('moni-gpt-premium', ['moni-gpt-premium'])
  ).toBe('moni-gpt-premium')
  expect(normalizePricingGroupFilter('default', ['vip'])).toBe('all')
})

it('removes retired groups from model-facing price metadata', () => {
  expect(
    filterBusinessPricingGroups([
      'default',
      'deepseek-sub',
      'metered',
      'moni-gpt-premium',
      'typesafe',
      'my-team',
    ])
  ).toEqual(['default', 'metered', 'typesafe', 'my-team'])
})

it('keeps every selected filter button when usable groups or catalog models are fewer', () => {
  const selected = [
    'default',
    'metered',
    'moni-gpt-017',
    'per-request',
    'typesafe',
    'vip',
  ]
  const usable = { default: { desc: 'Default', ratio: 1 } }
  const models = [{ enable_groups: ['default', 'metered'] }] as PricingModel[]
  expect(getVisiblePricingGroups(usable, models, selected)).toEqual(selected)
  expect(getVisiblePricingGroups({}, [], selected)).toEqual(selected)
})
