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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  editInventory,
  getInventoryDetail,
  importBenefitInventory,
  listBenefitInventory,
  manageInventory,
} from '../api'
import type { Benefit, InventoryItem } from '../types'
import { InventoryEditor, AddInventory } from './inventory-editor'

const statusKeys = {
  all: 'All inventory',
  available: 'Available',
  disabled: 'Disabled',
  reserved: 'Reserved inventory',
  delivered: 'Delivered',
  removed: 'Inventory recycle bin',
} as const
const actionKeys = {
  disable: 'Disable',
  enable: 'Enable',
  remove: 'Delete',
  restore: 'Restore inventory',
} as const
type Action = keyof typeof actionKeys

export function InventoryManager({ benefits }: { benefits: Benefit[] }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const auth = useAuthStore((s) => s.auth)
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [benefitId, setBenefitId] = useState('0')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<InventoryItem[]>([])
  const [item, setItem] = useState<InventoryItem | null>(null)
  const [adding, setAdding] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [pending, setPending] = useState(false)
  const [action, setAction] = useState<{
    items: InventoryItem[]
    action: Action
  } | null>(null)
  const [reason, setReason] = useState('')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const query = useQuery({
    queryKey: [
      'benefits',
      'inventory-manager',
      auth.user?.id,
      auth.session?.sid,
      page,
      benefitId,
      status,
      keyword,
    ],
    queryFn: ({ signal }) =>
      listBenefitInventory(page, signal, { benefitId, status, keyword }),
    gcTime: 0,
  })
  const refresh = async () => {
    setSelected([])
    await Promise.all(
      ['benefits', 'shop'].map((key) =>
        client.invalidateQueries({ queryKey: [key] })
      )
    )
  }
  const openDetail = async (row: InventoryItem) => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setLoadingDetail(true)
    try {
      setItem(await getInventoryDetail(row.id, controller.signal))
    } catch (e) {
      if (!controller.signal.aborted) handleServerError(e)
    } finally {
      if (!controller.signal.aborted) setLoadingDetail(false)
    }
  }
  const changePage = (next: number) => {
    setSelected([])
    setPage(next)
  }
  const beginAction = (rows: InventoryItem[], next: Action) => {
    setReason('')
    setAction({ items: rows, action: next })
  }
  const unclaimed =
    selected.length > 0 &&
    selected.every((row) => !row.claimed && row.status !== 'removed')
  const removed =
    selected.length > 0 && selected.every((row) => row.status === 'removed')
  const rows = query.data?.items || []
  const chooseable = rows.filter((row) => !row.claimed)
  const date = (value?: number) =>
    value ? new Date(value * 1000).toLocaleString(locale) : '—'
  let actionDescription = 'Update the status of the selected unsold inventory?'
  if (action?.action === 'remove') {
    actionDescription =
      'Move selected unsold inventory to the recycle bin? This does not change delivered resources.'
  }
  if (action?.action === 'restore') {
    actionDescription =
      'Restore inventory as disabled. Enable it after checking its contents.'
  }
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap gap-2'>
          {Object.entries(query.data?.counts || {}).map(([key, count]) => (
            <Badge key={key} variant='outline'>
              {t(statusKeys[key as keyof typeof statusKeys])}{' '}
              {formatNumber(count, locale)}
            </Badge>
          ))}
        </div>
        <Button
          variant='outline'
          onClick={() => setAdding(true)}
          disabled={!benefits.some((b) => b.stockMode === 'individual')}
        >
          {t('Add inventory item')}
        </Button>
      </div>
      <form
        className='grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4'
        onSubmit={(e) => {
          e.preventDefault()
          setKeyword(search.trim())
          changePage(1)
        }}
      >
        <Field>
          <FieldLabel htmlFor='stock-resource'>{t('Benefit name')}</FieldLabel>
          <NativeSelect
            id='stock-resource'
            value={benefitId}
            onChange={(e) => {
              setBenefitId(e.target.value)
              changePage(1)
            }}
          >
            <option value='0'>{t('All resources')}</option>
            {benefits
              .filter((b) => b.stockMode === 'individual')
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor='stock-status'>{t('Status')}</FieldLabel>
          <NativeSelect
            id='stock-status'
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              changePage(1)
            }}
          >
            {Object.entries(statusKeys).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor='stock-search'>
            {t('Search inventory')}
          </FieldLabel>
          <Input
            id='stock-search'
            value={search}
            maxLength={200}
            placeholder={t('Account, resource name or inventory ID')}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <div className='flex gap-2'>
          <Button type='submit'>{t('Search')}</Button>
          <Button
            type='button'
            variant='outline'
            disabled={query.isFetching}
            onClick={() => void refresh()}
          >
            {t('Refresh')}
          </Button>
        </div>
      </form>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-muted-foreground text-xs'>
          {t('Selected inventory count', { count: selected.length })}
        </span>
        <Button
          size='sm'
          variant='outline'
          disabled={!unclaimed || pending}
          onClick={() => beginAction(selected, 'disable')}
        >
          {t('Disable')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={!unclaimed || pending}
          onClick={() => beginAction(selected, 'enable')}
        >
          {t('Enable')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={!unclaimed || pending}
          onClick={() => beginAction(selected, 'remove')}
        >
          {t('Delete')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          disabled={!removed || pending}
          onClick={() => beginAction(selected, 'restore')}
        >
          {t('Restore inventory')}
        </Button>
      </div>
      {query.isPending && <LoadingState />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
      {query.data && !query.isError && (
        <>
          <StaticDataTable
            tableProps={{ 'aria-label': t('Benefit inventory') }}
            data={rows}
            getRowKey={(r) => r.id}
            emptyContent={t('No inventory matches these filters')}
            columns={[
              {
                id: 'select',
                header: (
                  <Checkbox
                    aria-label={t('Select this inventory page')}
                    checked={
                      chooseable.length > 0 &&
                      chooseable.every((r) =>
                        selected.some((s) => s.id === r.id)
                      )
                    }
                    disabled={!chooseable.length || pending}
                    onCheckedChange={(checked) =>
                      setSelected(checked ? chooseable : [])
                    }
                  />
                ),
                cell: (row) => (
                  <Checkbox
                    aria-label={t('Select inventory item', { id: row.id })}
                    disabled={row.claimed || pending}
                    checked={selected.some((s) => s.id === row.id)}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, row]
                          : current.filter((s) => s.id !== row.id)
                      )
                    }
                  />
                ),
              },
              {
                id: 'id',
                header: t('Inventory item'),
                cell: (row) => <code>#{row.id}</code>,
              },
              {
                id: 'benefit',
                header: t('Benefit name'),
                cell: (row) =>
                  row.benefitName ||
                  benefits.find((b) => b.id === row.benefitId)?.name ||
                  row.benefitId,
              },
              {
                id: 'account',
                header: t('Delivery content'),
                cell: (row) => (
                  <span className='block max-w-56 truncate'>
                    {row.fields.find((f) => f.kind === 'text')?.value ||
                      t('Sensitive text')}
                  </span>
                ),
              },
              {
                id: 'status',
                header: t('Status'),
                cell: (row) => (
                  <Badge variant='outline'>
                    {t(
                      statusKeys[
                        row.status || (row.claimed ? 'delivered' : 'available')
                      ]
                    )}
                  </Badge>
                ),
              },
              {
                id: 'owner',
                header: t('Delivery recipient'),
                cell: (row) =>
                  row.userId ? (
                    <span>
                      #{row.userId}
                      {row.orderId ? ` · ${t('Order')} #${row.orderId}` : ''}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                id: 'updated',
                header: t('Updated at'),
                cell: (row) => (
                  <span className='text-xs'>
                    {date(row.updatedAt || row.createdAt)}
                  </span>
                ),
              },
              {
                id: 'actions',
                header: t('Actions'),
                cell: (row) => (
                  <div className='flex flex-wrap gap-1'>
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={loadingDetail || pending}
                      onClick={() => void openDetail(row)}
                    >
                      {t(
                        row.status === 'removed' || row.status === 'reserved'
                          ? 'View'
                          : 'View and edit inventory'
                      )}
                    </Button>
                    {!row.claimed &&
                      (row.status === 'removed' ? (
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => beginAction([row], 'restore')}
                        >
                          {t('Restore inventory')}
                        </Button>
                      ) : (
                        <>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() =>
                              beginAction(
                                [row],
                                row.status === 'disabled' ? 'enable' : 'disable'
                              )
                            }
                          >
                            {t(
                              row.status === 'disabled' ? 'Enable' : 'Disable'
                            )}
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => beginAction([row], 'remove')}
                          >
                            {t('Delete')}
                          </Button>
                        </>
                      ))}
                  </div>
                ),
              },
            ]}
          />
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <p className='text-muted-foreground text-xs'>
              {t('Inventory pagination', { page, total: query.data.total })}
            </p>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page === 1 || query.isFetching}
                onClick={() => changePage(page - 1)}
              >
                {t('Previous')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={page * 50 >= query.data.total || query.isFetching}
                onClick={() => changePage(page + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          </div>
        </>
      )}
      <p className='text-muted-foreground text-xs'>
        {t(
          'Disabled and deleted inventory is excluded from sales. Delivered inventory is never sold again. Passwords are revealed only in the detail dialog.'
        )}
      </p>
      {item && (
        <InventoryEditor
          key={item.id}
          item={item}
          onClose={() => setItem(null)}
          onSave={async (value, why, sync) => {
            await editInventory(value, why, sync)
            setItem(null)
            await refresh()
            toast.success(t('Inventory saved'))
          }}
        />
      )}
      {adding && (
        <AddInventory
          benefits={benefits}
          onClose={() => setAdding(false)}
          onSave={async (value) => {
            await importBenefitInventory([value])
            setAdding(false)
            await refresh()
            toast.success(t('Inventory imported'))
          }}
        />
      )}
      {action && (
        <ConfirmDialog
          open
          title={t(actionKeys[action.action])}
          desc={t(actionDescription)}
          onOpenChange={(open) => {
            if (!open && !pending) setAction(null)
          }}
          destructive={action.action === 'remove'}
          confirmText={t('Confirm')}
          isLoading={pending}
          handleConfirm={() => {
            setPending(true)
            void manageInventory(action.items, action.action, reason)
              .then(async () => {
                setAction(null)
                await refresh()
                toast.success(t('Inventory saved'))
              })
              .catch(async (e) => {
                handleServerError(e)
                await refresh()
              })
              .finally(() => setPending(false))
          }}
        >
          <Field>
            <FieldLabel htmlFor='stock-action-reason'>
              {t('Change reason (optional)')}
            </FieldLabel>
            <Textarea
              id='stock-action-reason'
              value={reason}
              maxLength={500}
              disabled={pending}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </ConfirmDialog>
      )}
    </div>
  )
}
