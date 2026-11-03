import { useQuery } from '@tanstack/react-query'
import { Activity, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PerformanceMetricsData } from '@/features/performance-metrics/types'
import { api } from '@/lib/api'

type Point = {
  at: number
  success: boolean
  latency_ms: number
  source: string
  count: number
  failures: number
}
type State = {
  status: string
  last_at: number
  successes: number
  failures: number
  action: string
  history: Point[] | null
}
type Pool = {
  id: string
  provider: string
  account: string
  upstream_model: string
  upstream_group: string
  multiplier: number
  auto: boolean
  channels: number
  matched: number
  enabled: number
  state: State
}
type Model = {
  model: string
  status: string
  last_at: number
  metrics: PerformanceMetricsData['data']
  samples: Point[]
}
type Data = {
  models?: Model[]
  pools?: Pool[]
  server_time: number
  enabled?: boolean
}

const statusText: Record<string, string> = {
  available: '可用',
  degraded: '有波动',
  unavailable: '异常',
  unknown: '待确认',
}
const statusColor: Record<string, string> = {
  available: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  degraded: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  unavailable: 'bg-red-500/10 text-red-600 dark:text-red-400',
  unknown: 'bg-muted text-muted-foreground',
}
const ms = (n?: number | null) =>
  n && n > 0 ? `${n.toLocaleString()} ms` : '—'
const date = (n: number) =>
  n ? new Date(n * 1000).toLocaleString('zh-CN', { hour12: false }) : '尚无记录'

const sampleDescription = (p?: Point) => {
  if (!p) return '等待首轮检测'
  const sources: Record<string, string> = {
    real: '真实请求',
    mixed: '真实请求＋主动抽样',
  }
  const source = sources[p.source] ?? '主动抽样'
  const successes = p.count - p.failures
  return `${source} · 成功 ${successes}/${p.count}（${p.count ? ((successes / p.count) * 100).toFixed(0) : 0}%）`
}
const modelSource = (probe: Point | undefined, last: number) => {
  if (probe) return '线路抽样参考'
  return last ? '真实请求统计' : '缺少近期样本，状态待确认'
}
const historyColor = (rate: number) => {
  if (rate === 100) return 'h-6 bg-emerald-500'
  return rate === 0 ? 'h-2 bg-red-500' : 'h-4 bg-amber-500'
}

