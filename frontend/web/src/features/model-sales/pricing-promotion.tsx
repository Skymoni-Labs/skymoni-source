import { useQuery } from '@tanstack/react-query'
import { BadgePercent, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { getPricing } from '@/features/pricing/api'
import { SalePrice } from '@/features/pricing/components/sale-price'
import { useReferenceFX } from '@/features/pricing/hooks/use-reference-fx'
import { formatBillingCondition } from '@/features/pricing/lib/billing-expression/condition-display'
import { siteCreditUSDValue } from '@/features/pricing/lib/standard-quote'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listPublicSales } from './api'
import { FlipCountdown } from './countdown'
import { promotionDetails, publicSaleModelName } from './promotion-details'
import { publicCountdown } from './public-countdown'

import './sale.css'

export function PricingSaleBanner() {
  const { t, i18n } = useTranslation()
  const fx = useReferenceFX()
  const query = useQuery({
    queryKey: ['public-model-sales'],
    queryFn: listPublicSales,
    refetchInterval: 10000,
    staleTime: 5000,
  })
  // Share the catalogue query already used by both pricing views. No separate
  // request per model and no hardcoded promotional prices in this banner.
  const pricing = useQuery({
    queryKey: ['pricing'],
    queryFn: async () => requireServerSuccess(await getPricing()),
    staleTime: 30000,
    refetchInterval: 30000,
    enabled: Boolean(query.data?.items.length),
  })
  if (!query.data?.items.length) return null
  const sales = query.data.items
  const active = sales.filter((sale) => sale.status === 'active')
  const candidates = active.length ? active : sales
  const clocks = candidates.map((sale) =>
    publicCountdown(sale, query.data!.server_time)
  )
  const clock = clocks.reduce((first, item) =>
    item.target < first.target ? item : first
  )
  const sameDeadline = clocks.every((item) => item.target === clock.target)
  const modelNames = [
    ...new Set(sales.flatMap((sale) => sale.models).map(publicSaleModelName)),
  ]
  const title =
    sales.length === 1
      ? sales[0].title
      : sales.every((sale) => sale.end_at - sale.start_at === 7 * 86400)
        ? '模型七天限时降价'
        : '模型限时优惠'
  const details = promotionDetails(
    sales,
    pricing.data?.data ?? [],
    siteCreditUSDValue(fx.rate),
    fx.rate
  )
  const formatRate = (
    rate: (typeof details)[number]['rates'][number],
    original = false
  ) => {
    const value = original ? rate.original : rate.target
    return value === undefined
      ? undefined
      : rate.unit === 'request'
        ? `¥${value}/次`
        : `${value}×`
  }
  return (
    <div className="mb-6" aria-label="限时模型优惠">
      <section className="sale-square-banner">
        <div className="sale-square-header">
          <div className="min-w-0">
            <p className="sale-eyebrow flex items-center gap-2">
              <BadgePercent className="size-4" />
              {active.length ? '模型限时降价' : '模型优惠预告'}
            </p>
            <h2 className="mt-2 text-lg font-semibold">{title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {modelNames.length} 个模型 ·{' '}
              {active.length
                ? '原倍率 → 优惠倍率 · 详情直接查看'
                : sales.every((sale) => sale.announcement_only)
                  ? '降价预告 · 实际降价待管理员启用，当前价格未变'
                  : '到达开始时间后，核验成本再执行'}
            </p>
          </div>
          <div className="sale-square-countdown">
            <p>
              {sameDeadline
                ? clock.label
                : active.length
                  ? '最近优惠结束'
                  : '最近活动开始'}
            </p>
            <FlipCountdown
              target={clock.target}
              serverTime={query.data.server_time}
            />
          </div>
        </div>
        <div
          className="sale-promotion-grid"
          aria-label="全部参与模型的降价详情"
        >
          {details.map((detail, index) => {
            const schedule =
              detail.schedule &&
              formatBillingCondition(
                detail.schedule.condition,
                t,
                i18n.language
              )
            const sale = sales.find((item) =>
              item.models.some((name) =>
                detail.models.includes(publicSaleModelName(name))
              )
            )!
            return (
              <section
                className="sale-promotion-group"
                key={`${detail.title}-${index}`}
                aria-label={`${detail.title}降价详情`}
              >
                <div className="sale-promotion-group-header">
                  <h3>{detail.title}</h3>
                  <a
                    href={`/model-offers/${sale.id}`}
                    aria-label={`${detail.title}活动页面`}
                    title="活动页面"
                  >
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </div>
                <div className="sale-promotion-rates">
                  {detail.rates.map((rate) => (
                    <p key={rate.label}>
                      <span>{rate.label || '优惠价'}</span>
                      <SalePrice
                        kind={
                          rate.unit === 'multiplier' ? 'multiplier' : 'price'
                        }
                        original={formatRate(rate, true)}
                      >
                        {formatRate(rate)}
                      </SalePrice>
                    </p>
                  ))}
                  {detail.pending && (
                    <p className="text-muted-foreground">
                      {pricing.isError
                        ? '价格暂未加载，请刷新重试'
                        : '正在核对报价…'}
                    </p>
                  )}
                </div>
                <ul className="sale-promotion-models" aria-label="适用模型 ID">
                  {detail.models.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
                {schedule && (
                  <p className="sale-promotion-schedule">
                    高峰：{detail.schedule?.daily ? '每天 ' : ''}
                    {schedule.replace('Asia/Shanghai', '北京时间 UTC+8')}
                  </p>
                )}
                {detail.schedule?.exclusions.length ? (
                  <p className="sale-promotion-schedule">
                    以下日期用普通价：
                    {detail.schedule.exclusions
                      .map(
                        (condition) =>
                          formatBillingCondition(condition, t, i18n.language) ??
                          condition
                      )
                      .join('；')}
                  </p>
                ) : null}
                {!sameDeadline && (
                  <p className="sale-promotion-schedule">
                    截止{' '}
                    {new Date(detail.endAt * 1000).toLocaleString('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                    })}
                    （北京）
                  </p>
                )}
              </section>
            )
          })}
        </div>
        <p className="sale-promotion-note">
          按 ¥9.9 / 99 额度换算、对照官方基价。
          {details.some((detail) => detail.schedule) &&
            'DeepSeek 两档均以普通时段官方价为 1×；高峰以各卡片时段为准，其余时间按普通价。'}
        </p>
      </section>
    </div>
  )
}
