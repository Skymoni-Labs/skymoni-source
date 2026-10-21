import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import {
  CheckCheck,
  Clock3,
  FileStack,
  RefreshCw,
  Search,
  Undo2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTableBulkActions,
  DataTableColumnHeader,
  DataTablePage,
  useDataTable,
} from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { creatorRequest } from '../api'
import {
  canReview,
  filterReviewItems,
  reviewItems,
  type ReviewCatalog,
  type ReviewDecision,
  type ReviewItem,
} from '../lib/review'
import { ReviewDetail } from './review-detail'

const statusLabels = {
  review: 'Pending review',
  published: 'Published',
  returned: 'Returned to draft',
} as const
const decisionLabels = {
  approve: 'Approve',
  reject: 'Return for changes',
  unpublish: 'Unpublish',
} as const

export function CreatorReviewQueue(props: {
  catalog: ReviewCatalog
  fetching: boolean
  onRefresh: () => void
  onCatalogChange: (catalog: ReviewCatalog) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const client = useQueryClient()
  const [status, setStatus] = useState('review')
  const [kind, setKind] = useState('all')
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [detailKey, setDetailKey] = useState<string>()
  const [review, setReview] = useState<{
    items: ReviewItem[]
    decision: ReviewDecision
    actor: string
  }>()
  const [note, setNote] = useState('')
  const [result, setResult] = useState<{
    succeeded: number
    failed: { key: string; title: string; message: string }[]
  }>()
  const items = useMemo(() => reviewItems(props.catalog), [props.catalog])
  const filtered = useMemo(
    () => filterReviewItems(items, { status, kind, search }),
    [items, status, kind, search]
  )
  const detail = items.find((item) => item.key === detailKey)
  const mutation = useMutation({
    mutationFn: async (input: NonNullable<typeof review>) => {
      let succeeded = 0
      const failed: { key: string; title: string; message: string }[] = []
      // Approve parent projects before their software releases in the same batch.
      const ordered = [...input.items].sort(
        (a, b) => Number(a.kind === 'release') - Number(b.kind === 'release')
      )
      for (const [index, item] of ordered.entries()) {
        try {
          const auth = useAuthStore.getState().auth
          if (`${auth.user?.id}:${auth.session?.sid}` !== input.actor) {
            throw new DOMException('Creator account changed', 'AbortError')
          }
          const catalog = await creatorRequest<ReviewCatalog>(
            `/admin/${item.kind}/${encodeURIComponent(item.id)}`,
            {
              method: 'post',
              data: {
                revision: item.revision,
                decision: input.decision,
                note:
                  note.trim() ||
                  (input.decision === 'unpublish'
                    ? t('Unpublished by administrator.')
                    : ''),
              },
            }
          )
          props.onCatalogChange(catalog)
          succeeded++
        } catch (error) {
          failed.push({
            key: item.key,
            title: item.title,
            message: getServerErrorMessage(
              error,
              t('Unable to process this submission. Refresh and try again.')
            ),
          })
          if (error instanceof DOMException && error.name === 'AbortError') {
            failed.push(
              ...ordered.slice(index + 1).map((remaining) => ({
                key: remaining.key,
                title: remaining.title,
                message: t(
                  'Review stopped because the signed-in account changed.'
                ),
              }))
            )
            break
          }
        }
      }
      return { succeeded, failed }
    },
    onSuccess: (data) => {
      setResult(data)
      setReview(undefined)
      setSelection({})
      setNote('')
      props.onRefresh()
      for (const key of ['creator-public', 'creator-me', 'software-catalog']) {
        void client.invalidateQueries({ queryKey: [key] })
      }
    },
  })
  const startReview = (targets: ReviewItem[], decision: ReviewDecision) => {
    const eligible = targets.filter((item) => canReview(item, decision))
    if (!eligible.length) return
    setNote('')
    const auth = useAuthStore.getState().auth
    setReview({
      items: eligible,
      decision,
      actor: `${auth.user?.id}:${auth.session?.sid}`,
    })
  }
  const columns: ColumnDef<ReviewItem>[] = [
    {
      id: 'select',
      size: 44,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          aria-label={t('Select current page')}
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          disabled={
            mutation.isPending ||
            !table.getRowModel().rows.some((row) => row.getCanSelect())
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={t('Select {{title}}', { title: row.original.title })}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect() || mutation.isPending}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
        />
      ),
    },
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Submission')} />
      ),
      cell: ({ row }) => (
        <div className='max-w-52 min-w-36'>
          <Button
            variant='link'
            className='h-auto max-w-full justify-start p-0 text-left font-semibold break-words whitespace-normal'
            onClick={() => setDetailKey(row.original.key)}
          >
            {row.original.title}
          </Button>
          <p className='text-muted-foreground mt-1 line-clamp-1 text-xs'>
            {row.original.summary}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'author',
      header: t('Creator'),
      cell: ({ row }) => (
        <div className='max-w-32 text-sm break-words'>
          <span>{row.original.author || '—'}</span>
          <p className='text-muted-foreground text-xs break-all'>
            {row.original.handle && `@${row.original.handle} · `}UID{' '}
            {row.original.ownerId ?? '—'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'kind',
      header: t('Content type'),
      cell: ({ row }) => (
        <Badge variant='outline'>
          {t(row.original.kind === 'work' ? 'Project' : 'Software release')}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: t('Status'),
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === 'review' ? 'default' : 'secondary'}
        >
          {t(statusLabels[row.original.status])}
        </Badge>
      ),
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Updated at')} />
      ),
      cell: ({ row }) => (
        <span className='text-muted-foreground block max-w-28 text-xs'>
          {new Date(row.original.updatedAt).toLocaleString(locale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('Actions'),
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          size='sm'
          variant='outline'
          aria-label={t('Review {{title}}', { title: row.original.title })}
          onClick={() => setDetailKey(row.original.key)}
        >
          {t('View details')}
        </Button>
      ),
    },
  ]
  const { table } = useDataTable({
    data: filtered,
    columns,
    getRowId: (item) => item.key,
    enableRowSelection: (row) => row.original.status !== 'returned',
    rowSelection: selection,
    onRowSelectionChange: setSelection,
    initialPagination: { pageIndex: 0, pageSize: 20 },
    initialSorting: [{ id: 'updatedAt', desc: false }],
    columnVisibilityStorageKey: false,
    columnSizingStorageKey: false,
  })
  const selected = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)
  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <p className='text-muted-foreground max-w-2xl text-sm'>
          {t(
            'Review submissions in one place. Open details before making a decision; returned content stays private.'
          )}
        </p>
        <Button
          size='sm'
          variant='outline'
          disabled={props.fetching || mutation.isPending}
          onClick={props.onRefresh}
        >
          <RefreshCw className='size-4' />
          {t('Refresh')}
        </Button>
      </div>
      <div className='grid grid-cols-3 gap-2 sm:gap-4'>
        {(
          [
            { value: 'review', icon: Clock3 },
            { value: 'published', icon: CheckCheck },
            { value: 'returned', icon: Undo2 },
          ] as const
        ).map(({ value, icon: Icon }) => (
          <Button
            key={value}
            variant='outline'
            aria-pressed={status === value}
            disabled={mutation.isPending}
            onClick={() => {
              setStatus(value)
              setSelection({})
              table.setPageIndex(0)
            }}
            className={`h-auto min-w-0 flex-col items-start gap-3 rounded-xl px-3 py-4 sm:px-5 ${status === value ? 'border-primary/40 bg-primary/5' : ''}`}
          >
            <span className='text-muted-foreground flex items-center gap-2 text-xs whitespace-normal sm:text-sm'>
              <Icon className='size-4 shrink-0' />
              {t(statusLabels[value])}
            </span>
            <span className='text-2xl font-semibold tabular-nums'>
              {formatNumber(
                items.filter((item) => item.status === value).length,
                locale
              )}
            </span>
          </Button>
        ))}
      </div>
      <div className='flex flex-wrap items-center gap-3'>
        <div className='relative min-w-52 flex-1'>
          <Search className='text-muted-foreground absolute top-2.5 left-3 size-4' />
          <Input
            className='pl-9'
            aria-label={t('Search submissions')}
            placeholder={t('Search title, creator, UID or content…')}
            value={search}
            disabled={mutation.isPending}
            onChange={(event) => {
              setSearch(event.target.value)
              setSelection({})
              table.setPageIndex(0)
            }}
          />
        </div>
        <NativeSelect
          aria-label={t('Content type')}
          value={kind}
          disabled={mutation.isPending}
          onChange={(event) => {
            setKind(event.target.value)
            setSelection({})
            table.setPageIndex(0)
          }}
        >
          <NativeSelectOption value='all'>
            {t('All content')}
          </NativeSelectOption>
          <NativeSelectOption value='work'>{t('Project')}</NativeSelectOption>
          <NativeSelectOption value='release'>
            {t('Software release')}
          </NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label={t('Review status')}
          value={status}
          disabled={mutation.isPending}
          onChange={(event) => {
            setStatus(event.target.value)
            setSelection({})
            table.setPageIndex(0)
          }}
        >
          <NativeSelectOption value='all'>
            {t('All statuses')}
          </NativeSelectOption>
          {Object.entries(statusLabels).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {t(label)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {result && (
        <div role='status' className='rounded-xl border p-4 text-sm'>
          <p>
            {t('Processed {{count}} submissions.', { count: result.succeeded })}
          </p>
          {result.failed.length > 0 && (
            <>
              <p className='text-destructive mt-2'>
                {t(
                  '{{count}} submissions were not processed. Refresh and review them individually.',
                  { count: result.failed.length }
                )}
              </p>
              <ul className='mt-2 max-h-40 overflow-auto'>
                {result.failed.map((item) => (
                  <li key={item.key} className='break-words'>
                    {item.title}: {item.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <DataTablePage
        table={table}
        columns={columns}
        toolbarProps={null}
        fixedHeight={false}
        paginationInFooter={false}
        emptyTitle={t(
          status === 'review'
            ? 'No pending submissions'
            : 'No matching submissions'
        )}
        emptyDescription={t('Change filters to view other submissions.')}
        emptyIcon={<FileStack className='size-8' />}
        mobileProps={{ enableRowSelection: true }}
        showMobileBulkActions
        bulkActions={
          <DataTableBulkActions
            table={table}
            placement='floating'
            entityName={t('Submissions')}
          >
            {(['approve', 'reject', 'unpublish'] as const).map((decision) => (
              <Button
                key={decision}
                size='sm'
                variant={decision === 'approve' ? 'default' : 'outline'}
                disabled={
                  mutation.isPending ||
                  !selected.length ||
                  !selected.every((item) => canReview(item, decision))
                }
                onClick={() => startReview(selected, decision)}
              >
                {t(decisionLabels[decision])}
              </Button>
            ))}
          </DataTableBulkActions>
        }
      />
      <ReviewDetail
        item={detail}
        busy={mutation.isPending}
        onClose={() => setDetailKey(undefined)}
        onDecision={(item, decision) => {
          setDetailKey(undefined)
          startReview([item], decision)
        }}
      />
      <ConfirmDialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setReview(undefined)
        }}
        title={
          review
            ? t('Confirm {{action}} · {{count}} submissions', {
                action: t(decisionLabels[review.decision]),
                count: review.items.length,
              })
            : t('Creator review')
        }
        desc={
          <div className='space-y-3'>
            <p>
              {t(
                'Only the listed submissions will be processed. Changed revisions will be skipped.'
              )}
            </p>
            <ul className='max-h-40 space-y-1 overflow-auto rounded-lg border p-3 text-sm'>
              {review?.items.map((item) => (
                <li key={item.key} className='break-words'>
                  {item.title} · {item.author}
                </li>
              ))}
            </ul>
            <Textarea
              aria-label={t('Review note')}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('Explain requested changes or add a review note…')}
              disabled={mutation.isPending}
            />
            <p className='text-muted-foreground text-xs break-all'>
              {t('A reason is required when returning a submission.')}
            </p>
          </div>
        }
        confirmText={review ? t(decisionLabels[review.decision]) : t('Confirm')}
        disabled={review?.decision === 'reject' && !note.trim()}
        handleConfirm={async () => {
          if (review) await mutation.mutateAsync(review)
        }}
        isLoading={mutation.isPending}
      />
    </div>
  )
}
