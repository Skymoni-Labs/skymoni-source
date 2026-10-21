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
import type { TFunction } from 'i18next'

import { getBusinessGroupLabel } from '@/lib/business-group-display'

import type { PricingModel } from '../types'

export const BUSINESS_PRICING_GROUPS = [
  'default',
  'metered',
  'moni-gpt-017',
  'per-request',
  'typesafe',
] as const

// These are the four station presets. A group created later is also visible
// when it has a published model; only the retired migration groups stay hidden.
export type BusinessPricingGroup = string

const RETIRED_GROUPS = new Set([
  'deepseek',
  'deepseek-sub',
  'moni-claude-api-standard',
  'moni-claude-code-premium',
  'moni-claude-code-standard',
  'moni-gemini-image',
  'moni-gemini-standard',
  'moni-gpt-image',
  'moni-gpt-premium',
  'moni-gpt-standard',
  'moni-grok-standard',
])

export function isBusinessPricingGroup(
  group: string
): group is BusinessPricingGroup {
  return !!group && group !== 'auto' && !RETIRED_GROUPS.has(group)
}

export function filterBusinessPricingGroups(
  groups: string[],
  selection: readonly string[] | null = null
): BusinessPricingGroup[] {
  if (selection !== null) {
    return groups.filter((group) => selection.includes(group))
  }
  return groups.filter(isBusinessPricingGroup)
}

export function normalizePricingGroupFilter(
  group: string | undefined,
  selection: readonly string[] | null = null
): BusinessPricingGroup | 'all' {
  if (selection !== null) {
    return group && selection.includes(group) ? group : 'all'
  }
  return group && isBusinessPricingGroup(group) ? group : 'all'
}

export function getVisiblePricingGroups(
  usableGroup: Record<string, { desc: string; ratio: number }>,
  models: PricingModel[],
  selection: readonly string[] | null = null
): BusinessPricingGroup[] {
  if (selection !== null) return [...selection]
  const modelGroups = new Set(
    models.flatMap((model) => model.enable_groups || [])
  )
  const active = Object.keys(usableGroup).filter(
    (group) => isBusinessPricingGroup(group) && modelGroups.has(group)
  )
  const presets = BUSINESS_PRICING_GROUPS.filter((group) =>
    active.includes(group)
  )
  const presetKeys = new Set<string>(BUSINESS_PRICING_GROUPS)
  const custom = active
    .filter((group) => !presetKeys.has(group))
    .sort((a, b) => a.localeCompare(b))
  return [...presets, ...custom]
}

/** Presentation only: selection and price lookups keep the original group key. */
export function getPricingGroupLabel(
  group: BusinessPricingGroup,
  t: TFunction,
  labels: Record<string, string> = {}
): string {
  const custom = Object.hasOwn(labels, group) ? labels[group]?.trim() : ''
  return custom || getBusinessGroupLabel(group, t)
}
