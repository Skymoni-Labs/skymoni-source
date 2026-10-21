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

import { QUOTA_TYPES } from '../constants'
import {
  getBillingModeLabelKey,
  getPricingQuotaType,
} from '../lib/billing-mode'
import { filterByQuotaType } from '../lib/filters'
import type { PricingModel } from '../types'

const base: PricingModel = {
  id: 1,
  model_name: 'example',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: ['default'],
}

describe('effective pricing type', () => {
  it('classifies fixed request expressions even when legacy quota_type says token', () => {
    const request = {
      ...base,
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("request", fixed(0.091046))',
    }
    expect(getPricingQuotaType(request)).toBe(QUOTA_TYPES.REQUEST)
    expect(getBillingModeLabelKey(request)).toBe('Per Request')
  })

  it('keeps image units, token prices, and Jev input usage out of the request bucket', () => {
    const models: PricingModel[] = [
      {
        ...base,
        id: 1,
        model_name: 'chat-token',
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("standard", p * 2 + c * 8)',
      },
      {
        ...base,
        id: 2,
        model_name: 'image-per-image',
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("1K", fixed(0.5)) * image_count',
      },
      {
        ...base,
        id: 3,
        model_name: 'image-single',
        billing_mode: 'tiered_expr',
        billing_expr:
          'param("size") == "4K" ? tier("4K_single_image", fixed(1)) : tier("1K_single_image", fixed(0.5))',
      },
      {
        ...base,
        id: 4,
        model_name: 'jev-latest',
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("base", u("input_tokens") * 0.0467 / 1000000)',
        billing_usage_schema: {
          input_tokens: { type: 'number', unit: 'token' },
        },
      },
      {
        ...base,
        id: 5,
        model_name: 'chat-request',
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("request", fixed(0.091046))',
      },
      {
        ...base,
        id: 6,
        model_name: 'legacy-request',
        quota_type: 1,
        model_price: 0.2,
      },
    ]

    expect(
      filterByQuotaType(models, QUOTA_TYPES.TOKEN).map((m) => m.model_name)
    ).toEqual(['chat-token', 'image-per-image', 'image-single'])
    expect(
      filterByQuotaType(models, QUOTA_TYPES.REQUEST).map((m) => m.model_name)
    ).toEqual(['chat-request', 'legacy-request'])
    expect(
      filterByQuotaType(models, QUOTA_TYPES.TASK).map((m) => m.model_name)
    ).toEqual(['jev-latest'])
  })
})
