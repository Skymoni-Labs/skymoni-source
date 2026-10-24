import { useQuery } from '@tanstack/react-query'
import {
  Download,
  FilePenLine,
  ImageIcon,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useState } from 'react'
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
  SKIVU_POSTER_FILENAME,
  SKIVU_POSTER_URL,
  skivuBetaTemplate,
} from '../lib/skivu-beta-template'

const APPROVED_PAGE_SIZE = 25

export function SkivuBetaTemplateDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUse: (values: MailFormValues) => void
  replaceExisting?: boolean
  disabled?: boolean
}) {
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
    enabled: props.open && expanded,
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
          new File([blob], SKIVU_POSTER_FILENAME, { type: 'image/jpeg' })
        )
        imageName = image.name
      }
      const template = skivuBetaTemplate(amount, imageName)
      props.onUse({
        ...template,
        format: 'html',
        audience: 'users',
        user_ids: [...selected],
        recipient_emails: '',
      })
      props.onOpenChange(false)
      toast.success('已载入编辑器，尚未保存或发送；未修改内测资格与额度')
    } catch (error) {
      handleServerError(error)
    } finally {
      setBusy(false)
    }
  }
  const requestApply = () => {
    if (props.replaceExisting) {
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
    <>
      <Dialog
        open={props.open}
        onOpenChange={(open) => {
          if (!busy) props.onOpenChange(open)
        }}
        title='复用 Skivu 内测通知模板'
        description='设置通知金额、海报和收件人，再载入原邮件编辑器。'
        contentClassName='sm:max-w-xl'
      >
        <div className='space-y-4'>
          <fieldset disabled={locked} className='space-y-4'>
            <div className='space-y-2'>
              <label
                htmlFor='skivu-beta-mail-amount'
                className='text-sm font-medium'
              >
                通知中的额度（USD）
              </label>
              <Input
                id='skivu-beta-mail-amount'
                inputMode='decimal'
                maxLength={9}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-invalid={!displayAmount}
              />
              {!displayAmount && (
                <p className='text-destructive text-sm' role='alert'>
                  请输入大于 0、最多两位小数的金额。
                </p>
              )}
            </div>
            <div className='flex items-center gap-4 rounded-lg border p-3'>
              <button
                type='button'
                onClick={() => setPosterOpen(true)}
                aria-label='预览 Skivu 宣传海报'
                className='shrink-0'
              >
                <img
                  src={SKIVU_POSTER_URL}
                  alt='Skivu 宣传海报'
                  className='h-24 w-20 rounded-md object-cover'
                />
              </button>
              <div className='min-w-0 space-y-3'>
                <label className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={withPoster}
                    onCheckedChange={(checked) =>
                      setWithPoster(checked === true)
                    }
                  />
                  附带 App 宣传海报
                </label>
                <a
                  className='text-muted-foreground inline-flex items-center gap-2 text-sm hover:underline'
                  href={SKIVU_POSTER_URL}
                  download={SKIVU_POSTER_FILENAME}
                >
                  <Download size={14} />
                  下载宣传海报
                </a>
              </div>
            </div>
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
          </fieldset>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            用于实际开通并发放额度后的通知。此处金额仅用于邮件文案，实际额度仍在用户管理中分配。
          </p>
          {expanded && (
            <div className='space-y-3 rounded-lg border p-3'>
              <div className='flex items-center justify-between gap-2'>
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
              <div className='max-h-56 space-y-2 overflow-y-auto'>
                {approved.map((account) => (
                  <label
                    key={account.user_id}
                    className='flex items-center gap-3 rounded-md border p-2 text-sm'
                  >
                    <Checkbox
                      disabled={locked}
                      checked={selected.includes(account.user_id)}
                      onCheckedChange={(checked) =>
                        toggle(account.user_id, checked === true)
                      }
                      aria-label={`选择内测用户 ${account.username || account.user_id}`}
                    />
                    <span className='min-w-0'>
                      <strong className='block break-words'>
                        {account.display_name ||
                          account.username ||
                          `用户 #${account.user_id}`}
                      </strong>
                      <small className='text-muted-foreground block'>
                        {account.username} · #{account.user_id}
                      </small>
                    </span>
                    <span className='text-muted-foreground ml-auto text-right text-xs'>
                      当前可用 {formatQuota(account.balance)}
                    </span>
                  </label>
                ))}
              </div>
              <div className='flex items-center justify-between gap-2 text-sm'>
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

          <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => props.onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type='button'
              disabled={locked || !displayAmount}
              onClick={requestApply}
            >
              <FilePenLine />
              {busy ? '正在载入海报…' : '载入内测通知模板'}
            </Button>
          </div>
        </div>
      </Dialog>
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
    </>
  )
}
