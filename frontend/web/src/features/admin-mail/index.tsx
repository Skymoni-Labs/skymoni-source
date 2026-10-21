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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Mail, Pencil, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { formatDateTimeObject } from '@/lib/time'

import { listMail } from './api'
import { MailComposer } from './components/composer'
import { MailDetailDialog } from './components/detail-dialog'
import { mailStatusLabel } from './lib/labels'
import type { MailCampaign } from './types'

export function AdminMail() {
  const client = useQueryClient()
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const [detailId, setDetailId] = useState<number | null>(() => {
    const value = new URLSearchParams(window.location.search).get(
      'draft-preview'
    )
    return value && /^\d+$/.test(value) && Number(value) > 0
      ? Number(value)
      : null
  })
  const audienceLabels: Record<MailCampaign['audience'], string> = {
    emails: t('Enter email addresses directly'),
    users: t('Selected users (one or more)'),
    all_users: t('All active users with email'),
  }
  const openComposer = (id: number, mode: 'edit' | 'reuse') => {
    setEditingId(mode === 'edit' ? id : null)
    setTemplateId(mode === 'reuse' ? id : null)
    setDetailId(null)
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const query = useQuery({
    queryKey: ['admin-mail', 'list', page],
    queryFn: () => listMail(page),
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (item) => item.status === 'queued' || item.status === 'scheduled'
      )
        ? 5000
        : false,
  })
  const columns: StaticDataTableColumn<MailCampaign>[] = [
    {
      id: 'subject',
      header: t('Email subject'),
      cell: (mail) => (
        <p className='max-w-72 font-medium break-words'>{mail.subject}</p>
      ),
    },
    {
      id: 'audience',
      header: t('Recipients'),
      cell: (mail) => (
        <div>
          {audienceLabels[mail.audience]}
          <p className='text-muted-foreground text-xs'>
            {t('{{count}} recipients', {
              count: formatNumber(mail.recipient_count, locale),
            })}
          </p>
        </div>
      ),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (mail) => (
        <div className='space-y-1'>
          <Badge variant='outline'>{mailStatusLabel(mail.status, t)}</Badge>
          {mail.send_at > 0 && (
            <p className='text-muted-foreground text-xs'>
              {new Date(mail.send_at * 1000).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })}{' '}
              {t('北京时间')}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'progress',
      header: t('Delivery progress'),
      cell: (mail) => (
        <div className='text-xs'>
          <p>
            {t('Accepted: {{count}}', {
              count: formatNumber(mail.counts?.sent ?? 0, locale),
            })}
          </p>
          <p>
            {t('Failed: {{count}}', {
              count: formatNumber(mail.counts?.failed ?? 0, locale),
            })}
          </p>
          <p>
            {t('Unconfirmed: {{count}}', {
              count: formatNumber(mail.counts?.uncertain ?? 0, locale),
            })}
          </p>
        </div>
      ),
    },
    {
      id: 'created',
      header: t('Created at'),
      cell: (mail) => formatDateTimeObject(new Date(mail.created_at * 1000)),
    },
    {
      id: 'action',
      header: t('Actions'),
      cell: (mail) => (
        <div className='flex flex-wrap gap-2'>
          {mail.status === 'draft' && (
            <Button
              size='sm'
              variant='outline'
              onClick={() => openComposer(mail.id, 'edit')}
            >
              <Pencil />
              {t('Edit draft')}
            </Button>
          )}
          <Button
            size='sm'
            variant='outline'
            onClick={() => openComposer(mail.id, 'reuse')}
          >
            <Copy />
            {t('Reuse template')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setDetailId(mail.id)}
          >
            {t('View / send')}
          </Button>
        </div>
      ),
    },
  ]
  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          <Mail className='inline size-5' /> {t('Email messages')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            variant='outline'
            disabled={query.isFetching}
            onClick={() => {
              void query.refetch()
              void client.invalidateQueries({
                queryKey: ['mail-recipient-search'],
              })
            }}
          >
            <RefreshCw />
            {t('Refresh')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-6 p-3 sm:p-4'>
            {query.data?.sender && (
              <p className='text-muted-foreground text-sm'>
                {t('Sender email')}:{' '}
                <span className='font-medium'>{query.data.sender}</span>
              </p>
            )}
            {query.data && !query.data.smtp_ready && (
              <Alert>
                <AlertTitle>{t('SMTP is not configured')}</AlertTitle>
                <AlertDescription>
                  {t(
                    'Configure SMTP in System Settings → Integrations → Email. You can save and preview drafts now.'
                  )}
                </AlertDescription>
              </Alert>
            )}
            <div ref={composerRef} className='scroll-mt-20'>
              <MailComposer
                key={`${editingId ?? 'new'}:${templateId ?? 'none'}`}
                draftId={editingId}
                templateId={templateId}
                onCancelEdit={() => {
                  setEditingId(null)
                  setTemplateId(null)
                }}
                onSaved={(campaign) => {
                  setEditingId(null)
                  setTemplateId(null)
                  setPage(1)
                  setDetailId(campaign.id)
                }}
              />
            </div>
            <div className='space-y-3'>
              <h2 className='text-lg font-semibold'>
                {t('Email sending history')}
              </h2>
              {query.isLoading && <LoadingState />}
              {query.isError && (
                <ErrorState
                  onRetry={() => {
                    void query.refetch()
                  }}
                />
              )}
              {query.data && (
                <>
                  <StaticDataTable
                    columns={columns}
                    data={query.data.items}
                    getRowKey={(mail) => mail.id}
                    emptyContent={
                      <EmptyState
                        title={t('No email messages yet')}
                        description={t(
                          'Saved drafts and delivery results appear here.'
                        )}
                      />
                    }
                  />
                  <div className='flex items-center justify-between gap-2'>
                    <p className='text-muted-foreground text-sm'>
                      {t('Total')} {formatNumber(query.data.total, locale)}
                    </p>
                    <div className='flex gap-2'>
                      <Button
                        variant='outline'
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        {t('Previous')}
                      </Button>
                      <Button
                        variant='outline'
                        disabled={page * 20 >= query.data.total}
                        onClick={() => setPage(page + 1)}
                      >
                        {t('Next')}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      {detailId !== null && (
        <MailDetailDialog
          key={detailId}
          id={detailId}
          smtpReady={query.data?.smtp_ready ?? false}
          onClose={() => setDetailId(null)}
          onReuseTemplate={(id) => openComposer(id, 'reuse')}
        />
      )}
    </>
  )
}
