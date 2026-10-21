import { useStatus } from '@/hooks/use-status'

import { LEGACY_CNY_PER_REAL_USD } from '../lib/standard-quote'

export function useReferenceFX() {
  const { status } = useStatus()
  const published = status?.reference_usd_cny
  const rate =
    typeof published === 'number' &&
    Number.isFinite(published) &&
    published >= 4 &&
    published <= 10
      ? published
      : LEGACY_CNY_PER_REAL_USD
  return {
    rate,
    verified: rate === published,
    date:
      rate === published && typeof status?.reference_fx_date === 'string'
        ? status.reference_fx_date
        : null,
  }
}
