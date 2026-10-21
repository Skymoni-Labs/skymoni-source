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

import { createShopData } from '../lib/data'
import {
  deliverSampleOrder,
  purchaseSampleProduct,
  refundSampleOrder,
} from '../lib/purchase'
import {
  redeemShopResource,
  resourceAdminData,
  importResourceInventory,
  addResourceCodes,
} from '../lib/resources'

describe('shared shop and resource warehouse', () => {
  test('shared resources can be sold without consuming independent account inventory', () => {
    const data = createShopData()
    const product = data.products.find((p) => p.id === 'design')
    if (!product) throw new Error('Missing product')
    product.onSale = true
    const result = purchaseSampleProduct(
      data,
      'design',
      'shared-1',
      '2026-10-05'
    )
    if (!result.success) throw new Error('Purchase failed')
    expect(result.order.item.fields[0].value).toBe(
      'https://example.com/design-demo'
    )
    expect(result.data.inventory).toEqual(data.inventory)
    expect(result.data.balanceCents).toBe(37000)
  })
  test('purchase and code redemption consume distinct accounts from one stock pool and retain existing resources', () => {
    const data = createShopData()
    const purchase = purchaseSampleProduct(data, 'muse', 'buy-1', '2026-10-05')
    if (!purchase.success) throw new Error('Purchase failed')
    const redemption = redeemShopResource(
      purchase.data,
      'SKY-MUSE-2026',
      '2026-10-05'
    )
    if (!redemption.success) throw new Error('Redemption failed')
    expect(redemption.data.warehouse).toHaveLength(data.warehouse.length + 2)
    expect(redemption.data.balanceCents).toBe(data.balanceCents - 9900)
    expect(redemption.item.fields.find((f) => f.id === 'account')?.value).toBe(
      'muse-demo-2@example.com'
    )
    expect(
      redemption.data.inventory.filter(
        (i) => i.benefitId === 'muse' && !i.packageId && i.claimed
      )
    ).toHaveLength(2)
  })

  test('unlimited campaign permits first claim but blocks the same account from claiming twice', () => {
    const data = createShopData()
    data.codes[0].limit = 0
    const first = redeemShopResource(data, 'SKY-MUSE-2026', '2026-10-05')
    if (!first.success) throw new Error('Redemption failed')
    expect(
      redeemShopResource(first.data, 'SKY-MUSE-2026', '2026-10-05')
    ).toEqual({
      success: false,
      errorKey: 'You have already redeemed this benefit code',
    })
  })

  test('code for an exhausted default package cannot take extended package inventory', () => {
    const data = createShopData()
    data.inventory = data.inventory.map((i) =>
      i.benefitId === 'muse' && !i.packageId ? { ...i, claimed: true } : i
    )
    expect(redeemShopResource(data, 'SKY-MUSE-2026', '2026-10-05')).toEqual({
      success: false,
      errorKey: 'This benefit is out of stock',
    })
  })

  test('a targeted code rejects another user before allocating stock', () => {
    const data = createShopData()
    data.codes[0] = { ...data.codes[0], target: 'user', targetUserId: 2 }
    expect(redeemShopResource(data, 'SKY-MUSE-2026', '2026-10-05', 1)).toEqual({
      success: false,
      errorKey: 'This code is assigned to another user',
    })
    expect(data.inventory.every((i) => !i.claimed)).toBe(true)
  })

  test('manual delivery enters the same warehouse exactly once; pending refund never enters it', () => {
    const data = createShopData()
    const purchase = purchaseSampleProduct(
      data,
      'muse-manual',
      'manual-1',
      '2026-10-05'
    )
    if (!purchase.success) throw new Error('Purchase failed')
    expect(purchase.data.warehouse).toHaveLength(data.warehouse.length)
    const delivered = deliverSampleOrder(
      purchase.data,
      purchase.order.id,
      '2026-10-06'
    )
    expect(
      deliverSampleOrder(delivered, purchase.order.id, '2026-10-07').warehouse
    ).toHaveLength(data.warehouse.length + 1)
    expect(
      refundSampleOrder(purchase.data, purchase.order.id).warehouse
    ).toHaveLength(data.warehouse.length)
  })

  test('admin import and generated codes retain their package when adapted from resource management', () => {
    const data = createShopData()
    const admin = resourceAdminData(data)
    const extended = admin.benefits.find((b) => b.id === 'muse::extended')
    if (!extended) throw new Error('Missing package')
    const imported = importResourceInventory(data, [
      {
        id: 'imported-1',
        benefitId: extended.id,
        claimed: false,
        fields: extended.fields,
      },
    ])
    expect(imported.inventory.at(-1)).toMatchObject({
      benefitId: 'muse',
      packageId: 'extended',
    })
    const added = addResourceCodes(imported, [
      {
        ...data.codes[0],
        id: 'extended-code',
        code: 'EXTENDED',
        benefitId: extended.id,
      },
    ])
    const claim = redeemShopResource(added, 'EXTENDED', '2026-10-05')
    if (!claim.success) throw new Error('Redemption failed')
    expect(claim.item.expires).toBe('2027-01-03')
    expect(claim.item.benefit.name).toContain('90 天')
  })

  test('off-sale resource remains redeemable while paid purchase is blocked', () => {
    const data = createShopData()
    data.products[0].onSale = false
    expect(
      purchaseSampleProduct(data, 'muse', 'off-sale', '2026-10-05').success
    ).toBe(false)
    expect(
      redeemShopResource(data, 'SKY-MUSE-2026', '2026-10-05').success
    ).toBe(true)
  })
})
