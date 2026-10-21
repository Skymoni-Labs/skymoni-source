import { SalePrice } from '@/features/pricing/components/sale-price'
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
import { TimePricingSchedule } from '@/features/pricing/components/time-pricing-schedule'

import type { SaleTimePrice } from './api'

const price = (value: number | undefined) =>
  value === undefined ? '—' : `$${Number(value.toFixed(8))}`
export const saleTierLabel = (label: string) =>
  ({ peak: '高峰时段', off_peak: '普通时段' })[label] ?? label

export function SaleTimePrices({
  details,
  multipliers,
  planned = true,
}: {
  details: SaleTimePrice[] | undefined
  multipliers?: Record<string, number>
  planned?: boolean
}) {
  if (!details?.length) return null
  return (
    <div className='space-y-4 text-left'>
      {details
        .filter(
          (detail) =>
            detail.model !== 'deepseek-flash' ||
            !details.some((d) => d.model === 'deepseek-v4.1-flash')
        )
        .map((detail) => (
          <section
            key={detail.model}
            className='rounded-xl border border-sky-500/20 bg-sky-500/5 p-3'
          >
            <h3 className='mb-2 text-sm font-semibold break-all text-sky-500 dark:text-sky-300'>
              {detail.model} · 分时段降价
            </h3>
            <TimePricingSchedule expression={detail.billing_expr} compact />
            <div className='mt-3 grid gap-3 sm:grid-cols-2'>
              {detail.tiers.map((tier) => {
                const multiplier =
                  multipliers?.[detail.model] ?? tier.target_multiplier
                return (
                  <div
                    key={tier.label}
                    className='rounded-lg border border-slate-500/20 p-3 text-xs leading-6'
                  >
                    <h4 className='font-semibold'>
                      {saleTierLabel(tier.label)}
                    </h4>
                    <p className='text-muted-foreground mb-1'>
                      该时段官方倍率：
                      <SalePrice
                        kind='multiplier'
                        original={`${Number(tier.original_multiplier.toFixed(4))}×`}
                      >
                        {Number(multiplier.toFixed(4))}×
                      </SalePrice>
                    </p>
                    {(['p', 'c', 'cr'] as const).map((key) => (
                      <p
                        key={key}
                        className='flex flex-wrap justify-between gap-x-2'
                      >
                        <span>
                          {{ p: '输入', c: '输出', cr: '缓存读取' }[key]}
                        </span>
                        <span>
                          <del className='text-muted-foreground'>
                            {price(tier.original[key])}
                          </del>
                          <span className='mx-1'>→</span>
                          <strong className='text-sky-500 dark:text-sky-300'>
                            {price(
                              tier.official[key] === undefined
                                ? undefined
                                : tier.official[key] * multiplier
                            )}
                          </strong>
                        </span>
                      </p>
                    ))}
                  </div>
                )
              })}
            </div>
            <p className='text-muted-foreground mt-2 text-xs leading-5'>
              美元 / 百万 Token，按 ¥9.9 / 99 额度换算。
              {planned
                ? '以上为拟优惠价，成本核验并启用后生效。'
                : '活动期间仍按时段切换价格。'}
              两档都须满足成本保护；普通时段不是全天固定价。
            </p>
          </section>
        ))}
    </div>
  )
}
