import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Mail, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

interface AlertSettings {
  enabled: boolean
  recipients: string[]
  shiba_threshold: number
  yylx_threshold: number
  oranexa_threshold: number
  revision: number
}
interface Delivery {
  wallet_id: number
  email: string
  active: boolean
  status: string
  result: string
  last_sent_at: number
  last_attempt_at: number
}
interface AlertData {
  settings: AlertSettings
  deliveries: Delivery[]
  smtp_ready: boolean
}
export function useUpstreamWalletAlerts() {
  return useQuery({
    queryKey: ['upstream-wallet-alerts'],
    queryFn: async () =>
      requireServerSuccess(
        (
          await api.get<{
            success: boolean
            message?: string
            data: AlertData
          }>('/api/upstream-wallet/alerts')
        ).data
      ).data,
    refetchInterval: 60_000,
  })
}
export function walletMailThreshold(
  w: { provider: string; name: string; threshold: number },
  settings?: AlertSettings
) {
  if (!settings) return w.threshold
  const provider = w.provider.trim().toLowerCase()
  if (provider === 'yylx') return settings.yylx_threshold
  if (provider === 'oranexa') return settings.oranexa_threshold
  if (
    ['2000run', 'shiba', '柴犬'].includes(provider) ||
    w.name.includes('柴犬')
  )
    return settings.shiba_threshold
  return w.threshold
}

const resultName = (d: Delivery) => {
  if (d.status === 'sent')
    return d.result === 'smtp_accepted_credentials_missing'
      ? '已发送；请补全账户凭据'
      : '已发送'
  if (d.status === 'failed') return '发送失败，将自动重试'
  if (d.status === 'uncertain' || d.status === 'sending')
    return '投递待确认，避免重复发送'
  if (d.status === 'recovered') return '余额已恢复'
  return '已跳过'
}

