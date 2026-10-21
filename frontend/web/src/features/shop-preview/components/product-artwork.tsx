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
import { Music2, AudioLines, Ticket, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { ShopProduct } from '../types'

// Original code artwork for digital goods, alongside optional administrator covers.
export function ProductArtwork(props: {
  product: ShopProduct
  large?: boolean
}) {
  const { t } = useTranslation()
  const license = props.product.benefit.category === 'license'
  if (props.product.coverUrl) {
    return (
      <div
        className={cn(
          'overflow-hidden bg-slate-100',
          props.large ? 'min-h-64 flex-1' : 'h-32'
        )}
      >
        <img
          src={props.product.coverUrl}
          alt=''
          className='size-full object-cover'
        />
      </div>
    )
  }
  return (
    <div
      aria-hidden
      className={cn(
        'relative flex items-center justify-center overflow-hidden',
        props.large
          ? 'min-h-64 flex-1 bg-[#eef1f5] sm:min-h-80'
          : 'h-32 shrink-0',
        !props.large && (license ? 'bg-[#f3eee4]' : 'bg-[#e5edf0]')
      )}
    >
      {license && (
        <div className='relative flex h-20 w-52 rotate-[-7deg] items-center gap-4 rounded-md border border-[#d7ccb6] bg-[#fffdf7] px-5 shadow-[0_12px_24px_-14px_#7b6e51]'>
          <Ticket className='size-8 text-[#9e8150]' />
          <div className='space-y-2'>
            <div className='text-[10px] font-medium tracking-[.18em] text-[#756344]'>
              {t('Digital pass')}
            </div>
            <div className='flex gap-1'>
              {Array.from({ length: 20 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-4 bg-[#b8a079]',
                    i % 3 === 0 ? 'w-0.5' : 'w-1'
                  )}
                />
              ))}
            </div>
          </div>
          <div className='absolute top-8 -right-2 size-4 rounded-full bg-[#f3eee4]' />
          <div className='absolute top-8 -left-2 size-4 rounded-full bg-[#f3eee4]' />
        </div>
      )}
      {!license && (props.product.delivery === 'manual' || !props.large) && (
        <div className='relative flex h-24 w-44 rotate-[7deg] flex-col justify-between rounded-xl border border-white bg-white/80 p-3 shadow-[0_12px_24px_-14px_#456678]'>
          <div className='flex items-center justify-between'>
            <AudioLines className='size-5 text-sky-700' />
            <span className='text-[9px] tracking-widest text-slate-400'>
              {t('Digital goods')}
            </span>
          </div>
          <div className='flex items-end justify-between'>
            <div>
              <div className='text-[9px] tracking-widest text-slate-400'>
                {props.product.categoryLabel}
              </div>
              <div className='mt-1 h-1.5 w-20 rounded-full bg-slate-200' />
            </div>
            <ArrowUpRight className='size-4 text-slate-500' />
          </div>
        </div>
      )}
      {!license && props.product.delivery !== 'manual' && props.large && (
        <div className='relative flex w-full max-w-lg items-center justify-center px-6 py-8 sm:px-12'>
          <div className='absolute top-0 left-4 text-[80px] leading-none font-semibold tracking-[-.08em] text-white/80 sm:left-7 sm:text-[112px]'>
            {props.product.benefit.name.split(' ')[0]}
          </div>
          <div className='relative z-10 grid size-48 place-items-center rounded-full bg-[#20252e] shadow-[0_22px_28px_-16px_#18243d88] sm:size-60'>
            {[92, 80, 67, 55].map((size) => (
              <div
                key={size}
                className='absolute rounded-full border border-white/10'
                style={{ width: `${size}%`, height: `${size}%` }}
              />
            ))}
            <div className='absolute inset-0 rounded-full bg-[conic-gradient(from_30deg,transparent_0deg,#ffffff12_40deg,transparent_90deg,transparent_180deg,#ffffff12_220deg,transparent_270deg)]' />
            <div className='relative grid size-20 place-items-center rounded-full bg-[#74b3cd] sm:size-24'>
              <Music2 className='size-8 text-white' />
              <div className='absolute size-2 rounded-full bg-[#20252e]' />
            </div>
          </div>
          <div className='absolute right-7 bottom-9 z-20 flex h-16 items-center gap-1 rounded-lg border border-white/60 bg-white/80 px-4 shadow-lg backdrop-blur-sm sm:right-9'>
            {[12, 24, 18, 36, 26, 44, 22, 32, 16, 28].map((height) => (
              <span
                key={height}
                className='w-1 rounded-full bg-sky-700/70'
                style={{ height }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
