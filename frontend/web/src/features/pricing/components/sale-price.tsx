import type { ReactNode } from 'react'

export function SalePrice({
  children,
  original,
  kind = 'price',
}: {
  children: ReactNode
  original?: ReactNode
  kind?: 'price' | 'multiplier'
}) {
  if (original === undefined || original === children) return <>{children}</>
  return (
    <span className='inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5'>
      <del
        aria-label={kind === 'multiplier' ? '原倍率' : '原价'}
        className='text-muted-foreground text-xs font-normal line-through decoration-current'
        style={{ textDecorationLine: 'line-through' }}
      >
        {original}
      </del>
      <span
        aria-label={kind === 'multiplier' ? '优惠倍率' : '限时优惠价'}
        className='font-semibold text-sky-500'
      >
        {children}
      </span>
    </span>
  )
}
