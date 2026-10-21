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
import dayjs from '@/lib/dayjs'

import type { PreviewData, WarehouseItem } from '../types'

type RedemptionResult =
  | { success: true; data: PreviewData; item: WarehouseItem }
  | { success: false; errorKey: string }

// Demonstrates the user flow in memory, not a production redemption service.
export function redeemPreviewBenefit(
  data: PreviewData,
  rawCode: string,
  today: string
): RedemptionResult {
  const code = data.codes.find(
    (item) => item.code === rawCode.trim().toUpperCase()
  )
  if (!code) return { success: false, errorKey: 'Benefit code not found' }
  if (!code.enabled) {
    return { success: false, errorKey: 'This benefit code is disabled' }
  }
  if (code.expires && code.expires < today) {
    return { success: false, errorKey: 'This benefit code has expired' }
  }
  if (data.warehouse.some((item) => item.sourceCode === code.code)) {
    return {
      success: false,
      errorKey: 'You have already redeemed this benefit code',
    }
  }
  if (code.claimed >= code.limit) {
    return {
      success: false,
      errorKey: 'This benefit code has reached its limit',
    }
  }
  const benefit = data.benefits.find((item) => item.id === code.benefitId)
  if (!benefit?.enabled) {
    return { success: false, errorKey: 'This benefit is currently unavailable' }
  }
  const stock = data.inventory.find(
    (item) => item.benefitId === benefit.id && !item.claimed
  )
  if (benefit.stockMode === 'individual' && !stock) {
    return { success: false, errorKey: 'This benefit is out of stock' }
  }
  const item: WarehouseItem = {
    id: `received-${code.id}`,
    benefit: structuredClone(benefit),
    fields: structuredClone(stock?.fields ?? benefit.fields),
    received: today,
    expires: benefit.validityDays
      ? dayjs(today).add(benefit.validityDays, 'day').format('YYYY-MM-DD')
      : '',
    status: 'active',
    sourceCode: code.code,
  }
  return {
    success: true,
    item,
    data: {
      ...data,
      codes: data.codes.map((row) =>
        row.id === code.id ? { ...row, claimed: row.claimed + 1 } : row
      ),
      inventory: data.inventory.map((row) =>
        row.id === stock?.id ? { ...row, claimed: true } : row
      ),
      warehouse: [item, ...data.warehouse],
    },
  }
}
