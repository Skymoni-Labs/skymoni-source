import type { PricingModel } from '@/features/pricing/types'

export function originalSaleModel(
  model: PricingModel
): PricingModel | undefined {
  const original = model.promotion?.original
  if (!original) return undefined
  return {
    ...model,
    promotion: undefined,
    billing_mode: original['billing_setting.billing_mode'] as
      | string
      | undefined,
    billing_expr: original['billing_setting.billing_expr'] as
      | string
      | undefined,
    model_price: original.ModelPrice as number | undefined,
    quota_type: original.ModelPrice === undefined ? 0 : 1,
  }
}
