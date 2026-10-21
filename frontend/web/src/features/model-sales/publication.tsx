import { useEffect, useState } from 'react'
import { CalendarClock, Radio, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Sale } from './api'

export const beijingInput = (at: number) =>
  new Date((at + 8 * 3600) * 1000).toISOString().slice(0, 16)
export const parseBeijingInput = (value: string) =>
  Date.parse(`${value}:00+08:00`) / 1000
export function publicationState(sale: Sale | undefined, now: number) {
  if (!sale) return 'unsaved'
  if (
    sale.end_at <= now ||
    !['draft', 'paused', 'active', 'scheduled'].includes(sale.status)
  )
    return 'ended'
  if (!sale.announcement_managed)
    return ['active', 'scheduled'].includes(sale.status)
      ? 'published'
      : 'unpublished'
  if (!sale.announcement_enabled) return 'unpublished'
  return (sale.announcement_at ?? 0) > now ? 'scheduled' : 'published'
}
const labels: Record<string, string> = {
  unsaved: '先保存模板',
  unpublished: '未发布',
  scheduled: '等待定时发布',
  published: '已到发布时间',
  ended: '活动已结束',
}
const time = (at: number) =>
  new Date(at * 1000).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })

export function SalePublication({
  sale,
  serverTime,
  busy,
  dirty,
  onPublish,
  onCancel,
}: {
  sale?: Sale
  serverTime: number
  busy: boolean
  dirty: boolean
  onPublish: (at: number) => void
  onCancel: () => void
}) {
  const [at, setAt] = useState(Math.ceil((serverTime + 300) / 60) * 60)
  useEffect(() => {
    setAt(
      sale?.announcement_at || Math.ceil((Date.now() / 1000 + 300) / 60) * 60
    )
  }, [sale?.id, sale?.revision, sale?.announcement_at])
  const state = publicationState(sale, serverTime)
  const unavailable = !sale || state === 'ended' || busy || dirty
  const invalidTime =
    !Number.isFinite(at) ||
    at < serverTime - 60 ||
    at > serverTime + 30 * 86400 ||
    (sale && at >= sale.end_at)
  return (
    <section className='sale-panel space-y-4' aria-label='倒计时定时发布'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='sale-eyebrow flex items-center gap-2'>
            <Radio className='size-4' />
            公告发布
          </p>
          <h3 className='mt-2 font-semibold'>让倒计时准时登场</h3>
        </div>
        <span
          className={`sale-tag ${state === 'published' ? 'sale-tag-active' : ''}`}
        >
          {labels[state]}
        </span>
      </div>
      <p className='text-muted-foreground text-xs leading-5'>
        到点显示在首页、模型广场和活动页。公告与改价独立，实际降价仍需单独启用。
      </p>
      <label className='sale-field'>
        公告发布时间 · 北京时间
        <Input
          type='datetime-local'
          aria-label='公告发布时间 · 北京时间'
          value={Number.isFinite(at) ? beijingInput(at) : ''}
          onChange={(e) => setAt(parseBeijingInput(e.target.value))}
          disabled={!sale || busy || state === 'ended'}
        />
      </label>
      <div className='flex flex-wrap gap-2'>
        <Button
          size='sm'
          disabled={unavailable || invalidTime}
          onClick={() => onPublish(at)}
        >
          <CalendarClock className='size-4' />
          {sale?.announcement_enabled ? '更新发布计划' : '定时发布'}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={unavailable}
          onClick={() => onPublish(Math.floor(Date.now() / 1000))}
        >
          立即发布
        </Button>
        {(sale?.announcement_enabled ||
          (!sale?.announcement_managed &&
            ['scheduled', 'active'].includes(sale?.status ?? ''))) && (
          <Button size='sm' variant='ghost' disabled={busy} onClick={onCancel}>
            取消公告
          </Button>
        )}
      </div>
      {dirty && (
        <p className='text-xs text-amber-500'>
          先保存修改后的模板，再设置发布计划。
        </p>
      )}
      {invalidTime && sale && (
        <p className='text-xs text-amber-500'>
          请选择当前时间至未来 30 天内、早于活动结束的时间。
        </p>
      )}
      {sale?.announcement_enabled && (
        <div className='rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-6'>
          <p>公告发布：{time(sale.announcement_at ?? 0)}</p>
          <p>计划降价：{time(sale.start_at)}</p>
          <p className='text-muted-foreground'>
            {['active', 'scheduled'].includes(sale.status)
              ? '实际降价已单独启用'
              : '实际降价未启用 · 当前价格未变'}
          </p>
        </div>
      )}
      <p className='text-muted-foreground flex items-start gap-2 text-xs leading-5'>
        <ShieldCheck className='mt-0.5 size-4 shrink-0 text-sky-400' />
        发布时核验成本；价格或成本失效会隐藏公告。编辑模板会取消已保存的发布计划。邮件仍由你单独发送。
      </p>
    </section>
  )
}
