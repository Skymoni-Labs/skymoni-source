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
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { EvidenceDetails } from './evidence-details'
import { banIsActive, formatTime, isSafeBanIP, scopeLabels } from './policy'
import type {
  BanScope,
  CreateBan,
  ProtectionBan,
  ProtectionPage,
} from './types'

const selectClass =
  'bg-background h-10 w-full min-w-0 rounded-lg border px-3 text-sm'

export function BanPanel({
  userId,
  data,
  loading,
  pending,
  error,
  page,
  onPage,
  onCreate,
  onRevoke,
}: {
  userId: number
  data?: ProtectionPage<ProtectionBan>
  loading: boolean
  pending: boolean
  error: string | null
  page: number
  onPage: (page: number) => void
  onCreate: (ban: CreateBan) => Promise<boolean>
  onRevoke: (id: number, reason: string) => Promise<boolean>
}) {
  const [scope, setScope] = useState<BanScope>('checkin')
  const [target, setTarget] = useState('')
  const [duration, setDuration] = useState(3600)
  const [reason, setReason] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<CreateBan | null>(null)
  const [revoking, setRevoking] = useState<ProtectionBan | null>(null)
  const [revokeReason, setRevokeReason] = useState('')

  function prepare(event: FormEvent) {
    event.preventDefault()
    const value = target.trim()
    if (scope === 'ip' && !isSafeBanIP(value)) {
      setValidation(
        'IP 限制只接受单个公网 IPv4 或 IPv6 地址，不接受网段、私网或回环地址。'
      )
      return
    }
    if (
      scope !== 'ip' &&
      (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    ) {
      setValidation('请输入有效的用户 ID。')
      return
    }
    if (scope !== 'ip' && Number(value) === userId) {
      setValidation('不能限制当前管理员账号。')
      return
    }
    if (reason.trim().length < 4) {
      setValidation('请填写至少 4 个字的处置原因。')
      return
    }
    setValidation(null)
    setCandidate({
      subject_type: scope === 'ip' ? 'ip' : 'user',
      scope,
      ...(scope === 'ip' ? { ip: value } : { user_id: Number(value) }),
      duration_seconds: duration,
      reason: reason.trim(),
    })
  }

  return (
    <div className='min-w-0 space-y-5'>
      <div className='rounded-xl border p-4'>
        <h3 className='text-sm font-semibold'>添加临时限制</h3>
        <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
          只限制明确目标；共享 IP 不是同一现实身份的证明。管理员、当前访问 IP
          和白名单由服务器保护。人工限制不受自动防护开关影响。
        </p>
        <form
          onSubmit={prepare}
          aria-label='添加临时限制'
          className='mt-4 space-y-4'
        >
          <fieldset
            disabled={pending}
            className='grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3'
          >
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='ban-scope'>限制类型</Label>
              <select
                id='ban-scope'
                className={selectClass}
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as BanScope)
                  setTarget('')
                  setValidation(null)
                }}
              >
                <option value='checkin'>暂缓领奖（账号仍可正常使用）</option>
                <option value='account'>账号限制（拒绝该账号请求）</option>
                <option value='ip'>IP 限制（限制该来源请求）</option>
              </select>
            </div>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='ban-target'>
                {scope === 'ip' ? '精确公网 IP' : '目标用户 ID'}
              </Label>
              <Input
                id='ban-target'
                autoComplete='off'
                value={target}
                required
                maxLength={64}
                inputMode={scope === 'ip' ? 'text' : 'numeric'}
                placeholder={
                  scope === 'ip' ? '单个 IPv4 或 IPv6 地址' : '例如 123'
                }
                onChange={(event) => setTarget(event.target.value)}
              />
            </div>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='ban-duration'>自动解除时间</Label>
              <select
                id='ban-duration'
                className={selectClass}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              >
                <option value={900}>15 分钟后</option>
                <option value={3600}>1 小时后</option>
                <option value={86400}>24 小时后</option>
                <option value={604800}>7 天后</option>
              </select>
            </div>
            <div className='min-w-0 space-y-2 sm:col-span-2 xl:col-span-3'>
              <Label htmlFor='ban-reason'>处置原因</Label>
              <Textarea
                id='ban-reason'
                value={reason}
                required
                minLength={4}
                maxLength={200}
                rows={2}
                placeholder='简述已核实的行为和处置依据，不填写密钥或聊天正文'
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </fieldset>
          {validation && (
            <p role='alert' className='text-destructive text-sm'>
              {validation}
            </p>
          )}
          <Button type='submit' variant='destructive' disabled={pending}>
            检查并限制
          </Button>
        </form>
      </div>
      {error && (
        <p
          role='alert'
          className='text-destructive rounded-lg border p-3 text-sm'
        >
          {error}
        </p>
      )}
      <div aria-live='polite' className='text-muted-foreground text-xs'>
        {loading
          ? '正在读取限制记录…'
          : `共 ${data?.total ?? 0} 条记录（包括到期和撤销记录）`}
      </div>
      <ul aria-label='限制记录' className='grid min-w-0 gap-3 lg:grid-cols-2'>
        {data?.items.map((ban) => {
          const active = banIsActive(ban)
          let status = active ? '生效中' : '已到期'
          if (ban.revoked_at) status = '已撤销'
          return (
            <li
              key={ban.id}
              className='min-w-0 space-y-3 rounded-xl border p-4'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <span className='text-sm font-semibold'>
                  {scopeLabels[ban.scope]} · #{ban.id}
                </span>
                <span
                  className={
                    active
                      ? 'text-destructive text-xs'
                      : 'text-muted-foreground text-xs'
                  }
                >
                  {status}
                </span>
              </div>
              <p className='min-w-0 font-mono text-sm break-all'>
                {ban.subject_type === 'ip' ? ban.ip : `UID ${ban.user_id}`}
              </p>
              <p className='text-sm leading-relaxed [overflow-wrap:anywhere] break-words'>
                {ban.reason}
              </p>
              <dl className='text-muted-foreground grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
                <dt>来源</dt>
                <dd>{ban.source === 'automatic' ? '自动规则' : '管理员'}</dd>
                <dt>创建</dt>
                <dd>{formatTime(ban.created_at)}</dd>
                <dt>到期</dt>
                <dd>
                  {ban.expires_at
                    ? formatTime(ban.expires_at)
                    : '永久（既有记录）'}
                </dd>
                {ban.revoked_at > 0 && (
                  <>
                    <dt>撤销</dt>
                    <dd>{formatTime(ban.revoked_at)}</dd>
                  </>
                )}
              </dl>
              <EvidenceDetails
                request_id={ban.request_id}
                policy_revision={ban.policy_revision}
                evidence={ban.evidence}
                revoked_request_id={ban.revoked_request_id}
              />
              {active && (
                <Button
                  type='button'
                  variant='outline'
                  disabled={pending}
                  onClick={() => {
                    setRevoking(ban)
                    setRevokeReason('')
                  }}
                >
                  撤销限制 #{ban.id}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {!loading && data?.items.length === 0 && (
        <p className='text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm'>
          暂无限制记录
        </p>
      )}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-muted-foreground text-xs'>第 {page} 页</p>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            disabled={loading || page === 1}
            onClick={() => onPage(page - 1)}
            aria-label='限制记录上一页'
          >
            上一页
          </Button>
          <Button
            variant='outline'
            disabled={loading || !data || page * data.page_size >= data.total}
            onClick={() => onPage(page + 1)}
            aria-label='限制记录下一页'
          >
            下一页
          </Button>
        </div>
      </div>
      <Dialog
        open={!!candidate}
        onOpenChange={(open) => !open && !pending && setCandidate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认临时限制</DialogTitle>
            <DialogDescription>
              此人工操作立即生效，并按所选时间自动解除。
            </DialogDescription>
          </DialogHeader>
          {candidate && (
            <div className='space-y-2 text-sm [overflow-wrap:anywhere] break-words'>
              <p>
                {scopeLabels[candidate.scope]}：
                {candidate.ip || `UID ${candidate.user_id}`}
              </p>
              <p>时长：{candidate.duration_seconds / 60} 分钟</p>
              <p>原因：{candidate.reason}</p>
            </div>
          )}
          {error && (
            <p role='alert' className='text-destructive text-sm'>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              disabled={pending}
              onClick={() => setCandidate(null)}
            >
              取消
            </Button>
            <Button
              variant='destructive'
              disabled={pending}
              onClick={async () => {
                if (candidate && (await onCreate(candidate))) {
                  setCandidate(null)
                  setTarget('')
                  setReason('')
                }
              }}
            >
              {pending ? '正在提交…' : '确认限制'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!revoking}
        onOpenChange={(open) => !open && !pending && setRevoking(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>撤销限制 #{revoking?.id}</DialogTitle>
            <DialogDescription>
              只撤销这条防护限制。其他账号状态和既有网站封禁仍然有效。
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor='revoke-reason'>撤销原因</Label>
          <Textarea
            id='revoke-reason'
            value={revokeReason}
            minLength={4}
            maxLength={200}
            rows={3}
            onChange={(event) => setRevokeReason(event.target.value)}
          />
          {error && (
            <p role='alert' className='text-destructive text-sm'>
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant='outline'
              disabled={pending}
              onClick={() => setRevoking(null)}
            >
              取消
            </Button>
            <Button
              disabled={pending || revokeReason.trim().length < 4}
              onClick={async () => {
                if (
                  revoking &&
                  (await onRevoke(revoking.id, revokeReason.trim()))
                ) {
                  setRevoking(null)
                }
              }}
            >
              {pending ? '正在撤销…' : '确认撤销'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
