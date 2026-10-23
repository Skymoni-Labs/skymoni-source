import { useQuery } from '@tanstack/react-query'
import {
  Download,
  FilePenLine,
  Gift,
  ImageIcon,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { betaList } from '@/features/community/app-beta-api'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { uploadMailImage } from '../api'
import type { MailFormValues } from '../lib/schema'
import {
  betaMailAmount,
  SKIVU_POSTER_URL,
  skivuBetaTemplate,
} from '../lib/skivu-beta-template'

import './skivu-beta-panel.css'

const APPROVED_PAGE_SIZE = 25

export function SkivuBetaMailPanel(props: {
  disabled?: boolean
  onEdit: () => void
  onBusyChange?: (busy: boolean) => void
}) {
  const form = useFormContext<MailFormValues>()
  const [amount, setAmount] = useState('15')
  const [withPoster, setWithPoster] = useState(true)
  const [posterOpen, setPosterOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const displayAmount = betaMailAmount(amount)
  const locked = busy || props.disabled
  const accounts = useQuery({
    queryKey: ['skivu-beta-mail-approved', page],
    queryFn: ({ signal }) => betaList('approved', page, signal),
    enabled: expanded,
    staleTime: 15000,
    retry: false,
  })
  const approved = (accounts.data?.items ?? []).filter(
    (a) => a.status === 'approved'
  )

  const apply = async () => {
    if (!displayAmount || locked) return
    setConfirmOpen(false)
    setBusy(true)
    props.onBusyChange?.(true)
    try {
      let imageName: string | undefined
      if (withPoster) {
        const response = await fetch(SKIVU_POSTER_URL)
        if (!response.ok) throw new Error('海报读取失败，可取消附带海报后重试')
        const blob = await response.blob()
        if (!blob.size || blob.size > 5 * 1024 * 1024) {
          throw new Error('海报文件大小不符合邮件要求')
        }
        const image = await uploadMailImage(
          new File([blob], 'Skivu-promo-20261023.jpg', { type: 'image/jpeg' })
        )
        imageName = image.name
      }
      const template = skivuBetaTemplate(amount, imageName)
      form.reset(
        {
          ...template,
          format: 'html',
          audience: 'users',
          user_ids: [...selected],
          recipient_emails: '',
        },
        { keepDefaultValues: true }
      )
      props.onEdit()
      toast.success('已载入编辑器，尚未保存或发送；未修改内测资格与额度')
    } catch (error) {
      handleServerError(error)
    } finally {
      setBusy(false)
      props.onBusyChange?.(false)
    }
  }
  const requestApply = () => {
    const values = form.getValues()
    if (
      values.subject.trim() ||
      values.content.trim() ||
      values.user_ids.length ||
      values.recipient_emails.trim() ||
      values.audience === 'all_users'
    ) {
      setConfirmOpen(true)
    } else void apply()
  }
  const toggle = (id: number, checked: boolean) =>
    setSelected((previous) =>
      checked
        ? [...new Set([...previous, id])]
        : previous.filter((value) => value !== id)
    )

  return (
    <section
      className='skivu-beta-mail-panel'
      aria-label='Skivu 内测开通邮件面板'
    >
      <div className='sbm-main'>
        <div className='sbm-copy'>
          <span className='sbm-kicker'>
            <Gift size={15} /> SKIVU · EARLY ACCESS <i>通知模板</i>
          </span>
          <h2>你的 Skivu 内测，已开通。</h2>
          <p className='sbm-description'>
            为已开通账号准备通知，送上一份属于他们的 AI 空间。
          </p>
          <div className='sbm-allowance'>
            <strong>
              <small>$</small>
              {displayAmount ?? '—'}
            </strong>
            <span>
              App 专属内测额度<small>邮件通知金额 · 不计入中转余额</small>
            </span>
          </div>
          <fieldset disabled={locked} className='sbm-controls'>
            <label htmlFor='skivu-beta-mail-amount'>通知中的额度（USD）</label>
            <Input
              id='skivu-beta-mail-amount'
              inputMode='decimal'
              maxLength={9}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={!displayAmount}
            />
            <label className='sbm-poster-toggle'>
              <Checkbox
                checked={withPoster}
                onCheckedChange={(checked) => setWithPoster(checked === true)}
              />
              附带 App 宣传海报
            </label>
          </fieldset>
          {!displayAmount && (
            <p className='sbm-error' role='alert'>
              请输入大于 0、最多两位小数的金额。
            </p>
          )}
          <div className='sbm-actions'>
            <Button
              type='button'
              disabled={locked || !displayAmount}
              onClick={requestApply}
            >
              <FilePenLine />
              {busy ? '正在载入海报…' : '载入内测通知模板'}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={locked}
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              <Users />
              已开通用户{selected.length > 0 ? ` · ${selected.length}` : ''}
            </Button>
          </div>
          <p className='sbm-note'>
            用于实际开通并发放额度后的通知。载入仅填充编辑器；附图会上传为邮件配图，不会开通账号、发放额度或发送邮件。
          </p>
          <a className='sbm-manage' href='/users'>
            前往用户管理分配内测额度 ↗
          </a>
        </div>
        <div className='sbm-poster'>
          <button
            type='button'
            onClick={() => setPosterOpen(true)}
            aria-label='预览 Skivu 宣传海报'
          >
            <img
              src={SKIVU_POSTER_URL}
              alt='Skivu 银河宣传海报，云朵小人与 App 云标识'
            />
          </button>
          <a href={SKIVU_POSTER_URL} download='Skivu-promo-20261023.jpg'>
            <Download size={13} />
            下载宣传海报
          </a>
        </div>
      </div>

      {expanded && (
        <div className='sbm-recipients'>
          <div className='sbm-recipient-heading'>
            <h3>选择已开通内测的用户</h3>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={accounts.isFetching || locked}
              onClick={() => void accounts.refetch()}
            >
              <RefreshCw />
              刷新
            </Button>
          </div>
          <p>
            已选择 {selected.length}{' '}
            位。仅用于载入通知收件人，发送前请核对实际资格和额度；无有效绑定邮箱的账号由现有邮件流程跳过。
          </p>
          {accounts.isPending && <p role='status'>正在读取已开通用户…</p>}
          {accounts.isError && (
            <p role='alert'>
              读取失败，请刷新重试。也可载入模板后手动选择收件人。
            </p>
          )}
          {accounts.data && !approved.length && (
            <p>当前没有可显示的已开通用户。</p>
          )}
          <div className='sbm-user-list'>
            {approved.map((account) => (
              <label key={account.user_id}>
                <Checkbox
                  disabled={locked}
                  checked={selected.includes(account.user_id)}
                  onCheckedChange={(checked) =>
                    toggle(account.user_id, checked === true)
                  }
                  aria-label={`选择内测用户 ${account.username || account.user_id}`}
                />
                <span>
                  <strong>
                    {account.display_name ||
                      account.username ||
                      `用户 #${account.user_id}`}
                  </strong>
                  <small>
                    {account.username} · #{account.user_id}
                  </small>
                </span>
                <span className='sbm-user-balance'>
                  当前可用 {formatQuota(account.balance)}
                </span>
              </label>
            ))}
          </div>
          <div className='sbm-pagination'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={page <= 1 || accounts.isFetching || locked}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            <span>第 {page} 页</span>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={
                page * APPROVED_PAGE_SIZE >= (accounts.data?.total ?? 0) ||
                accounts.isFetching ||
                locked
              }
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title='替换当前邮件编辑内容？'
        desc='将替换主题、正文和收件人范围；已选内测用户会载入，没有选择时保持收件人为空。此操作不会保存或发送邮件，也不会修改额度。'
        confirmText='替换并载入模板'
        handleConfirm={() => void apply()}
      />
      <Dialog
        open={posterOpen}
        onOpenChange={setPosterOpen}
        title='Skivu 宣传海报'
        description='云朵小人与 App 云标识 · 银河主题'
        contentClassName='sm:max-w-xl'
      >
        <img
          className='max-h-[72dvh] w-full object-contain'
          src={SKIVU_POSTER_URL}
          alt='Skivu 宣传海报'
        />
        <Button
          type='button'
          variant='outline'
          onClick={() => setPosterOpen(false)}
        >
          <ImageIcon />
          返回编辑器
        </Button>
      </Dialog>
    </section>
  )
}
