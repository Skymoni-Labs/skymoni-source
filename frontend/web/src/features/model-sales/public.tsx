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
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BadgePercent } from 'lucide-react'

import { getPublicSale, saleStatus } from './api'
import { FlipCountdown } from './countdown'
import { publicCountdown } from './public-countdown'
import { SaleTimePrices } from './time-prices'

import './sale.css'

const beijingTime = (value: number) =>
  new Date(value * 1000).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
export function ModelOffer({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['model-offer', id],
    queryFn: () => getPublicSale(id),
    refetchInterval: 10000,
    retry: false,
  })
  const sale = query.data
  const target = sale ? publicCountdown(sale, sale.server_time).target : 0
  let content = <p className='mt-6'>正在读取活动…</p>
  if (query.isError) {
    content = <p className='mt-6'>活动不存在或暂时无法读取，请稍后重试。</p>
  } else if (sale) {
    const enabled = ['scheduled', 'active', 'announced'].includes(sale.status)
    const preview = ['draft', 'paused'].includes(sale.status)
    let detail = (
      <p className='mt-6 text-sm text-slate-400'>
        {preview
          ? '此活动尚未启用，当前价格未变。'
          : '此优惠已停止，请到模型广场查看当前价格。'}
      </p>
    )
    if (enabled) {
      detail = (
        <>
          <FlipCountdown target={target} serverTime={sale.server_time} />
          <p className='text-xs text-slate-400'>
            北京时间 {beijingTime(sale.start_at)} — {beijingTime(sale.end_at)}
          </p>
          <div className='mt-6 flex flex-wrap justify-center gap-2'>
            {sale.models.map((model) => (
              <span className='sale-offer-model' key={model}>
                {model}
              </span>
            ))}
          </div>
          <p className='mt-5 text-sm leading-6 text-slate-400'>
            {sale.announcement_only
              ? '此处为降价预告，实际降价待管理员启用，当前价格未变。计划时间以正式活动为准。'
              : '以模型广场当前价格及活动状态为准。活动结束后恢复原价；如成本发生变化，活动可能提前结束。'}
          </p>
          <div className='mt-5'>
            <SaleTimePrices
              details={sale.time_prices}
              planned={sale.status !== 'active'}
            />
          </div>
          <a className='sale-public-button' href='/pricing'>
            查看当前模型价格 →
          </a>
        </>
      )
    }
    content = (
      <>
        <BadgePercent className='mx-auto mt-6 size-10 text-sky-300' />
        <h1 className='mt-5 text-2xl font-semibold md:text-3xl'>
          {sale.title}
        </h1>
        <p className='mt-3 text-sky-300'>
          {saleStatus[sale.status] ?? sale.status}
          {enabled && !sale.announcement_only && ' · 各模型独立优惠价格'}
        </p>
        {detail}
      </>
    )
  }
  return (
    <main className='sale-public'>
      <a className='sale-back' href='/dashboard/overview'>
        <ArrowLeft size={16} />
        返回控制台
      </a>
      <section className='sale-public-card'>
        <p className='sale-eyebrow'>SKYMONI / LIMITED OFFER</p>
        {content}
      </section>
    </main>
  )
}
