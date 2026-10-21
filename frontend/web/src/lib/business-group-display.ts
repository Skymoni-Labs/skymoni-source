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

/** User-facing names only; API requests and stored values retain the group key. */
export function getBusinessGroupLabel(group: string, t: TFunction): string {
  switch (group) {
    case 'default':
      return t('Default')
    case 'metered':
      return 'moni-token'
    case 'per-request':
      return 'moni计费'
    case 'moni-gpt-017':
      return 'GPT · 0.17×'
    case 'typesafe':
      return 'Jev'
    default:
      return group
  }
}

/** Official discounts belong in model prices, not billing group badges. */
export function hideBusinessGroupRatio(group?: string | null): boolean {
  return [
    'default',
    'metered',
    'per-request',
    'typesafe',
    'moni-gpt-017',
  ].includes(group || '')
}
