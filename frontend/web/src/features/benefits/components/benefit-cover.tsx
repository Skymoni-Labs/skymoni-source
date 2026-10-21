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
import { Music2, Palette, Ticket, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { Benefit } from '../types'

export function BenefitCover(props: { benefit: Benefit; compact?: boolean }) {
  const icons = {
    account: Music2,
    resource: Palette,
    license: Ticket,
    custom: Sparkles,
  }
  const Icon = icons[props.benefit.category]
  const tones = {
    violet:
      'from-violet-100 via-purple-50 to-rose-50 text-violet-600 dark:from-violet-950 dark:via-purple-950 dark:to-slate-900',
    sky: 'from-sky-100 via-cyan-50 to-blue-50 text-sky-600 dark:from-sky-950 dark:via-cyan-950 dark:to-slate-900',
    amber:
      'from-amber-100 via-orange-50 to-yellow-50 text-amber-600 dark:from-amber-950 dark:via-orange-950 dark:to-slate-900',
  }
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br',
        tones[props.benefit.tone],
        props.compact ? 'size-12 rounded-xl' : 'h-40 rounded-t-2xl'
      )}
    >
      {!props.compact && (
        <>
          <div className='absolute -top-12 -right-4 size-40 rounded-full border border-white/60' />
          <div className='absolute -bottom-24 -left-10 size-52 rounded-full border border-white/60' />
        </>
      )}
      <div
        className={cn(
          'flex items-center justify-center',
          !props.compact &&
            'size-20 rounded-3xl border border-white/80 bg-white/65 shadow-sm dark:bg-white/5'
        )}
      >
        <Icon
          aria-hidden='true'
          className={props.compact ? 'size-6' : 'size-9'}
        />
      </div>
    </div>
  )
}
