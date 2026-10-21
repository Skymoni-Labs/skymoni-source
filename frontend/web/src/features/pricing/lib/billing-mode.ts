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
import { QUOTA_TYPES, type QuotaTypeOption } from '../constants'
import type { PricingModel } from '../types'
import { parseTiersFromExpr } from './billing-expr'
import { hasTaskUsageSchema, isDynamicPricingModel } from './dynamic-price'
import { isTokenBasedModel } from './model-helpers'

export type BillingModeLabelKey =
  | 'Per Request'
  | 'Dynamic Pricing'
  | 'Token-based'
  | 'Task billing'

/** Classify the effective price, not the legacy quota_type left behind by expressions. */
export function getPricingQuotaType(
  model: PricingModel
): Exclude<QuotaTypeOption, typeof QUOTA_TYPES.ALL> {
  if (hasTaskUsageSchema(model)) return QUOTA_TYPES.TASK

  if (isDynamicPricingModel(model)) {
    const tiers = parseTiersFromExpr(model.billing_expr ?? '')
    // A fixed image price is per image, not per API call. Requiring the
    // explicit request tier also avoids labeling conditional image prices
    // (which use fixed()) as chat requests.
    if (
      tiers.length > 0 &&
      tiers.every(
        (tier) =>
          tier.billingUnit === 'request' &&
          tier.label === 'request' &&
          !tier.imageCount
      )
    ) {
      return QUOTA_TYPES.REQUEST
    }
    return QUOTA_TYPES.TOKEN
  }

  return isTokenBasedModel(model) ? QUOTA_TYPES.TOKEN : QUOTA_TYPES.REQUEST
}

export function getBillingModeLabelKey(
  model: PricingModel
): BillingModeLabelKey {
  // Task-usage models badge as one business category; the metering unit
  // ($/1M token, $/credit, $/second) is already carried by the price line.
  if (hasTaskUsageSchema(model)) return 'Task billing'
  if (getPricingQuotaType(model) === QUOTA_TYPES.REQUEST) return 'Per Request'
  if (isDynamicPricingModel(model)) return 'Dynamic Pricing'
  if (isTokenBasedModel(model)) return 'Token-based'
  return 'Per Request'
}
