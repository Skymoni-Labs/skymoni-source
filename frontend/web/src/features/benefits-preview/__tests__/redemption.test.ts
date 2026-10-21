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
import { describe, expect, it } from 'vitest'

import { redeemPreviewBenefit } from '../lib/redeem'
import { createPreviewData } from '../lib/seed'

describe('local benefit preview redemption', () => {
  it('redeems a campaign code into an independent warehouse item and consumes one stock item', () => {
    const before = createPreviewData()
    const result = redeemPreviewBenefit(before, ' sky-muse-2026 ', '2026-10-05')
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Expected success')
    expect(result.data.warehouse).toHaveLength(3)
    expect(
      result.item.fields.find((field) => field.id === 'account')?.value
    ).toBe('muse-demo-1@example.com')
    expect(result.item.expires).toBe('2026-11-04')
    expect(result.data.inventory.filter((item) => item.claimed)).toHaveLength(1)
    expect(before.inventory.every((item) => !item.claimed)).toBe(true)
  })
  it('rejects an already redeemed code without another delivery', () => {
    const first = redeemPreviewBenefit(
      createPreviewData(),
      'SKY-MUSE-2026',
      '2026-10-05'
    )
    if (!first.success) throw new Error('Expected success')
    expect(
      redeemPreviewBenefit(first.data, 'SKY-MUSE-2026', '2026-10-05')
    ).toEqual({
      success: false,
      errorKey: 'You have already redeemed this benefit code',
    })
  })
  it('rejects exhausted inventory without consuming the code', () => {
    const data = createPreviewData()
    data.inventory = []
    expect(redeemPreviewBenefit(data, 'SKY-MUSE-2026', '2026-10-05')).toEqual({
      success: false,
      errorKey: 'This benefit is out of stock',
    })
    expect(data.codes[0].claimed).toBe(0)
  })
  it('keeps delivered content independent of later admin edits', () => {
    const data = createPreviewData()
    const result = redeemPreviewBenefit(data, 'SKY-MUSE-2026', '2026-10-05')
    if (!result.success) throw new Error('Expected success')
    result.data.benefits[0].name = 'Changed title'
    result.data.inventory[0].fields[0].value = 'https://example.com/changed'
    expect(result.item.benefit.name).toBe('Muse 音乐创作账号')
    expect(result.item.fields[0].value).toBe('https://example.com/muse-demo')
  })
  it.each([
    ['unknown', { code: 'UNKNOWN' }, 'Benefit code not found'],
    ['expired', { expires: '2026-10-04' }, 'This benefit code has expired'],
    ['disabled', { enabled: false }, 'This benefit code is disabled'],
    ['exhausted', { claimed: 5 }, 'This benefit code has reached its limit'],
  ])('rejects a %s code', (_, changes, errorKey) => {
    const data = createPreviewData()
    const requested = 'SKY-MUSE-2026'
    if ('code' in changes) {
      expect(redeemPreviewBenefit(data, changes.code, '2026-10-05')).toEqual({
        success: false,
        errorKey,
      })
    } else {
      Object.assign(data.codes[0], changes)
      expect(redeemPreviewBenefit(data, requested, '2026-10-05')).toEqual({
        success: false,
        errorKey,
      })
    }
  })
})