export function UpstreamWalletAlerts({
  wallets,
}: {
  wallets: { id: number; name: string }[]
}) {
  const query = useUpstreamWalletAlerts()
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<AlertSettings | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [dirty, setDirty] = useState(false)
  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('请先读取配置')
      if (!draft.recipients.length) throw new Error('请至少添加一个收件邮箱')
      return requireServerSuccess(
        (
          await api.put<{
            success: boolean
            message?: string
            data: AlertSettings
          }>('/api/upstream-wallet/alerts', draft)
        ).data
      ).data
    },
    onSuccess: async (settings) => {
      setDraft(settings)
      setDirty(false)
      toast.success('上游余额预警已保存')
      await client.invalidateQueries({ queryKey: ['upstream-wallet-alerts'] })
    },
    onError: handleServerError,
  })
  const test = useMutation({
    mutationFn: async () =>
      requireServerSuccess(
        (await api.post('/api/upstream-wallet/alerts/test', {})).data
      ),
    onSuccess: () => toast.success('测试邮件已被邮件服务器接收，请查看收件箱'),
    onError: handleServerError,
  })
  const update = (patch: Partial<AlertSettings>) => {
    setDraft((prior) => prior && { ...prior, ...patch })
    setDirty(true)
  }
  const add = () => {
    const email = newEmail.trim().toLowerCase()
    if (!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(email)) {
      toast.error('请输入有效邮箱')
      return
    }
    if (draft?.recipients.includes(email)) {
      toast.error('此邮箱已添加')
      return
    }
    if ((draft?.recipients.length ?? 0) >= 20) {
      toast.error('最多添加 20 个邮箱')
      return
    }
    update({ recipients: [...(draft?.recipients ?? []), email] })
    setNewEmail('')
  }
  return (
    <>
      <Button
        size='sm'
        variant='outline'
        disabled={!query.data}
        onClick={() => {
          setDraft({
            ...query.data!.settings,
            recipients: [...query.data!.settings.recipients],
          })
          setDirty(false)
          setNewEmail('')
          setOpen(true)
        }}
      >
        <BellRing className='size-3.5' /> 邮件预警
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>上游余额邮件预警</DialogTitle>
            <DialogDescription>
              按上游原始额度提醒，邮件附上对应账户的登录网址、账号和密码。
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className='space-y-5'>
              <div className='bg-primary/5 flex items-center justify-between rounded-xl border p-4'>
                <div>
                  <Label htmlFor='wallet-alert-enabled'>自动邮件预警</Label>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    每分钟检查；持续低余额每 24 小时最多提醒一次。
                  </p>
                </div>
                <Switch
                  id='wallet-alert-enabled'
                  checked={draft.enabled}
                  onCheckedChange={(enabled) => update({ enabled })}
                />
              </div>
              <div className='space-y-3'>
                <h3 className='text-sm font-semibold'>收件邮箱</h3>
                {draft.recipients.map((email) => (
                  <div
                    key={email}
                    className='flex items-center gap-2 rounded-xl border px-3 py-2'
                  >
                    <Mail className='text-muted-foreground size-4' />
                    <span className='min-w-0 flex-1 text-sm break-all'>
                      {email}
                    </span>
                    <Button
                      size='icon'
                      variant='ghost'
                      aria-label={`移除 ${email}`}
                      onClick={() =>
                        update({
                          recipients: draft.recipients.filter(
                            (e) => e !== email
                          ),
                        })
                      }
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  </div>
                ))}
                <div className='flex gap-2'>
                  <Input
                    type='email'
                    aria-label='新增收件邮箱'
                    placeholder='输入收件邮箱'
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        add()
                      }
                    }}
                  />
                  <Button variant='outline' onClick={add}>
                    <Plus className='size-4' />
                    添加
                  </Button>
                </div>
              </div>
              <div className='grid gap-3 sm:grid-cols-3'>
                {(
                  [
                    ['shiba_threshold', '柴犬'],
                    ['yylx_threshold', 'YYLX'],
                    ['oranexa_threshold', 'Oranexa'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className='space-y-2'>
                    <Label htmlFor={key}>{label} 低于</Label>
                    <Input
                      id={key}
                      type='number'
                      min='0.000001'
                      step='any'
                      value={draft[key]}
                      onChange={(e) =>
                        update({ [key]: Number(e.target.value) })
                      }
                    />
                    <p className='text-muted-foreground text-xs'>
                      上游自身额度
                    </p>
                  </div>
                ))}
              </div>
              <p className='text-muted-foreground rounded-xl border p-3 text-xs leading-relaxed'>
                只检查已核验的账户，充值后补记到账额度即可重置提醒。未录入密码的账户仍会收到余额提醒，并提示补全登录凭据。请只添加可以接收账户密码的邮箱。
              </p>
              {!query.data?.smtp_ready && (
                <p role='alert' className='text-destructive text-sm'>
                  站点邮件服务尚未配置，自动预警暂时无法发送。
                </p>
              )}
              {(query.data?.deliveries.filter((d) => d.last_attempt_at > 0)
                .length ?? 0) > 0 && (
                <div className='space-y-2'>
                  <h3 className='text-sm font-semibold'>最近提醒</h3>
                  {query.data?.deliveries
                    .filter((d) => d.last_attempt_at > 0)
                    .slice(-20)
                    .map((d) => (
                      <div
                        key={`${d.wallet_id}-${d.email}`}
                        className='rounded-xl border p-3 text-xs'
                      >
                        <p className='font-medium'>
                          {wallets.find((w) => w.id === d.wallet_id)?.name ??
                            `账户 ${d.wallet_id}`}{' '}
                          · {resultName(d)}
                        </p>
                        <p className='text-muted-foreground mt-1'>
                          {d.email} ·{' '}
                          {new Date(
                            (d.last_sent_at || d.last_attempt_at) * 1000
                          ).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    ))}
                </div>
              )}
              <div className='flex flex-wrap justify-end gap-2'>
                <Button
                  variant='outline'
                  disabled={dirty || test.isPending || !query.data?.smtp_ready}
                  onClick={() => test.mutate(undefined)}
                >
                  {test.isPending ? '正在发送…' : '发送测试邮件'}
                </Button>
                <Button
                  disabled={save.isPending || !dirty}
                  onClick={() => save.mutate(undefined)}
                >
                  {save.isPending ? '保存中…' : '保存预警设置'}
                </Button>
              </div>
              {dirty && (
                <p className='text-muted-foreground text-right text-xs'>
                  保存后，测试邮件将发往新的收件邮箱。
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
