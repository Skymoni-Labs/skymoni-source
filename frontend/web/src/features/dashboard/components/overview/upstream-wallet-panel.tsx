import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownLeft,
  Coins,
  Plus,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useUpstreamCosts } from '@/features/models/upstream-cost-api'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  UpstreamWalletAlerts,
  useUpstreamWalletAlerts,
  walletMailThreshold,
} from './upstream-wallet-alerts'
import { UpstreamWalletCredential } from './upstream-wallet-credential'

interface UpstreamWallet {
  id: number
  name: string
  provider: string
  unit: string
  remaining: number
  conversion: number
  threshold: number
  calibrated_at: number
  revision: number
  pending: number
  note: string
}
interface WalletChannel {
  id: number
  name: string
  base_url: string
  models: string
  model_mapping: string
  wallet_id: number
}
interface WalletData {
  wallets: UpstreamWallet[]
  channels: WalletChannel[]
  usage_logging_enabled: boolean
  recovery_enabled: boolean
  suggested_conversions: Record<string, number>
}
interface WalletEvent {
  id: number
  created_at: number
  kind: string
  amount: number
  model: string
  channel_id: number
  note: string
}
const kinds: Record<string, string> = {
  priced: '模型消耗',
  pending: '待核对',
  calibrate: '余额核验',
  recharge: '充值补记',
  before_calibration: '已纳入核验余额',
}
const amount = (n: number) =>
  n.toLocaleString('zh-CN', { maximumFractionDigits: 6 })
const costValue = (n?: number | null) =>
  n === undefined || n === null ? '待核对' : amount(n)
const stamp = (n: number) => new Date(n * 1000).toLocaleString('zh-CN')

