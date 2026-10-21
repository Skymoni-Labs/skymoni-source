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
import { Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  StaticRowActions,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { formatDateTimeObject } from '@/lib/time'

import { deletePopupNotice, listPopupNotices, setPopupNoticeState } from './api'
import { PopupEditorDialog } from './components/editor-dialog'
import { PopupNoticeDialog } from './components/popup-notice-dialog'
import {
  popupAudienceLabel,
  popupDurationLabel,
  popupFrequencyLabel,
  popupStatusLabel,
} from './lib/labels'
import { getPopupDurationDays } from './lib/schema'
import type { PopupNotice } from './types'

export function PopupNotices() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<PopupNotice | null | undefined>(
    undefined
  )
  const [preview, setPreview] = useState<PopupNotice | null>(null)
  const [action, setAction] = useState<{
    notice: PopupNotice
    kind: 'publish' | 'disable' | 'delete' | 'resend'
  } | null>(null)
  const query = useQuery({
    queryKey: ['popup-notices', 'admin', page],
    queryFn: () => listPopupNotices(page),
  })
  const now = Math.floor(query.dataUpdatedAt / 1000)
  const operation = useMutation({
    mutationFn: async () => {
      if (!action) return
      if (action.kind === 'delete') await deletePopupNotice(action.notice.id)
      else {
        await setPopupNoticeState(
          action.notice.id,
          action.kind === 'disable' ? 'disabled' : 'published',
          action.kind === 'resend'
        )
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['popup-notices'] })
      toast.success(t('Popup updated'))
      setAction(null)
    },
    onError: (error) => handleServerError(error),
  })
  const columns: StaticDataTableColumn<PopupNotice>[] = [
    {
      id: 'title',
      header: t('Popup title'),
      cell: (notice) => (
        <div className='max-w-72'>
          <p className='font-medium break-words'>{notice.title}</p>
          <p className='text-muted-foreground text-xs'>
            #{notice.id} · {t('Revision')}{' '}
            {formatNumber(notice.revision, locale)}
          </p>
        </div>
      ),
    },
    {
      id: 'audience',
      header: t('Audience'),
      cell: (notice) => (
        <div>
          {popupAudienceLabel(notice.audience, t)}
          {notice.audience === 'user' && (
            <p className='text-muted-foreground text-xs'>
              #{notice.target_user_id}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (notice) => (
        <Badge
          variant={notice.status === 'published' ? 'default' : 'secondary'}
        >
          {popupStatusLabel(notice.status, t)}
        </Badge>
      ),
    },
    {
      id: 'frequency',
      header: t('Display frequency'),
      cell: (notice) => (
        <div>
          <p>{popupFrequencyLabel(notice.frequency, t)}</p>
          <p className='text-muted-foreground text-xs'>
            {t('Priority')}: {formatNumber(notice.priority, locale)}
          </p>
        </div>
      ),
    },
    {
      id: 'duration',
      header: t('Display duration'),
      cell: (notice) => (
        <div className='text-xs'>
          <p>{popupDurationLabel(getPopupDurationDays(notice), t, locale)}</p>
          {notice.end_at > 0 && (
            <p className='text-muted-foreground'>
              {t('Ends at {{time}}', {
                time: formatDateTimeObject(new Date(notice.end_at * 1000)),
              })}
            </p>
          )}
          {notice.status === 'published' && notice.start_at > now && (
            <Badge variant='outline'>{t('Scheduled')}</Badge>
          )}
          {notice.end_at > 0 && notice.end_at <= now && (
            <Badge variant='outline'>{t('Expired')}</Badge>
          )}
        </div>
      ),
    },
    {
      id: 'reads',
      header: t('Acknowledged users (current revision)'),
      cell: (notice) =>
        notice.audience === 'guest'
          ? t('Browser only')
          : formatNumber(notice.read_count ?? 0, locale),
    },
    {
      id: 'actions',
      header: t('Actions'),
      className: 'text-right',
      cell: (notice) => (
        <div className='flex items-center justify-end gap-1'>
          <Button size='sm' variant='ghost' onClick={() => setPreview(notice)}>
            {t('Preview')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() =>
              setAction({
                notice,
                kind: notice.status === 'published' ? 'disable' : 'publish',
              })
            }
          >
            {notice.status === 'published' ? t('Disable') : t('Publish')}
          </Button>
          {notice.status === 'published' && (
            <Button
              size='sm'
              variant='ghost'
              onClick={() => setAction({ notice, kind: 'resend' })}
            >
              {t('Send again')}
            </Button>
          )}
          <StaticRowActions
            editLabel={t('Edit popup')}
            deleteLabel={t('Delete popup')}
            menuLabel={t('Popup actions')}
            onEdit={() => setEditor(notice)}
            onDelete={() => setAction({ notice, kind: 'delete' })}
          />
        </div>
      ),
    },
  ]
  let title = t('Publish popup?')
  if (action?.kind === 'delete') title = t('Delete popup?')
  if (action?.kind === 'disable') title = t('Disable popup?')
  if (action?.kind === 'resend') title = t('Send this popup again?')
  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Popup notifications')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            variant='outline'
            onClick={() => {
              void query.refetch()
            }}
            disabled={query.isFetching}
          >
            <RefreshCw />
            {t('Refresh')}
          </Button>
          <Button onClick={() => setEditor(null)}>
            <Plus />
            {t('Create popup')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-4 p-3 sm:p-4'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Publish custom popups for all signed-in users, a specific user, or visitors who are not signed in. Existing announcements remain separate.'
              )}
            </p>
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
                  getRowKey={(notice) => notice.id}
                  emptyContent={
                    <EmptyState
                      title={t('No popup notifications yet')}
                      description={t(
                        'Create a draft and preview it. Nothing is shown to users until you publish.'
                      )}
                    />
                  }
                />
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-muted-foreground text-sm'>
                    {t('Total')} {formatNumber(query.data.total, locale)}
                  </span>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      {t('Previous')}
                    </Button>
                    <span>{formatNumber(page, locale)}</span>
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
        </SectionPageLayout.Content>
      </SectionPageLayout>
      {editor !== undefined && (
        <PopupEditorDialog
          key={editor?.id ?? 'new'}
          notice={editor}
          onClose={() => setEditor(undefined)}
        />
      )}
      {preview && (
        <PopupNoticeDialog
          preview
          notice={preview}
          onClose={() => setPreview(null)}
        />
      )}
      <ConfirmDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !operation.isPending) setAction(null)
        }}
        title={title}
        destructive={action?.kind === 'delete'}
        isLoading={operation.isPending}
        handleConfirm={() => operation.mutate()}
        desc={
          <div className='space-y-2'>
            <p className='font-medium'>{action?.notice.title}</p>
            <p>
              {action ? popupAudienceLabel(action.notice.audience, t) : ''}
              {action?.notice.audience === 'user'
                ? ` (#${action.notice.target_user_id})`
                : ''}
            </p>
            {action?.kind === 'resend' && (
              <p>
                {t(
                  'This creates a new revision so recipients can see the popup again.'
                )}
              </p>
            )}
            {action?.kind === 'publish' && (
              <p>
                {t('Recipients will see this popup when they open the site.')}
              </p>
            )}
            {action?.kind === 'disable' && (
              <p>
                {t(
                  'The popup will no longer be delivered. Its content and read records are kept.'
                )}
              </p>
            )}
            {action?.kind === 'delete' && (
              <p>
                {t(
                  'The popup will be removed from this list and will no longer be delivered.'
                )}
              </p>
            )}
          </div>
        }
      />
    </>
  )
}
