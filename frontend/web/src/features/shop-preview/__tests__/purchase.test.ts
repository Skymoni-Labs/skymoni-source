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
import { describe, expect, test } from 'vitest'

import { addSampleInventory, packageStock } from '../lib/catalog'
import { createShopData } from '../lib/data'
import {
  deliverSampleOrder,
  purchaseSampleProduct,
  refundSampleOrder,
} from '../lib/purchase'

describe('local store purchase simulation', () => {
  test('an additional package uses its own price, inventory and validity', () => {
    const data = createShopData()
    const purchase = purchaseSampleProduct(
      data,
      'muse',
      'extended-1',
      '2026-10-05',
      'extended'
    )
    if (!purchase.success) throw new Error('Purchase failed')
    expect(purchase.order.priceCents).toBe(24900)
    expect(purchase.data.balanceCents).toBe(15000)
    expect(purchase.order.item.expires).toBe('2027-01-03')
    expect(
      purchase.order.item.fields.find((f) => f.id === 'account')?.value
    ).toBe('muse-extended-demo-1@example.com')
    expect(packageStock(purchase.data, data.products[0], 'default')).toBe(8)
    expect(packageStock(purchase.data, data.products[0], 'extended')).toBe(3)
  })

  test('sold-out package cannot take stock from another package', () => {
    const data = createShopData()
    data.inventory = data.inventory.map((row) =>
      row.benefitId === data.products[0].benefit.id && !row.packageId
        ? { ...row, claimed: true }
        : row
    )
    expect(purchaseSampleProduct(data, 'muse', 'out-1', '2026-10-05')).toEqual({
      success: false,
      errorKey: 'This product is sold out',
    })
    expect(packageStock(data, data.products[0], 'extended')).toBe(4)
  })

  test('inventory generation follows custom delivery fields and selected package', () => {
    const data = createShopData()
    data.products[0].benefit.fields = [
      { id: 'activation', label: 'Activation code', kind: 'secret', value: '' },
      { id: 'download', label: 'Download', kind: 'link', value: '' },
    ]
    const added = addSampleInventory(data, data.products[0], 'extended', 2)
    expect(packageStock(added, data.products[0], 'extended')).toBe(6)
    expect(added.inventory.at(-1)?.fields.map((f) => f.label)).toEqual([
      'Activation code',
      'Download',
    ])
    expect(added.inventory.at(-1)?.fields[1].value).toBe(
      'https://example.com/digital-demo'
    )
    expect(packageStock(added, data.products[0], 'default')).toBe(8)
  })
  test('confirmed purchase deducts the displayed credit and assigns one independent account', () => {
    const original = createShopData()
    const result = purchaseSampleProduct(
      original,
      'muse',
      'request-1',
      '2026-10-05 09:30'
    )
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Purchase failed')
    expect(result.data.balanceCents).toBe(30000)
    expect(result.data.inventory.filter((row) => row.claimed)).toHaveLength(1)
    expect(result.order.status).toBe('delivered')
    expect(
      result.order.item.fields.find((field) => field.id === 'account')?.value
    ).toBe('muse-demo-1@example.com')
    expect(original.balanceCents).toBe(39900)
    expect(original.orders).toHaveLength(0)
  })

  test('repeated confirmation of the same checkout does not deduct twice', () => {
    const first = purchaseSampleProduct(
      createShopData(),
      'muse',
      'request-1',
      '2026-10-05 09:30'
    )
    if (!first.success) throw new Error('Purchase failed')
    const second = purchaseSampleProduct(
      first.data,
      'muse',
      'request-1',
      '2026-10-05 09:31'
    )
    expect(second).toEqual(first)
  })

  test('a sold-out product creates no order or deduction', () => {
    const data = createShopData()
    expect(
      purchaseSampleProduct(data, 'license', 'request-1', '2026-10-05')
    ).toEqual({ success: false, errorKey: 'This product is sold out' })
    expect(data.orders).toHaveLength(0)
    expect(data.balanceCents).toBe(39900)
  })

  test('insufficient balance leaves inventory available', () => {
    const data = createShopData()
    data.balanceCents = 100
    expect(
      purchaseSampleProduct(data, 'muse', 'request-1', '2026-10-05')
    ).toEqual({ success: false, errorKey: 'Not enough wallet credit' })
    expect(data.inventory.some((row) => row.claimed)).toBe(false)
  })

  test('an invalid price cannot create a credit or a free purchase', () => {
    const data = createShopData()
    data.products[0].priceCents = -1
    expect(
      purchaseSampleProduct(data, 'muse', 'request-1', '2026-10-05')
    ).toEqual({ success: false, errorKey: 'Invalid product price' })
  })

  test('refund returns the original purchase price once even after a price change', () => {
    const bought = purchaseSampleProduct(
      createShopData(),
      'muse-manual',
      'request-1',
      '2026-10-05'
    )
    if (!bought.success) throw new Error('Purchase failed')
    bought.data.products[1].priceCents = 25000
    const refunded = refundSampleOrder(bought.data, bought.order.id)
    expect(refunded.balanceCents).toBe(39900)
    expect(refunded.orders[0].status).toBe('refunded')
    expect(
      refunded.inventory.find((row) => row.id === bought.order.inventoryId)
        ?.claimed
    ).toBe(false)
    expect(refundSampleOrder(refunded, bought.order.id)).toBe(refunded)
  })

  test('manual account validity starts on delivery rather than payment', () => {
    const bought = purchaseSampleProduct(
      createShopData(),
      'muse-manual',
      'request-1',
      '2026-10-05'
    )
    if (!bought.success) throw new Error('Purchase failed')
    const delivered = deliverSampleOrder(
      bought.data,
      bought.order.id,
      '2026-10-09'
    )
    expect(delivered.orders[0].status).toBe('delivered')
    expect(delivered.orders[0].item.received).toBe('2026-10-09')
    expect(delivered.orders[0].item.expires).toBe('2026-11-08')
    expect(delivered.balanceCents).toBe(bought.data.balanceCents)
  })
})
