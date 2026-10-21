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
*/
import { describe, expect, it } from 'vitest'

import { suggestSiteCreditPrice } from '../upstream-sale-suggestion'

const netCnyPerSiteCredit = (999 / 11_000) * 0.982

describe('suggestSiteCreditPrice', () => {
  it.each([
    ['yylx', 6.72, 0.05],
    ['2000run', 0.1, 0.1],
    ['typesafe', 7.2, 0.05],
  ])('uses the current %s cost and target margin', (source, cost, margin) => {
    const expected = cost / netCnyPerSiteCredit / (1 - margin)
    const actual = suggestSiteCreditPrice(source, 1)
    if (actual == null) throw new Error('Expected a price estimate')
    expect(actual).toBeGreaterThanOrEqual(expected - 1e-9)
    expect(actual - expected).toBeLessThan(0.000001 + 1e-9)
  })

  it('applies the same factor to the effective upstream price', () => {
    const expected = (0.03 * 0.1) / netCnyPerSiteCredit / 0.9
    expect(suggestSiteCreditPrice('2000run', 0.03)).toBeCloseTo(expected, 5)
  })

  it('uses the verified FX rate only when it exceeds the YYLX purchase-cost floor', () => {
    const floor = suggestSiteCreditPrice('yylx', 1, 6.713233)
    expect(floor).toBe(suggestSiteCreditPrice('yylx', 1))
    const raised = suggestSiteCreditPrice('yylx', 1, 7.5)
    if (floor == null || raised == null) throw new Error('Expected YYLX estimates')
    expect(raised).toBeGreaterThan(floor)
    expect(suggestSiteCreditPrice('2000run', 1, 7.5)).toBe(
      suggestSiteCreditPrice('2000run', 1)
    )
  })

  it('preserves unknown or invalid upstream prices as unknown', () => {
    expect(suggestSiteCreditPrice('typesafe', null)).toBeNull()
    expect(suggestSiteCreditPrice('yylx', Number.NaN)).toBeNull()
    expect(suggestSiteCreditPrice('yylx', -1)).toBeNull()
    expect(suggestSiteCreditPrice('new-provider', 1)).toBeNull()
  })
})
