/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import { shouldShowRechargePrice } from '../lib/price-display-mode'

describe('pricing display mode', () => {
  it.each(['USD', 'CUSTOM'] as const)(
    'shows the actual wallet deduction for %s even when recharge view was requested',
    (displayType) => {
      expect(shouldShowRechargePrice(displayType, true)).toBe(false)
    }
  )

  it.each(['CNY', 'TOKENS'] as const)(
    'keeps the existing recharge view for %s',
    (displayType) => {
      expect(shouldShowRechargePrice(displayType, true)).toBe(true)
      expect(shouldShowRechargePrice(displayType, false)).toBe(false)
    }
  )
})