export function UpstreamWalletPanel() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['upstream-wallets'],
    queryFn: async () =>
      requireServerSuccess(
        (
          await api.get<{
            success: boolean
            message?: string
            data: WalletData
          }>('/api/upstream-wallet')
        ).data
      ).data,
    refetchInterval: 60_000,
  })
  const costs = useUpstreamCosts()
  const alerts = useUpstreamWalletAlerts()
  const [selected, setSelected] = useState<UpstreamWallet | null>(null)
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState('recharge')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('yylx')
  const [unit, setUnit] = useState('USD')
  const [conversion, setConversion] = useState('')
  const [threshold, setThreshold] = useState('1')
  const [channelFilter, setChannelFilter] = useState('')
  const [channelIDs, setChannelIDs] = useState<number[]>([])
  const formID = useId()
  const history = useQuery({
    queryKey: ['upstream-wallet-history', selected?.id],
    enabled: !!selected,
    queryFn: async () =>
      requireServerSuccess(
        (
          await api.get<{ success: boolean; data: WalletEvent[] }>(
            `/api/upstream-wallet/${selected?.id}/history`
          )
        ).data
      ).data,
  })
  const data = query.data
  const current = data?.wallets.find((w) => w.id === selected?.id) ?? selected
  const channels = useMemo(
    () => data?.channels.filter((ch) => ch.wallet_id === current?.id) ?? [],
    [data, current?.id]
  )
  const models = useMemo(
    () =>
      [
        ...new Set(
          channels.flatMap((ch) => ch.models.split(',').filter(Boolean))
        ),
      ].sort(),
    [channels]
  )
  const candidates =
    data?.channels.filter(
      (ch) =>
        !ch.wallet_id &&
        (!channelFilter ||
          `${ch.id} ${ch.name} ${ch.models}`
            .toLowerCase()
            .includes(channelFilter.toLowerCase()))
    ) ?? []
  const mutation = useMutation({
    mutationFn: async () => {
      const numeric = Number(value)
      if (!value.trim() || !Number.isFinite(numeric) || numeric < 0) {
        throw new Error('请输入有效的上游余额或充值金额')
      }
      if (creating) {
        if (
          !name.trim() ||
          !unit.trim() ||
          !conversion.trim() ||
          !(Number(conversion) > 0) ||
          !threshold.trim() ||
          !channelIDs.length
        ) {
          throw new Error('请填写账户信息、换算比例并选择渠道')
        }
        requireServerSuccess(
          (
            await api.post('/api/upstream-wallet', {
              name: name.trim(),
              provider,
              unit: unit.trim(),
              remaining: numeric,
              conversion: Number(conversion),
              threshold: Number(threshold),
              calibrated_at: Math.floor(Date.now() / 1000),
              channel_ids: channelIDs,
              note,
            })
          ).data
        )
      } else if (current) {
        requireServerSuccess(
          (
            await api.post(`/api/upstream-wallet/${current.id}/adjust`, {
              revision: current.revision,
              kind,
              amount: numeric,
              note,
            })
          ).data
        )
      }
    },
    onSuccess: async () => {
      toast.success(creating ? '上游账户已录入' : '余额记录已更新')
      setCreating(false)
      setValue('')
      setNote('')
      await client.invalidateQueries({ queryKey: ['upstream-wallets'] })
      await client.invalidateQueries({ queryKey: ['upstream-wallet-history'] })
    },
    onError: handleServerError,
  })
  const openCreate = () => {
    setName('')
    setValue('')
    setNote('')
    setChannelIDs([])
    setChannelFilter('')
    setProvider('yylx')
    setUnit('USD')
    setConversion(String(data?.suggested_conversions.yylx ?? ''))
    setThreshold('1')
    setCreating(true)
  }
  return (
    <section
      className='bg-card/70 space-y-4 rounded-2xl border p-4 shadow-sm backdrop-blur-xl sm:p-5'
      aria-label='上游余额估算'
    >
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <span className='bg-primary/10 text-primary rounded-xl p-2.5'>
            <Wallet className='size-5' />
          </span>
          <div>
            <h2 className='text-base font-semibold'>上游余额</h2>
            <p className='text-muted-foreground mt-1 text-xs'>
              按上游账户共用余额，依据实际模型成本在本地扣减。
            </p>
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <UpstreamWalletAlerts wallets={data?.wallets ?? []} />
          <Button
            size='sm'
            variant='outline'
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            aria-label='刷新本地余额'
          >
            <RefreshCw className='size-3.5' />
            刷新
          </Button>
          <Button size='sm' onClick={openCreate}>
            <Plus className='size-3.5' />
            录入账户
          </Button>
        </div>
      </div>
      {query.isError && (
        <p role='alert' className='text-destructive text-sm'>
          上游余额暂时无法读取，请刷新重试。
        </p>
      )}
      {query.isPending && (
        <p className='text-muted-foreground text-sm'>正在读取本地余额记录…</p>
      )}
      {data && !data.usage_logging_enabled && (
        <p role='alert' className='text-destructive text-sm'>
          使用日志未开启，自动成本扣减无法记录。请先开启使用日志。
        </p>
      )}
      {data && !data.recovery_enabled && (
        <p role='alert' className='text-sm text-amber-600'>
          日志使用独立数据库，自动补记不可用；遇到记录失败时请核验余额。
        </p>
      )}
      {data && !data.wallets.length && (
        <div className='text-muted-foreground rounded-xl border border-dashed p-5 text-sm'>
          录入一次上游余额并绑定对应渠道，后续消耗会自动扣减。充值后补记到账金额即可。
        </div>
      )}
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {data?.wallets.map((w) => {
          const bound = data.channels.filter((ch) => ch.wallet_id === w.id)
          const names = [
            ...new Set(
              bound.flatMap((ch) => ch.models.split(',').filter(Boolean))
            ),
          ]
          const low =
            w.calibrated_at > 0 &&
            w.remaining < walletMailThreshold(w, alerts.data?.settings)
          return (
            <button
              type='button'
              key={w.id}
              className='bg-background/60 hover:border-primary/40 rounded-xl border p-4 text-left transition-colors'
              onClick={() => {
                setSelected(w)
                setValue('')
                setNote('')
                setKind(w.calibrated_at ? 'recharge' : 'calibrate')
              }}
            >
              <div className='flex items-center justify-between gap-2'>
                <span className='truncate text-sm font-semibold'>{w.name}</span>
                {low ? (
                  <span className='flex shrink-0 items-center gap-1 text-xs text-amber-600'>
                    <AlertTriangle className='size-3' />
                    需充值
                  </span>
                ) : (
                  <span className='text-muted-foreground text-xs'>
                    {w.provider}
                  </span>
                )}
              </div>
              <p className='mt-4 text-2xl font-semibold tabular-nums'>
                {w.calibrated_at === 0 ? (
                  '待核验'
                ) : (
                  <>
                    ≈ {amount(w.remaining)}{' '}
                    <span className='text-muted-foreground text-xs font-normal'>
                      {w.unit}
                    </span>
                  </>
                )}
              </p>
              <p className='text-muted-foreground mt-1 text-xs'>
                {w.calibrated_at
                  ? `折合本站成本额度 ${amount(w.remaining * w.conversion)}`
                  : '余额尚未取得，自动扣减未启用'}
              </p>
              <p className='text-muted-foreground mt-3 line-clamp-1 text-xs'>
                {names.slice(0, 2).join(' · ') || '没有绑定模型'}
                {names.length > 2 && ` +${names.length - 2}`}
              </p>
              <div className='text-muted-foreground mt-2 flex justify-between gap-2 text-[11px]'>
                <span>
                  {bound.length} 个渠道 · {names.length} 个模型
                </span>
                {w.pending > 0 && (
                  <span className='text-amber-600'>{w.pending} 笔待核对</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <p className='text-muted-foreground flex items-start gap-1.5 text-xs leading-relaxed'>
        <Coins className='mt-0.5 size-3.5 shrink-0' />
        这里是充值成本的余额估算，不影响用户额度。上游站外使用、账户折扣或计价变化、赠送额度及未知扣款需要重新核验；刷新只读取本地账本。
      </p>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{current?.name} · 上游账户</DialogTitle>
            <DialogDescription>
              核验余额、充值补记与对应模型。
            </DialogDescription>
          </DialogHeader>
          {current && (
            <>
              <div className='bg-primary/5 rounded-xl p-4'>
                <p className='text-2xl font-semibold'>
                  {current.calibrated_at
                    ? `≈ ${amount(current.remaining)}`
                    : '待核验'}{' '}
                  <span className='text-muted-foreground text-sm'>
                    {current.unit}
                  </span>
                </p>
                <p className='text-muted-foreground mt-2 text-xs'>
                  {current.calibrated_at
                    ? `折合本站成本额度 ${amount(current.remaining * current.conversion)}`
                    : '尚未核验余额，自动扣减未启用'}{' '}
                  · 1 {current.unit} = {amount(current.conversion)} 额度
                </p>
                <p className='text-muted-foreground mt-1 text-xs'>
                  上次核验{' '}
                  {current.calibrated_at
                    ? stamp(current.calibrated_at)
                    : '尚未核验'}{' '}
                  · 低余额阈值 {amount(current.threshold)} {current.unit}
                </p>
                {current.note && (
                  <p className='text-muted-foreground mt-2 text-xs'>
                    {current.note}
                  </p>
                )}
                {current.pending > 0 && (
                  <p className='mt-2 text-xs text-amber-600'>
                    {current.pending} 笔成本待核对，当前余额可能偏高。
                  </p>
                )}
              </div>
              <UpstreamWalletCredential
                key={current.id}
                walletID={current.id}
              />
              <div className='space-y-2'>
                <Label htmlFor={`${formID}-kind`}>补记方式</Label>
                <NativeSelect
                  className='w-full'
                  id={`${formID}-kind`}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <NativeSelectOption value='recharge'>
                    充值补记（增加余额）
                  </NativeSelectOption>
                  <NativeSelectOption value='calibrate'>
                    核验余额（以实测余额为新起点）
                  </NativeSelectOption>
                </NativeSelect>
                <div className='flex gap-2'>
                  <Input
                    type='number'
                    aria-label={
                      kind === 'recharge' ? '充值到账金额' : '核验后的余额'
                    }
                    placeholder={`${kind === 'recharge' ? '充值到账金额' : '上游当前余额'} · ${current.unit}`}
                    min='0'
                    step='any'
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <Button
                    onClick={() => mutation.mutate(undefined)}
                    disabled={mutation.isPending}
                  >
                    <ArrowDownLeft className='size-4' />
                    保存
                  </Button>
                </div>
                <Input
                  aria-label='余额调整备注'
                  placeholder='备注（可选）'
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                {kind === 'calibrate' && (
                  <p className='text-muted-foreground text-xs'>
                    保存后从当前时点重新估算，清除此前待核对计数；历史明细保留。
                  </p>
                )}
              </div>
              <details className='rounded-xl border p-3'>
                <summary className='cursor-pointer text-sm font-medium'>
                  对应模型与上游成本 · {models.length} 个
                </summary>
                <div className='mt-3 max-h-64 space-y-3 overflow-y-auto'>
                  {models.map((m) => {
                    const quotes =
                      costs.data?.[m]?.filter(
                        (q) =>
                          q.provider.toLowerCase() ===
                          current.provider.toLowerCase()
                      ) ?? []
                    return (
                      <div
                        key={m}
                        className='border-b pb-2 text-xs last:border-0'
                      >
                        <p className='font-mono break-all'>{m}</p>
                        {quotes.length === 1 ? (
                          <p className='text-muted-foreground mt-1'>
                            {quotes[0].group} ·{' '}
                            {quotes[0].billing_type === 'request'
                              ? `每次 ${costValue(quotes[0].request_usd)}`
                              : `输入 ${costValue(quotes[0].input_usd_per_million)} / 输出 ${costValue(quotes[0].output_usd_per_million)} 每百万 Token`}{' '}
                            · 上游倍率 {quotes[0].group_ratio ?? 1}×
                          </p>
                        ) : (
                          <p className='mt-1 text-amber-600'>成本尚待核对</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </details>
              <details className='rounded-xl border p-3'>
                <summary className='cursor-pointer text-sm font-medium'>
                  最近成本明细
                </summary>
                {history.isError && (
                  <p className='text-destructive mt-2 text-xs'>
                    明细读取失败，请重新打开。
                  </p>
                )}
                <div className='mt-3 max-h-64 space-y-3 overflow-y-auto'>
                  {history.data?.map((event) => (
                    <div
                      key={event.id}
                      className='border-b pb-2 text-xs last:border-0'
                    >
                      <div className='flex justify-between gap-2'>
                        <span>
                          {kinds[event.kind] ?? event.kind} {event.model}
                        </span>
                        <span className='shrink-0 tabular-nums'>
                          {event.amount > 0 ? '+' : ''}
                          {amount(event.amount)} {current.unit}
                        </span>
                      </div>
                      <p className='text-muted-foreground mt-1'>
                        {stamp(event.created_at)}{' '}
                        {event.channel_id > 0 && `· 渠道 ${event.channel_id}`} ·{' '}
                        {event.note}
                      </p>
                    </div>
                  ))}
                  {history.data?.length === 0 && (
                    <p className='text-muted-foreground text-xs'>
                      尚无消耗或余额调整记录。
                    </p>
                  )}
                </div>
              </details>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className='sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>录入上游账户</DialogTitle>
            <DialogDescription>
              同一账户的多个 API 密钥和渠道共用一份余额。
            </DialogDescription>
          </DialogHeader>
          <div className='grid grid-cols-2 gap-3'>
            <div className='col-span-2 space-y-1.5'>
              <Label htmlFor={`${formID}-name`}>账户名称</Label>
              <Input
                id={`${formID}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='例如 yylx01'
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor={`${formID}-provider`}>成本来源</Label>
              <Input
                id={`${formID}-provider`}
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value)
                  const rate = data?.suggested_conversions[e.target.value]
                  if (rate) setConversion(String(rate))
                }}
                placeholder='yylx / 2000run'
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor={`${formID}-unit`}>上游余额单位</Label>
              <Input
                id={`${formID}-unit`}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor={`${formID}-balance`}>当前余额</Label>
              <Input
                id={`${formID}-balance`}
                type='number'
                min='0'
                step='any'
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor={`${formID}-threshold`}>低余额提醒阈值</Label>
              <Input
                id={`${formID}-threshold`}
                type='number'
                min='0'
                step='any'
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </div>
            <div className='col-span-2 space-y-1.5'>
              <Label htmlFor={`${formID}-conversion`}>
                1 上游单位折合多少本站成本额度
              </Label>
              <Input
                id={`${formID}-conversion`}
                type='number'
                min='0'
                step='any'
                value={conversion}
                onChange={(e) => setConversion(e.target.value)}
              />
              <p className='text-muted-foreground text-xs'>
                按实际充值成本换算，与网站模型售价倍率分别计算。
              </p>
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor={`${formID}-filter`}>
              绑定该账户的渠道 · 已选 {channelIDs.length}
            </Label>
            <Input
              id={`${formID}-filter`}
              placeholder='搜索账户名、渠道或模型'
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
            />
            <Button
              size='sm'
              variant='outline'
              onClick={() =>
                setChannelIDs([
                  ...new Set([...channelIDs, ...candidates.map((ch) => ch.id)]),
                ])
              }
            >
              选择筛选结果（{candidates.length}）
            </Button>
            <div className='max-h-44 space-y-2 overflow-y-auto rounded-lg border p-3'>
              {candidates.map((ch) => (
                <label
                  key={ch.id}
                  className='flex cursor-pointer items-start gap-2 text-xs'
                >
                  <input
                    type='checkbox'
                    checked={channelIDs.includes(ch.id)}
                    onChange={(e) =>
                      setChannelIDs(
                        e.target.checked
                          ? [...channelIDs, ch.id]
                          : channelIDs.filter((id) => id !== ch.id)
                      )
                    }
                  />
                  <span>
                    {ch.id} · {ch.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Input
            aria-label='账户备注'
            placeholder='核验来源、充值成本或其他备注'
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            onClick={() => mutation.mutate(undefined)}
            disabled={mutation.isPending || !channelIDs.length}
          >
            保存账户
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  )
}
