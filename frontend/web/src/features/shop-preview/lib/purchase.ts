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
import dayjs from 'dayjs'

import type { ShopData, ShopOrder } from '../types'
import { isProductOnSale, productForPackage } from './catalog'

export type PurchaseResult =
  | { success: true; data: ShopData; order: ShopOrder }
  | { success: false; errorKey: string }

// An in-memory UI simulation. Real wallet settlement must be a server transaction.
export function purchaseSampleProduct(
  data: ShopData,
  productId: string,
  checkoutId: string,
  created: string,
  packageId = 'default'
): PurchaseResult {
  const previous = data.orders.find((order) => order.checkoutId === checkoutId)
  if (previous) return { success: true, data, order: previous }
  const source = data.products.find((row) => row.id === productId)
  const product = source && productForPackage(source, packageId)
  if (!product || !isProductOnSale(product)) {
    return { success: false, errorKey: 'This product is unavailable' }
  }
  if (!Number.isSafeInteger(product.priceCents) || product.priceCents <= 0) {
    return { success: false, errorKey: 'Invalid product price' }
  }
  if (data.balanceCents < product.priceCents) {
    return { success: false, errorKey: 'Not enough wallet credit' }
  }
  const inventory =
    product.benefit.stockMode === 'individual'
      ? data.inventory.find(
          (row) =>
            row.benefitId === product.benefit.id &&
            (row.packageId || 'default') === packageId &&
            !row.claimed
        )
      : undefined
  if (product.benefit.stockMode === 'individual' && !inventory) {
    return { success: false, errorKey: 'This product is sold out' }
  }
  const id = `MO-20261005-${String(data.orders.length + 1).padStart(4, '0')}`
  const received = dayjs(created).format('YYYY-MM-DD')
  const order: ShopOrder = {
    id,
    checkoutId,
    productId,
    packageId,
    packageName:
      packageId === 'default'
        ? source?.defaultPackageName
        : source?.packages?.find((row) => row.id === packageId)?.name,
    name: product.benefit.name,
    priceCents: product.priceCents,
    inventoryId: inventory?.id || '',
    status: product.delivery === 'instant' ? 'delivered' : 'pending',
    created,
    item: {
      id: `shop-${id}`,
      userId: 1,
      benefit: structuredClone(product.benefit),
      fields: structuredClone(inventory?.fields ?? product.benefit.fields),
      received,
      expires:
        product.benefit.validityDays > 0
          ? dayjs(created)
              .add(product.benefit.validityDays, 'day')
              .format('YYYY-MM-DD')
          : '',
      status: 'active',
      sourceCode: id,
    },
  }
  return {
    success: true,
    order,
    data: {
      ...data,
      balanceCents: data.balanceCents - product.priceCents,
      inventory: data.inventory.map((row) =>
        row.id === inventory?.id ? { ...row, claimed: true } : row
      ),
      orders: [order, ...data.orders],
      warehouse:
        order.status === 'delivered'
          ? [order.item, ...data.warehouse]
          : data.warehouse,
    },
  }
}

export function refundSampleOrder(data: ShopData, orderId: string): ShopData {
  const order = data.orders.find((row) => row.id === orderId)
  if (!order || order.status !== 'pending') return data
  return {
    ...data,
    balanceCents: data.balanceCents + order.priceCents,
    inventory: data.inventory.map((row) =>
      row.id === order.inventoryId ? { ...row, claimed: false } : row
    ),
    orders: data.orders.map((row) =>
      row.id === orderId ? { ...row, status: 'refunded' } : row
    ),
  }
}

export function deliverSampleOrder(
  data: ShopData,
  orderId: string,
  delivered: string
): ShopData {
  const pending = data.orders.find(
    (order) => order.id === orderId && order.status === 'pending'
  )
  if (!pending) return data
  const item = {
    ...pending.item,
    received: dayjs(delivered).format('YYYY-MM-DD'),
    expires:
      pending.item.benefit.validityDays > 0
        ? dayjs(delivered)
            .add(pending.item.benefit.validityDays, 'day')
            .format('YYYY-MM-DD')
        : '',
  }
  return {
    ...data,
    warehouse: [item, ...data.warehouse],
    orders: data.orders.map((order) => {
      if (order.id !== orderId || order.status !== 'pending') return order
      return {
        ...order,
        status: 'delivered',
        item,
      }
    }),
  }
}
