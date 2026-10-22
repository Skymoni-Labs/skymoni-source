import { useMutation, useQuery } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  betaDetail,
  betaList,
  betaReview,
  betaStatusText,
  type BetaAction,
} from '@/features/community/app-beta-api'
import { getCurrencyLabel } from '@/lib/currency'
import { formatQuota, parseQuotaFromDollars } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

export function AppBetaManager(props: {
  userId?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const actor = useAuthStore((state) => state.auth.user?.id)
  const sid = useAuthStore((state) => state.auth.session?.sid)
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number | undefined>()
  const [action, setAction] = useState<BetaAction>('approve')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const command = useRef({ payload: '', id: '' })
  const userId = props.userId ?? selected
  const list = useQuery({
    queryKey: ['admin-app-beta', actor, sid, status, page],
    queryFn: ({ signal }) => betaList(status, page, signal),
    enabled: props.open && !userId,
    retry: false,
  })
  const detail = useQuery({
    queryKey: ['admin-app-beta-detail', actor, sid, userId],
    queryFn: ({ signal }) => betaDetail(userId ?? 0, signal),
    enabled: props.open && !!userId,
    retry: false,
  })
  const account = detail.data?.account
  const quota =
    action === 'approve' || action === 'adjust'
      ? parseQuotaFromDollars(Number(amount))
      : 0
  const validAmount =
    Number.isFinite(Number(amount)) &&
    Number.isSafeInteger(quota) &&
    Math.abs(quota) <= Number.MAX_SAFE_INTEGER &&
    (action === 'approve'
      ? amount.trim() !== '' && quota >= 0
      : action !== 'adjust' || (amount.trim() !== '' && quota !== 0))
  const review = useMutation({
    mutationFn: async () => {
      if (!userId || !account || !validAmount) {
        throw new Error(t('Enter a valid allowance'))
      }
      const payload = { action, amount: quota, version: account.version, note }
      const fingerprint = JSON.stringify([userId, payload])
      if (command.current.payload !== fingerprint) {
        command.current = { payload: fingerprint, id: crypto.randomUUID() }
      }
      await betaReview(userId, { ...payload, operation_id: command.current.id })
    },
    onSuccess: () => {
      setConfirm(false)
      setAmount('')
      setNote('')
      command.current = { payload: '', id: '' }
      toast.success(t('Saved successfully'))
      void detail.refetch()
      void list.refetch()
    },
    onError: (error) => {
      handleServerError(error)
      setConfirm(false)
      void detail.refetch()
    },
  })
  const openAccount = (id: number) => {
    setSelected(id)
    setAmount('')
    setNote('')
    setAction(status === 'approved' ? 'adjust' : 'approve')
  }
  const actions: BetaAction[] = []
  if (account?.status === 'pending') actions.push('approve', 'reject')
  if (account?.status === 'approved') actions.push('adjust', 'suspend')
  if (account?.status === 'suspended') actions.push('approve')
  const activeAction = actions.includes(action) ? action : actions[0]
  const actionText = {
    approve: 'Approve and assign allowance',
    reject: 'Decline application',
    suspend: 'Suspend beta access',
    adjust: 'Adjust beta allowance',
  } as const
  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('App beta management')}
        description={t(
          'Beta allowance and records are independent of relay wallet balances and subscriptions.'
        )}
        contentClassName='sm:max-w-4xl'
      >
        <div className='space-y-4'>
          {!userId && (
            <>
              <div className='flex flex-wrap items-center gap-2'>
                <Label htmlFor='beta-filter'>{t('Status')}</Label>
                <NativeSelect
                  id='beta-filter'
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value=''>{t('All')}</option>
                  {(
                    ['pending', 'approved', 'rejected', 'suspended'] as const
                  ).map((item) => (
                    <option key={item} value={item}>
                      {t(betaStatusText[item])}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => void list.refetch()}
                  disabled={list.isFetching}
                >
                  {t('Refresh')}
                </Button>
              </div>
              {list.isPending && <p role='status'>{t('Loading...')}</p>}
              {list.isError && (
                <p role='alert'>{t('Unable to load beta applications')}</p>
              )}
              {list.data && (
                <>
                  {!list.data.app_available && (
                    <p className='text-muted-foreground text-sm'>
                      {t(
                        'App connection is not open yet. Your approved allowance is reserved for the App.'
                      )}
                    </p>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('User')}</TableHead>
                        <TableHead>{t('Status')}</TableHead>
                        <TableHead>{t('Beta balance')}</TableHead>
                        <TableHead>{t('Beta used')}</TableHead>
                        <TableHead>{t('Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.data.items?.map((item) => (
                        <TableRow key={item.user_id}>
                          <TableCell>
                            <strong>
                              {item.display_name || item.username}
                            </strong>
                            <div className='text-muted-foreground text-xs'>
                              #{item.user_id} · {item.username}
                            </div>
                          </TableCell>
                          <TableCell>
                            {t(betaStatusText[item.status])}
                          </TableCell>
                          <TableCell>{formatQuota(item.balance)}</TableCell>
                          <TableCell>{formatQuota(item.used)}</TableCell>
                          <TableCell>
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => openAccount(item.user_id)}
                            >
                              {t('Review / manage')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!list.data.items?.length && (
                        <TableRow>
                          <TableCell colSpan={5}>
                            {t('No beta applications')}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <div className='flex items-center justify-end gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      {t('Previous')}
                    </Button>
                    <span>
                      {page} / {Math.max(1, Math.ceil(list.data.total / 25))}
                    </span>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={page * 25 >= list.data.total}
                      onClick={() => setPage(page + 1)}
                    >
                      {t('Next')}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
          {userId && (
            <>
              {!props.userId && (
                <Button variant='ghost' onClick={() => setSelected(undefined)}>
                  {t('Back to applications')}
                </Button>
              )}
              {detail.isPending && <p role='status'>{t('Loading...')}</p>}
              {detail.isError && (
                <div role='alert'>
                  {t('Unable to load beta status')}
                  <Button
                    variant='outline'
                    onClick={() => void detail.refetch()}
                  >
                    {t('Retry')}
                  </Button>
                </div>
              )}
              {account && (
                <>
                  <div className='flex flex-wrap gap-4 text-sm'>
                    <strong>
                      #{account.user_id} · {t(betaStatusText[account.status])}
                    </strong>
                    <span>
                      {t('Beta balance')}: {formatQuota(account.balance)}
                    </span>
                    <span>
                      {t('Reserved')}: {formatQuota(account.reserved)}
                    </span>
                    <span>
                      {t('Beta used')}: {formatQuota(account.used)}
                    </span>
                  </div>
                  <p className='text-sm whitespace-pre-wrap'>
                    {t('Application note')}: {account.application || '—'}
                  </p>
                  {account.review_note && (
                    <p className='text-sm'>
                      {t('Review note')}: {account.review_note}
                    </p>
                  )}
                  {activeAction && (
                    <form
                      className='space-y-3 rounded-lg border p-4'
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (action !== activeAction) {
                          setAction(activeAction)
                          return
                        }
                        setConfirm(true)
                      }}
                    >
                      <Label htmlFor='beta-action'>{t('Action')}</Label>
                      <NativeSelect
                        id='beta-action'
                        value={activeAction}
                        onChange={(event) => {
                          setAction(event.target.value as BetaAction)
                          setAmount('')
                        }}
                      >
                        {actions.map((item) => (
                          <option key={item} value={item}>
                            {t(actionText[item])}
                          </option>
                        ))}
                      </NativeSelect>
                      {(activeAction === 'approve' ||
                        activeAction === 'adjust') && (
                        <div className='space-y-1'>
                          <Label htmlFor='beta-amount'>
                            {t('Allowance')} ({getCurrencyLabel()})
                          </Label>
                          <Input
                            id='beta-amount'
                            value={amount}
                            inputMode='decimal'
                            onChange={(event) => {
                              setAction(activeAction)
                              setAmount(event.target.value)
                            }}
                            required
                          />
                          <p className='text-muted-foreground text-xs'>
                            {t(
                              'Approval adds the amount entered. Adjustments accept a positive or negative amount; relay credit is never changed.'
                            )}
                          </p>
                        </div>
                      )}
                      <Label htmlFor='beta-review-note'>
                        {t('Review note')}
                      </Label>
                      <Textarea
                        id='beta-review-note'
                        maxLength={500}
                        value={note}
                        onChange={(event) => {
                          setAction(activeAction)
                          setNote(event.target.value)
                        }}
                      />
                      <Button
                        disabled={
                          review.isPending || detail.isFetching || !validAmount
                        }
                        type='submit'
                      >
                        {t(actionText[activeAction])}
                      </Button>
                    </form>
                  )}
                  <h3 className='font-medium'>
                    {t('Beta ledger (latest 50 entries)')}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Action')}</TableHead>
                        <TableHead>{t('Change')}</TableHead>
                        <TableHead>{t('Beta balance')}</TableHead>
                        <TableHead>{t('Note')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.data?.ledger?.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            {t(`Beta ledger ${entry.kind}`)}
                            <div className='text-muted-foreground text-xs'>
                              #{entry.id} · {t('Operator')}{' '}
                              {entry.actor_id || t('System')}
                            </div>
                          </TableCell>
                          <TableCell>{formatQuota(entry.delta)}</TableCell>
                          <TableCell>{formatQuota(entry.balance)}</TableCell>
                          <TableCell>{entry.note || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t(actionText[action])}
        desc={`${t('Only the beta allowance will change.')}${action === 'approve' || action === 'adjust' ? ` ${formatQuota(quota)}` : ''}`}
        destructive={action === 'suspend' || action === 'reject'}
        isLoading={review.isPending}
        handleConfirm={() => review.mutate()}
      />
    </>
  )
}

export function AppBetaManagerButton() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size='sm' variant='outline' onClick={() => setOpen(true)}>
        <FlaskConical size={16} />
        {t('App beta management')}
      </Button>
      <AppBetaManager open={open} onOpenChange={setOpen} />
    </>
  )
}
