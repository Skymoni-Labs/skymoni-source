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

import { formatNumber } from '@/lib/format'

import type { PopupAudience, PopupFrequency, PopupStatus } from '../types'

export function popupAudienceLabel(
  audience: PopupAudience,
  t: TFunction
): string {
  if (audience === 'user') return t('Specific user')
  if (audience === 'guest') return t('Visitors who are not signed in')
  return t('All signed-in users')
}

export function popupFrequencyLabel(
  frequency: PopupFrequency,
  t: TFunction
): string {
  if (frequency === 'daily') return t('Once per day (Beijing time)')
  if (frequency === 'visit') return t('Once per page visit')
  return t('Once per revision')
}

export function popupStatusLabel(status: PopupStatus, t: TFunction): string {
  if (status === 'published') return t('Published')
  if (status === 'disabled') return t('Disabled')
  return t('Draft')
}

export function popupDurationLabel(
  days: number,
  t: TFunction,
  locale?: string
): string {
  if (days === 0) return t('Unlimited display')
  return t('{{days}} days', { days: formatNumber(days, locale) })
}
