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
import { Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { useBillingTime } from '../hooks/use-billing-time'
import { formatBillingCondition } from '../lib/billing-expression/condition-display'
import { timePricingInfo, timeTierLabel } from '../lib/time-pricing'

export function TimePricingSchedule({
  expression,
  compact = false,
}: {
  expression: string | undefined
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  const timestamp = useBillingTime(expression)
  const info = timePricingInfo(
    expression,
    timestamp === undefined ? undefined : new Date(timestamp)
  )
  if (!info) return null
  const schedule = formatBillingCondition(info.condition, t, i18n.language)
  if (!schedule) return null
  return (
    <aside
      className={cn(
        'rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-relaxed',
        compact && 'p-2.5'
      )}
    >
      <div className='mb-1.5 flex flex-wrap items-center gap-2'>
        <span className='inline-flex items-center gap-1.5 font-medium text-sky-600 dark:text-sky-300'>
          <Clock3 className='size-3.5' />
          {t('Time-based pricing')}
        </span>
        {info.currentLabel && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-medium',
              info.currentLabel === 'peak'
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            )}
          >
            {t('Now: {{period}}', {
              period: t(timeTierLabel(info.currentLabel)),
            })}
          </span>
        )}
      </div>
      <p>
        {t('Peak hours: {{schedule}}', {
          schedule: schedule.replace(
            'Asia/Shanghai',
            t('Beijing time · UTC+8')
          ),
        })}
      </p>
      <p className='text-muted-foreground'>
        {t(
          'Other times use off-peak prices. The model and API address stay the same.'
        )}
      </p>
      {info.exclusions.length > 0 && (
        <details className='text-muted-foreground mt-1'>
          <summary className='w-fit cursor-pointer'>
            {t('Configured excluded dates use off-peak prices')}
          </summary>
          <p className='mt-1 break-words'>
            {info.exclusions
              .map(
                (condition) =>
                  formatBillingCondition(condition, t, i18n.language) ??
                  condition
              )
              .join('; ')}
          </p>
        </details>
      )}
    </aside>
  )
}
