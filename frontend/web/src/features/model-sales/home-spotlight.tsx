import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Sparkles } from 'lucide-react'

import { listPublicSales, type PublicSale } from './api'
import { FlipCountdown } from './countdown'
import { publicCountdown } from './public-countdown'

import './home-spotlight.css'

export function HomeSaleSpotlightView({
  items,
  serverTime,
}: {
  items: PublicSale[]
  serverTime: number
}) {
  const sales = items.filter(
    (sale) =>
      ['active', 'scheduled', 'announced'].includes(sale.status) &&
      sale.end_at > serverTime
  )
  if (!sales.length) return null
  return (
    <section className='hp-sale-section hp-container' aria-label='模型限时降价'>
      {sales.map((sale) => (
        <a
          className='hp-sale-flight'
          href={`/model-offers/${sale.id}`}
          key={sale.id}
        >
          <div className='hp-sale-orbit' aria-hidden='true'>
            <Sparkles size={26} />
            <span>✦</span>
          </div>
          <div className='hp-sale-copy'>
            <p className='hp-sale-kicker'>
              {sale.status === 'active'
                ? '限时补给 · 优惠进行中'
                : '即将开启 · 模型降价预告'}
            </p>
            <h2>{sale.title}</h2>
            <p>
              {sale.models.length} 款模型 ·{' '}
              {sale.announcement_only
                ? '降价预告，实际价格待启用'
                : '查看参与模型与优惠价格'}
            </p>
          </div>
          <div className='hp-sale-clock'>
            <p>{publicCountdown(sale, serverTime).label}</p>
            <FlipCountdown
              target={publicCountdown(sale, serverTime).target}
              serverTime={serverTime}
            />
          </div>
          <span className='hp-sale-link'>
            查看活动 <ArrowUpRight size={16} />
          </span>
        </a>
      ))}
    </section>
  )
}

export function HomeSaleSpotlight() {
  const query = useQuery({
    queryKey: ['public-model-sales'],
    queryFn: listPublicSales,
    refetchInterval: 10000,
    staleTime: 5000,
  })
  if (!query.data) return null
  return (
    <HomeSaleSpotlightView
      items={query.data.items}
      serverTime={query.data.server_time}
    />
  )
}