function Status({ value }: { value: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[value] ?? statusColor.unknown}`}
    >
      {statusText[value] ?? '待确认'}
    </span>
  )
}

function History({ points }: { points: { at: number; rate: number }[] }) {
  const recent = points.slice(-60)
  return (
    <div>
      <div
        className='flex h-8 items-end gap-1'
        aria-label='近期检测记录，灰色表示无记录'
      >
        {Array.from({ length: 60 - recent.length }, (_, i) => (
          <span
            key={`empty-${i}`}
            className='bg-muted h-2 min-w-0 flex-1 rounded-sm'
          />
        ))}
        {recent.map((p) => (
          <span
            key={p.at}
            title={`${date(p.at)} · ${p.rate.toFixed(1)}%`}
            className={`min-w-0 flex-1 rounded-sm ${historyColor(p.rate)}`}
          />
        ))}
      </div>
      <div className='text-muted-foreground mt-2 flex justify-between text-[10px]'>
        <span>较早</span>
        <span>最近 · 灰色无记录</span>
      </div>
    </div>
  )
}

export function ChannelStatus({ admin = false }: { admin?: boolean }) {
  const [search, setSearch] = useState('')
  const query = useQuery({
    queryKey: ['channel-health', admin ? 'upstreams' : 'models'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean
        data: Data
        message?: string
      }>(`/api/channel-health/${admin ? 'upstreams' : 'models'}`)
      if (!res.data.success) throw new Error(res.data.message || '读取状态失败')
      return res.data.data
    },
    refetchInterval: 60_000,
  })
  const data = query.data
  const pools =
    data?.pools?.filter((p) =>
      `${p.account} ${p.upstream_model} ${p.upstream_group}`
        .toLowerCase()
        .includes(search.toLowerCase())
    ) ?? []
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {admin ? '上游渠道状态' : '渠道状态'}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          size='sm'
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw
            className={`mr-2 size-4 ${query.isFetching ? 'animate-spin' : ''}`}
          />
          刷新状态
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-6 pb-8'>
          <div className='bg-card rounded-xl border p-5'>
            <div className='mb-2 flex items-center gap-2 font-medium'>
              <Activity className='size-4' />
              {admin ? '分组抽样检测' : 'DeepSeek 模型运行状态'}
            </div>
            <p className='text-muted-foreground text-sm leading-6'>
              {admin
                ? '按上游模型、分组、账号汇总。每 5 分钟抽样 2 把不同密钥，优先复用真实请求，不足时补充小请求，输出上限 8 Token，计量超限即暂停付费探测。0.3 组本轮成功率达到 50%（含）即恢复为备用；连续 3 轮低于 50% 才关闭，达标即清零连续低于阈值的轮数。'
                : '展示本站已开放的 DeepSeek 模型。状态优先依据近期真实请求，缺少流量时参考线路抽样；短请求可用不代表大上下文请求稳定。'}
            </p>
            <p className='text-muted-foreground mt-2 text-xs'>
              页面每 60 秒刷新 · 数据时间 {data ? date(data.server_time) : '—'}
              {admin && data && !data.enabled ? ' · 自动检测未启用' : ''}
            </p>
          </div>
          {query.isError && (
            <p
              role='alert'
              className='rounded-lg border border-red-500/30 p-4 text-sm text-red-500'
            >
              状态读取失败，请稍后刷新。
            </p>
          )}
          {query.isPending && (
            <p className='text-muted-foreground p-6 text-sm'>正在读取状态…</p>
          )}
          {admin ? (
            <>
              <div className='relative max-w-lg'>
                <Search className='text-muted-foreground absolute top-3 left-3 size-4' />
                <Input
                  aria-label='搜索模型、分组、账号'
                  placeholder='搜索模型、分组、账号'
                  className='pl-9'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className='grid gap-4 xl:grid-cols-2'>
                {pools.map((p) => {
                  const history = p.state.history ?? []
                  const latest = history.at(-1)
                  return (
                    <article
                      key={p.id}
                      className='bg-card rounded-2xl border p-5'
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <h2 className='font-semibold break-all'>
                            {p.upstream_model}
                          </h2>
                          <p className='text-muted-foreground mt-1 text-sm'>
                            {p.provider} · {p.account}
                          </p>
                        </div>
                        <Status value={p.state.status} />
                      </div>
                      <div className='bg-muted/50 mt-4 rounded-xl p-3 text-sm'>
                        <span className='font-medium'>{p.upstream_group}</span>
                        <span className='text-muted-foreground ml-2'>
                          {p.multiplier}x
                        </span>
                      </div>
                      <dl className='mt-4 grid grid-cols-2 gap-4 text-sm'>
                        <div>
                          <dt className='text-muted-foreground text-xs'>
                            启用渠道
                          </dt>
                          <dd className='mt-1 font-semibold'>
                            {p.enabled} / {p.channels}
                          </dd>
                        </div>
                        <div>
                          <dt className='text-muted-foreground text-xs'>
                            最近响应耗时
                          </dt>
                          <dd className='mt-1 font-semibold'>
                            {ms(latest?.latency_ms)}
                          </dd>
                        </div>
                      </dl>
                      <p className='text-muted-foreground my-4 text-xs'>
                        {date(p.state.last_at)} · {sampleDescription(latest)}
                      </p>
                      <History
                        points={history.map((h) => ({
                          at: h.at,
                          rate: h.count
                            ? ((h.count - h.failures) / h.count) * 100
                            : 0,
                        }))}
                      />
                      <p className='mt-4 text-xs leading-5'>
                        {p.auto ? '自动启停' : '仅观察'} ·{' '}
                        {p.state.action || '等待检测'}
                        {p.matched !== p.channels ? ' · 渠道配置已变化' : ''}
                      </p>
                    </article>
                  )
                })}
              </div>
              {data && !pools.length && (
                <p className='text-muted-foreground p-6 text-sm'>
                  暂无匹配的上游分组。
                </p>
              )}
            </>
          ) : (
            <>
              <div className='grid gap-4 md:grid-cols-2 2xl:grid-cols-3'>
                {data?.models?.map((m) => {
                  const summary = m.metrics.summary
                  const series = m.metrics.series ?? []
                  const probe = m.samples?.at(-1)
                  const lastPoint = series.at(-1)
                  return (
                    <article
                      key={m.model}
                      className='bg-card rounded-2xl border p-5'
                    >
                      <div className='flex items-start justify-between gap-3'>
                        <div className='flex min-w-0 items-center gap-3'>
                          <div className='flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-sm font-bold text-teal-600'>
                            DS
                          </div>
                          <div className='min-w-0'>
                            <h2 className='text-sm font-semibold break-all'>
                              {m.model}
                            </h2>
                            <p className='text-muted-foreground mt-1 text-xs'>
                              DeepSeek
                            </p>
                          </div>
                        </div>
                        <Status value={m.status} />
                      </div>
                      <dl className='my-5 grid grid-cols-2 gap-2'>
                        <div className='rounded-xl border p-3'>
                          <dt className='text-muted-foreground text-xs'>
                            完整响应耗时
                          </dt>
                          <dd className='mt-2 text-lg font-semibold tabular-nums'>
                            {ms(summary?.avg_latency_ms ?? probe?.latency_ms)}
                          </dd>
                        </div>
                        <div className='rounded-xl border p-3'>
                          <dt className='text-muted-foreground text-xs'>
                            首字延迟
                          </dt>
                          <dd className='mt-2 text-lg font-semibold tabular-nums'>
                            {ms(lastPoint?.avg_ttft_ms)}
                          </dd>
                        </div>
                      </dl>
                      <div className='mb-4 flex items-end justify-between border-y py-3'>
                        <span className='text-muted-foreground text-xs'>
                          真实请求成功率 · 24 小时
                        </span>
                        <span className='text-xl font-semibold tabular-nums'>
                          {summary
                            ? `${summary.success_rate.toFixed(2)}%`
                            : '暂无数据'}
                        </span>
                      </div>
                      <History
                        points={series.map((p) => ({
                          at: p.ts,
                          rate: p.success_rate,
                        }))}
                      />
                      <p className='text-muted-foreground mt-4 text-xs leading-5'>
                        {date(m.last_at)} · {modelSource(probe, m.last_at)}
                      </p>
                    </article>
                  )
                })}
              </div>
              {data && !data.models?.length && (
                <p className='text-muted-foreground p-6 text-sm'>
                  暂无已开放的 DeepSeek 模型。
                </p>
              )}
            </>
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
