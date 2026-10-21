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
import type {
  BenefitCode,
  BenefitsData,
  InventoryItem,
  WarehouseItem,
} from '@/features/benefits/types'
import dayjs from '@/lib/dayjs'

import type { ShopData } from '../types'
import { getProductPackages, productForPackage } from './catalog'

// Local adapter: one product catalogue and one inventory pool for sales and codes.
export function resourceAdminData(data: ShopData): BenefitsData {
  return {
    benefits: data.products.flatMap((product) =>
      getProductPackages(product).map((pack) => ({
        ...(productForPackage(product, pack.id)?.benefit || product.benefit),
        id: `${product.id}::${pack.id}`,
      }))
    ),
    inventory: data.inventory.map((item) => ({
      ...item,
      benefitId: `${data.products.find((p) => p.benefit.id === item.benefitId)?.id || item.benefitId}::${item.packageId || 'default'}`,
    })),
    codes: data.codes.map((code) => ({
      ...code,
      benefitId: `${data.products.find((p) => p.benefit.id === code.benefitId)?.id || code.benefitId}::${code.packageId || 'default'}`,
    })),
    warehouse: data.warehouse.filter(
      (item) => !data.orders.some((order) => order.item.id === item.id)
    ),
  }
}

export function importResourceInventory(
  data: ShopData,
  items: InventoryItem[]
): ShopData {
  const inventory = items.flatMap((item) => {
    const [productId, packageId] = item.benefitId.split('::')
    const product = data.products.find((p) => p.id === productId)
    if (!product || !productForPackage(product, packageId)) return []
    return [{ ...item, benefitId: product.benefit.id, packageId }]
  })
  return { ...data, inventory: [...data.inventory, ...inventory] }
}

export function addResourceCodes(
  data: ShopData,
  codes: BenefitCode[]
): ShopData {
  const adapted = codes.flatMap((code) => {
    const [productId, packageId] = code.benefitId.split('::')
    const product = data.products.find((p) => p.id === productId)
    if (
      !product ||
      !productForPackage(product, packageId) ||
      data.codes.some((c) => c.code === code.code)
    ) {
      return []
    }
    return [
      {
        ...code,
        benefitId: product.benefit.id,
        packageId,
        targetUserId:
          code.target === 'user' ? code.targetUserId || 1 : undefined,
      },
    ]
  })
  return { ...data, codes: [...adapted, ...data.codes] }
}

export function redeemShopResource(
  data: ShopData,
  rawCode: string,
  today: string,
  userId = 1
):
  | { success: true; data: ShopData; item: WarehouseItem }
  | { success: false; errorKey: string } {
  const code = data.codes.find((c) => c.code === rawCode.trim().toUpperCase())
  if (!code) return { success: false, errorKey: 'Benefit code not found' }
  if (!code.enabled) {
    return { success: false, errorKey: 'This benefit code is disabled' }
  }
  if (code.expires && code.expires < today) {
    return { success: false, errorKey: 'This benefit code has expired' }
  }
  if (code.target === 'user' && code.targetUserId !== userId) {
    return { success: false, errorKey: 'This code is assigned to another user' }
  }
  if (
    data.warehouse.some(
      (item) => item.sourceCode === code.code && (item.userId || 1) === userId
    )
  ) {
    return {
      success: false,
      errorKey: 'You have already redeemed this benefit code',
    }
  }
  if (code.limit > 0 && code.claimed >= code.limit) {
    return {
      success: false,
      errorKey: 'This benefit code has reached its limit',
    }
  }
  const source = data.products.find((p) => p.benefit.id === code.benefitId)
  const product =
    source && productForPackage(source, code.packageId || 'default')
  if (!product?.benefit.enabled) {
    return { success: false, errorKey: 'This benefit is currently unavailable' }
  }
  const stock =
    product.benefit.stockMode === 'individual'
      ? data.inventory.find(
          (item) =>
            item.benefitId === code.benefitId &&
            (item.packageId || 'default') === (code.packageId || 'default') &&
            !item.claimed
        )
      : undefined
  if (product.benefit.stockMode === 'individual' && !stock) {
    return { success: false, errorKey: 'This benefit is out of stock' }
  }
  const item: WarehouseItem = {
    id: `code-${code.id}-${userId}`,
    userId,
    benefit: structuredClone(product.benefit),
    fields: structuredClone(stock?.fields ?? product.benefit.fields),
    received: today,
    expires: product.benefit.validityDays
      ? dayjs(today)
          .add(product.benefit.validityDays, 'day')
          .format('YYYY-MM-DD')
      : '',
    status: 'active',
    sourceCode: code.code,
  }
  return {
    success: true,
    item,
    data: {
      ...data,
      warehouse: [item, ...data.warehouse],
      inventory: data.inventory.map((i) =>
        i.id === stock?.id ? { ...i, claimed: true } : i
      ),
      codes: data.codes.map((c) =>
        c.id === code.id ? { ...c, claimed: c.claimed + 1 } : c
      ),
    },
  }
}
