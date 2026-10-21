import type { PublicSale } from './api'

export function publicCountdown(sale: PublicSale, now: number) {
  const untilStart =
    sale.countdown_mode === 'start' ||
    (sale.countdown_mode === 'auto' && now < sale.start_at)
  return {
    target: untilStart ? sale.start_at : sale.end_at,
    label: `距${sale.announcement_only ? '计划' : ''}${untilStart ? '开始' : '结束'}`,
  }
}
