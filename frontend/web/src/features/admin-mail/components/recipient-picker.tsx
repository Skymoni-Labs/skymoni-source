import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { searchUsers } from '@/features/users/api'
import type { User } from '@/features/users/types'
import { useDebounce } from '@/hooks/use-debounce'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

const PAGE_SIZE = 50
const LIMIT = 5000
type Recipient = Pick<
  User,
  'id' | 'username' | 'display_name' | 'email' | 'status'
>
const canReceive = (user: Recipient) =>
  user.status === 1 && Boolean(user.email?.trim())
const label = (user: Recipient) =>
  `${user.display_name || user.username} · ${user.username} (#${user.id})`

async function loadUsers(
  keyword: string,
  page: number,
  pageSize = PAGE_SIZE,
  sortOrder: 'asc' | 'desc' = 'desc'
) {
  const response = requireServerSuccess(
    await searchUsers({
      keyword,
      p: page,
      page_size: pageSize,
      sort_by: 'id',
      sort_order: sortOrder,
    })
  )
  if (!response.data) throw new Error('用户列表加载失败，请重试')
  return response.data
}

export function MailRecipientPicker({
  value,
  onChange,
  onBusyChange,
}: {
  value: number[]
  onChange: (ids: number[]) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const client = useQueryClient()
  const [search, setSearch] = useState({ keyword: '', page: 1 })
  const debounced = useDebounce(search.keyword, 250)
  const [known, setKnown] = useState<Record<number, Recipient>>({})
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  const latestValue = useRef(value)
  latestValue.current = value
  useEffect(
    () => () => {
      request.current++
    },
    []
  )
  const query = useQuery({
    queryKey: ['mail-recipient-search', debounced, search.page, 'newest'],
    queryFn: () => loadUsers(debounced, search.page),
    enabled: debounced === search.keyword && !busy,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
  })
  useEffect(() => {
    if (!query.data) return
    setKnown((previous) => ({
      ...previous,
      ...Object.fromEntries(query.data.items.map((user) => [user.id, user])),
    }))
  }, [query.data])
  const users = query.data?.items ?? []
  const eligible = users.filter(canReceive)
  const selected = new Set(value)
  const selectedOnPage = eligible.filter((user) => selected.has(user.id)).length
  const loading = query.isPending || debounced !== search.keyword
  const updating = query.isFetching || debounced !== search.keyword
  const allOnPage = eligible.length > 0 && selectedOnPage === eligible.length
  const total = query.data?.total ?? 0
  const pageSize = query.data?.page_size || PAGE_SIZE
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const refreshUsers = () => {
    // Invalidate other pages too, so returning to them cannot restore an old
    // count or ordering. Refreshing never changes the selected recipient IDs.
    void client.invalidateQueries({
      queryKey: ['mail-recipient-search'],
      refetchType: 'none',
    })
    if (search.page !== 1) setSearch((previous) => ({ ...previous, page: 1 }))
    else void query.refetch()
  }
  const update = (ids: number[]) => {
    const next = [...new Set(ids)]
    if (next.length > LIMIT) {
      toast.error('每封邮件最多选择 5000 位用户，请缩小范围')
      return
    }
    onChange(next)
  }
  const selectPage = () =>
    update(
      allOnPage
        ? value.filter((id) => !eligible.some((user) => user.id === id))
        : [...value, ...eligible.map((user) => user.id)]
    )
  const selectResults = async () => {
    const generation = ++request.current
    setBusy(true)
    onBusyChange?.(true)
    try {
      // Ascending IDs keep the initial recipient set stable if someone signs
      // up while later pages are being collected. The visible list is newest first.
      const first = await loadUsers(debounced, 1, 100, 'asc')
      if (first.total > LIMIT)
        throw new Error('搜索结果超过 5000 人，请先缩小搜索范围')
      const results = [...first.items]
      const pageSize = first.page_size || 100
      for (let page = 2; page <= Math.ceil(first.total / pageSize); page++) {
        if (request.current !== generation) return
        const data = await loadUsers(debounced, page, pageSize, 'asc')
        results.push(...data.items)
      }
      if (request.current !== generation || latestValue.current !== value)
        return
      setKnown((previous) => ({
        ...previous,
        ...Object.fromEntries(results.map((user) => [user.id, user])),
      }))
      update([...value, ...results.filter(canReceive).map((user) => user.id)])
    } catch (error) {
      if (request.current === generation) handleServerError(error)
    } finally {
      if (request.current === generation) {
        setBusy(false)
        onBusyChange?.(false)
      }
    }
  }
  return (
    <div
      className='space-y-3 rounded-lg border p-3'
      aria-label='批量选择邮件收件人'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-sm font-medium' role='status'>
          已选择 {value.length} 人
        </p>
        <div className='flex items-center gap-1'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={busy || updating}
            onClick={refreshUsers}
          >
            <RefreshCw
              className={query.isFetching ? 'animate-spin' : undefined}
            />
            {query.isFetching ? '正在刷新…' : '刷新用户'}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            disabled={busy || !value.length}
            onClick={() => onChange([])}
          >
            清空已选
          </Button>
        </div>
      </div>
      <Input
        aria-label='搜索邮件收件人'
        placeholder='搜索用户名、邮箱或用户 ID'
        value={search.keyword}
        disabled={busy}
        onChange={(event) =>
          setSearch({ keyword: event.target.value, page: 1 })
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={busy || updating || !eligible.length}
          onClick={selectPage}
        >
          {allOnPage ? '取消本页选择' : '本页全选'}
        </Button>
        {total > pageSize && (
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={busy || updating || total > LIMIT}
            onClick={() => {
              void selectResults()
            }}
          >
            {busy ? '正在批量选择…' : `全选搜索结果（${total} 人）`}
          </Button>
        )}
        <span className='text-muted-foreground text-xs'>
          {total > 0
            ? `共 ${total} 人，仅选择正常且已绑定邮箱的用户`
            : '仅选择正常且已绑定邮箱的用户'}
        </span>
      </div>
      <p className='text-muted-foreground text-xs'>
        新注册用户优先显示，每 30
        秒自动更新；刷新、搜索和翻页都会保留已选收件人。
      </p>
      {query.isError && query.data && (
        <p className='text-destructive text-xs' role='alert'>
          用户列表更新失败，当前显示上次结果，请点击“刷新用户”重试。
        </p>
      )}
      <div
        className='max-h-64 overflow-y-auto rounded-md border'
        aria-label='收件人搜索结果'
        aria-busy={loading || busy}
      >
        {query.isError && !query.data ? (
          <div className='space-y-2 p-3 text-sm'>
            <p>用户列表加载失败</p>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => {
                void query.refetch()
              }}
            >
              重试
            </Button>
          </div>
        ) : loading ? (
          <p className='text-muted-foreground p-3 text-sm'>正在加载用户…</p>
        ) : !users.length ? (
          <p className='text-muted-foreground p-3 text-sm'>没有匹配的用户</p>
        ) : (
          users.map((user) => (
            <label
              key={user.id}
              className={`hover:bg-muted/50 flex min-w-0 items-center gap-3 border-b p-3 last:border-0 ${canReceive(user) ? 'cursor-pointer' : 'opacity-60'}`}
            >
              <Checkbox
                aria-label={`选择 ${user.username} (#${user.id})`}
                checked={selected.has(user.id)}
                disabled={busy || !canReceive(user)}
                onCheckedChange={(checked) =>
                  update(
                    checked
                      ? [...value, user.id]
                      : value.filter((id) => id !== user.id)
                  )
                }
              />
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-sm'>{label(user)}</span>
                <span className='text-muted-foreground block truncate text-xs'>
                  {user.email || '未绑定邮箱'}
                </span>
              </span>
              {user.status !== 1 && <Badge variant='outline'>账号已停用</Badge>}
            </label>
          ))
        )}
      </div>
      {pages > 1 && (
        <div className='flex items-center justify-between gap-2'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={busy || updating || search.page <= 1}
            onClick={() =>
              setSearch((previous) => ({
                ...previous,
                page: previous.page - 1,
              }))
            }
          >
            上一页
          </Button>
          <span className='text-muted-foreground text-xs'>
            第 {search.page} / {pages} 页
          </span>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={busy || updating || search.page >= pages}
            onClick={() =>
              setSearch((previous) => ({
                ...previous,
                page: previous.page + 1,
              }))
            }
          >
            下一页
          </Button>
        </div>
      )}
      {value.length > 0 && (
        <div className='flex flex-wrap gap-1.5' aria-label='已选择的邮件收件人'>
          {value.slice(0, 20).map((id) => (
            <Badge key={id} variant='secondary' className='max-w-full gap-1'>
              <span className='max-w-40 truncate'>
                {known[id]
                  ? known[id].display_name || known[id].username
                  : `用户 #${id}`}
              </span>
              <button
                type='button'
                className='px-1'
                aria-label={`移除收件人 ${id}`}
                disabled={busy}
                onClick={() => update(value.filter((value) => value !== id))}
              >
                ×
              </button>
            </Badge>
          ))}
          {value.length > 20 && (
            <span className='text-muted-foreground text-xs'>
              另有 {value.length - 20} 人，可搜索后取消勾选
            </span>
          )}
        </div>
      )}
      <p className='text-muted-foreground text-xs'>
        可连续勾选多人，搜索或翻页会保留已选用户；保存草稿后才确定收件人名单。
      </p>
    </div>
  )
}
