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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { changeMailState, getMail, mailRecipients, scheduleMail } from '../api'
import { mailResultLabel, mailStatusLabel } from '../lib/labels'
import type { MailRecipient } from '../types'
import { MailPreview } from './mail-preview'

export function MailDetailDialog(props: {
  id: number
  smtpReady: boolean
  onClose: () => void
  onReuseTemplate?: (id: number) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<'send' | 'schedule' | 'cancel' | null>(
    null
  )
  const [sendAt, setSendAt] = useState('')
  const detail = useQuery({
    queryKey: ['admin-mail', 'detail', props.id],
    queryFn: () => getMail(props.id),
    refetchInterval: (query) =>
      query.state.data?.status === 'queued' ||
      query.state.data?.status === 'scheduled'
        ? 5000
        : false,
  })
  const recipients = useQuery({
    queryKey: ['admin-mail', 'recipients', props.id, page],
    queryFn: () => mailRecipients(props.id, page),
    refetchInterval: detail.data?.status === 'queued' ? 5000 : false,
  })
  const operation = useMutation({
    mutationFn: (kind: 'send' | 'schedule' | 'cancel') =>
      kind === 'schedule'
        ? scheduleMail(
            props.id,
            Math.floor(new Date(sendAt + ':00+08:00').getTime() / 1000)
          )
        : changeMailState(props.id, kind),
    onSuccess: (_, kind) => {
      void client.invalidateQueries({ queryKey: ['admin-mail'] })
      setAction(null)
      toast.success(
        kind === 'schedule'
          ? t('邮件已保存定时发送')
          : kind === 'send'
            ? t('Email queued')
            : t('Mail cancelled')
      )
    },
    onError: (error) => handleServerError(error),
  })
  const campaign = detail.data
  const columns: StaticDataTableColumn<MailRecipient>[] = [
    {
      id: 'recipient',
      header: t('Recipient'),
      cell: (recipient) => (
        <div>
          <p>
            {recipient.user_id > 0
              ? `${recipient.username} (#${recipient.user_id})`
              : t('Direct email recipient')}
          </p>
          <p className='text-muted-foreground text-xs break-all'>
            {recipient.email}
          </p>
        </div>
      ),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (recipient) => (
        <Badge variant='outline'>{mailStatusLabel(recipient.status, t)}</Badge>
      ),
    },
    {
      id: 'result',
      header: t('Result'),
      cell: (recipient) => (
        <span className='text-xs'>{mailResultLabel(recipient.result, t)}</span>
      ),
    },
  ]
  return (
    <>
      <Dialog
        open
        title={t('Email details')}
        onOpenChange={(open) => {
          if (!open && !operation.isPending) props.onClose()
        }}
        contentClassName='sm:max-w-4xl'
        footer={
          <>
            {campaign && props.onReuseTemplate && (
              <Button
                variant='outline'
                disabled={operation.isPending}
                onClick={() => props.onReuseTemplate?.(props.id)}
              >
                {t('Reuse template')}
              </Button>
            )}
            {campaign?.status === 'draft' && (
              <Button
                disabled={
                  !props.smtpReady ||
                  operation.isPending ||
                  !sendAt ||
                  !Number.isFinite(new Date(sendAt + ':00+08:00').getTime()) ||
                  new Date(sendAt + ':00+08:00').getTime() < Date.now() + 60_000
                }
                onClick={() => setAction('schedule')}
              >
                {t('定时发送')}
              </Button>
            )}
            {campaign?.status === 'draft' && (
              <Button
                disabled={!props.smtpReady || operation.isPending}
                onClick={() => setAction('send')}
              >
                {t('Send email')}
              </Button>
            )}
            {(campaign?.status === 'draft' ||
              campaign?.status === 'queued' ||
              campaign?.status === 'scheduled' ||
              campaign?.status === 'schedule_failed') && (
              <Button
                variant='outline'
                disabled={operation.isPending}
                onClick={() => setAction('cancel')}
              >
                {t('Cancel mailing')}
              </Button>
            )}
            <Button
              variant='outline'
              onClick={props.onClose}
              disabled={operation.isPending}
            >
              {t('Close')}
            </Button>
          </>
        }
      >
        {detail.isLoading && <LoadingState />}
        {detail.isError && (
          <ErrorState
            onRetry={() => {
              void detail.refetch()
            }}
          />
        )}
        {campaign && (
          <div className='space-y-4'>
            <div>
              <h3 className='font-semibold break-words'>{campaign.subject}</h3>
              <p className='text-muted-foreground text-sm'>
                {mailStatusLabel(campaign.status, t)} ·{' '}
                {t('{{count}} recipients, {{skipped}} skipped', {
                  count: formatNumber(campaign.recipient_count, locale),
                  skipped: formatNumber(campaign.skipped_count, locale),
                })}
              </p>
            </div>
            {campaign.status === 'draft' && (
              <div className='space-y-2 rounded-xl border p-3'>
                <label htmlFor='mail-send-at' className='text-sm font-medium'>
                  {t('定时发送 · 北京时间')}
                </label>
                <Input
                  id='mail-send-at'
                  type='datetime-local'
                  value={sendAt}
                  onChange={(event) => setSendAt(event.target.value)}
                />
                <p className='text-muted-foreground text-xs'>
                  {t(
                    '由服务器按时执行；降价邮件会先核验成本与实际优惠价格。未生效则拦截发送。'
                  )}
                </p>
              </div>
            )}
            {campaign.send_at > 0 && (
              <div className='rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-sm'>
                {t('定时发送：')}
                {new Date(campaign.send_at * 1000).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                  hour12: false,
                })}{' '}
                {t('（北京时间）')}
                <p className='text-muted-foreground mt-1 text-xs'>
                  {t(
                    '服务器保存的任务，关闭本机也会执行。发送前再次检查优惠与成本，活动未生效则不发送。'
                  )}
                </p>
              </div>
            )}
            {campaign.schedule_error && (
              <p className='border-destructive/30 text-destructive rounded-lg border p-3 text-sm'>
                {campaign.schedule_error}
              </p>
            )}
            <MailPreview html={campaign.html} />
            <Separator />
            <h3 className='font-semibold'>{t('Recipient delivery records')}</h3>
            {recipients.isLoading && <LoadingState />}
            {recipients.isError && (
              <ErrorState
                onRetry={() => {
                  void recipients.refetch()
                }}
              />
            )}
            {recipients.data && (
              <StaticDataTable
                data={recipients.data}
                columns={columns}
                getRowKey={(recipient) => recipient.id}
              />
            )}
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {t('Previous')}
              </Button>
              <Button
                variant='outline'
                disabled={page * 50 >= campaign.recipient_count}
                onClick={() => setPage(page + 1)}
              >
                {t('Next')}
              </Button>
            </div>
            <p className='text-muted-foreground text-xs'>
              {t(
                'SMTP acceptance does not guarantee inbox placement. Unconfirmed deliveries are not retried automatically.'
              )}
            </p>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !operation.isPending) setAction(null)
        }}
        title={
          action === 'schedule'
            ? t('确认定时发送这封邮件？')
            : action === 'send'
              ? t('Send this email?')
              : t('Cancel this mailing?')
        }
        confirmText={
          action === 'schedule'
            ? t('确认定时发送')
            : action === 'send'
              ? t('Confirm send')
              : t('Cancel mailing')
        }
        isLoading={operation.isPending}
        handleConfirm={() => {
          if (action) operation.mutate(action)
        }}
        desc={
          <div className='space-y-2'>
            <p>{campaign?.subject}</p>
            {action === 'schedule' && (
              <p>
                {sendAt.replace('T', ' ')} {t('（北京时间）')}
              </p>
            )}
            <p>
              {t('{{count}} recipients', {
                count: formatNumber(campaign?.recipient_count ?? 0, locale),
              })}
            </p>
            <p>
              {action === 'schedule'
                ? t(
                    '此刻只保存定时任务；到时核验优惠已生效后，按保存的收件名单逐封发送。'
                  )
                : action === 'send'
                  ? t(
                      'Each recipient receives a separate email. The saved content and recipient list will be used.'
                    )
                  : t(
                      'Only unsent emails will be cancelled. An email already being sent may still be delivered.'
                    )}
            </p>
          </div>
        }
      />
    </>
  )
}
