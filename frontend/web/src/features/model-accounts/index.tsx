import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Layers3,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { getChannel } from '@/features/channels/api'
import { ChannelsProvider } from '@/features/channels/components/channels-provider'
import { ChannelMutateDrawer } from '@/features/channels/components/drawers/channel-mutate-drawer'
import { channelsQueryKeys } from '@/features/channels/lib'
import type { Channel } from '@/features/channels/types'
import { UpstreamWalletCredential } from '@/features/dashboard/components/overview/upstream-wallet-credential'
import {
  getServerErrorMessage,
  requireServerSuccess,
} from '@/lib/server-error-message'

import {
  affectedModels,
  balanceLabel,
  getModelAccounts,
  parsePriority,
  orderedAccounts,
  priorityLabel,
  saveAccountPriority,
  type ModelAccount,
} from './api'

type Selection = { model: string; account: ModelAccount }
const queryKey = ['model-accounts']

export function ModelAccounts() {
  return (
    <ChannelsProvider>
      <ModelAccountsContent />
    </ChannelsProvider>
  )
}

export function ModelAccountsContent() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey,
    queryFn: getModelAccounts,
    staleTime: 15_000,
  })
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [editing, setEditing] = useState<Selection | null>(null)
  const [priority, setPriority] = useState('')
  const [saveError, setSaveError] = useState('')
  const [channel, setChannel] = useState<Channel | null>(null)
  const [loadingChannel, setLoadingChannel] = useState<number | null>(null)
  const models = (query.data ?? [])
    .filter((item) => item.accounts.some((account) => account.id > 0))
    .map((item) => ({
      ...item,
      accounts: orderedAccounts(item.accounts),
    }))
  const term = search.trim().toLowerCase()
  const filtered = models.filter((item) =>
    `${item.model} ${item.accounts.map((a) => `${a.name} ${a.provider} ${a.channels.map((c) => c.upstream_model).join(' ')}`).join(' ')}`
      .toLowerCase()
      .includes(term)
  )
  const current =
    selection &&
    models
      .find((m) => m.model === selection.model)
      ?.accounts.find((a) => a.id === selection.account.id)
  const detail =
    current && selection ? { model: selection.model, account: current } : null
  const nextPriority = parsePriority(priority)
  const otherModels = editing
    ? affectedModels(editing.model, editing.account)
    : []
  const mutation = useMutation({
    mutationFn: saveAccountPriority,
    onSuccess: async (result) => {
      toast.success(`已更新 ${result.updated} 条渠道的优先级`)
      setEditing(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: channelsQueryKeys.all }),
      ])
    },
    onError: (error) => {
      setSaveError(getServerErrorMessage(error, '保存失败，请刷新后重试'))
    },
  })

  const editPriority = (value: Selection) => {
    setPriority(
      new Set(value.account.channels.map((c) => c.priority)).size === 1
        ? String(value.account.channels[0].priority)
        : ''
    )
    setSaveError('')
    setEditing(value)
  }
  const openChannel = async (id: number) => {
    setLoadingChannel(id)
    try {
      const result = requireServerSuccess(await getChannel(id))
      if (!result.data) throw new Error('渠道不存在或已删除')
      setChannel(result.data)
    } catch (error) {
      toast.error(getServerErrorMessage(error, '读取渠道详情失败'))
    } finally {
      setLoadingChannel(null)
    }
  }

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>模型账户与优先级</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            variant='outline'
            size='sm'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
            刷新
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-5'>
            <p className='text-muted-foreground text-sm'>
              查看每个模型连接的上游账户、实际模型和渠道，按账户统一设置优先级。数值越大越优先，同级按渠道权重分流。
            </p>
            <div className='relative max-w-xl'>
              <Search className='text-muted-foreground absolute top-2.5 left-3 size-4' />
              <Input
                className='pl-9'
                aria-label='搜索模型或账户'
                placeholder='搜索模型、账户或实际上游模型…'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className='text-muted-foreground text-xs'>
              <p className='mb-2'>
                默认按优先级从高到低排列 · 余额为上游钱包账本估算
              </p>
              共 {models.length} 个模型 ·{' '}
              {
                new Set(
                  models.flatMap((m) =>
                    m.accounts.filter((a) => a.id > 0).map((a) => a.id)
                  )
                ).size
              }{' '}
              个账户
            </div>
            {query.isPending && (
              <p
                role='status'
                className='text-muted-foreground py-12 text-center'
              >
                正在读取模型账户…
              </p>
            )}
            {query.isError && (
              <div role='alert' className='space-y-3 rounded-xl border p-6'>
                <p>{getServerErrorMessage(query.error, '读取失败，请重试')}</p>
                <Button variant='outline' onClick={() => void query.refetch()}>
                  重新加载
                </Button>
              </div>
            )}
            {!query.isPending && !query.isError && filtered.length === 0 && (
              <p className='text-muted-foreground rounded-xl border border-dashed p-12 text-center'>
                {term ? '没有找到匹配的模型或账户' : '暂无已配置的模型渠道'}
              </p>
            )}
            <div className='space-y-3'>
              {filtered.map((item) => {
                const open =
                  expanded === item.model ||
                  (expanded === null && filtered.length === 1)
                return (
                  <section
                    key={item.model}
                    className='overflow-hidden rounded-xl border'
                  >
                    <button
                      type='button'
                      className='hover:bg-muted/40 flex w-full items-center gap-3 p-4 text-left'
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? '' : item.model)}
                    >
                      <Layers3 className='text-primary size-5 shrink-0' />
                      <span className='min-w-0 flex-1'>
                        <span className='block font-semibold break-all'>
                          {item.model}
                        </span>
                        <span className='text-muted-foreground text-xs'>
                          {item.accounts.filter((a) => a.id > 0).length} 个账户
                          · {item.enabled} / {item.channels} 条渠道启用
                        </span>
                      </span>
                      {open ? (
                        <ChevronDown className='size-4 shrink-0' />
                      ) : (
                        <ChevronRight className='size-4 shrink-0' />
                      )}
                    </button>
                    {open && (
                      <div className='divide-y border-t'>
                        {item.accounts.map((account) => (
                          <div
                            key={account.id}
                            className='flex flex-wrap items-center gap-3 p-4'
                          >
                            <button
                              type='button'
                              className='group min-w-0 flex-1 text-left'
                              onClick={() =>
                                setSelection({ model: item.model, account })
                              }
                            >
                              <span className='group-hover:text-primary flex flex-wrap items-center gap-2 font-medium'>
                                <span className='break-all'>
                                  {account.name}
                                </span>
                                {account.id > 0 && (
                                  <Badge
                                    variant='outline'
                                    className='max-w-full font-normal break-all whitespace-normal tabular-nums'
                                    title={
                                      account.pending > 0
                                        ? `上游钱包账本余额，${account.pending} 笔请求待核算`
                                        : '上游钱包账本余额'
                                    }
                                  >
                                    {balanceLabel(account)}
                                  </Badge>
                                )}
                                <ChevronRight className='size-4 shrink-0' />
                              </span>
                              <span className='text-muted-foreground mt-1 block text-xs break-all'>
                                {account.provider || '无账户绑定'} ·{' '}
                                {account.enabled} 启用 /{' '}
                                {account.channels.length - account.enabled} 停用
                                · 实际{' '}
                                {[
                                  ...new Set(
                                    account.channels.map(
                                      (c) => c.upstream_model
                                    )
                                  ),
                                ].join('、')}
                              </span>
                            </button>
                            <div className='flex max-w-full flex-wrap items-center gap-2'>
                              <Badge
                                variant='outline'
                                className='max-w-full break-all whitespace-normal'
                              >
                                优先级 {priorityLabel(account)}
                              </Badge>
                              <Button
                                variant='outline'
                                size='sm'
                                disabled={account.id === 0}
                                onClick={() =>
                                  editPriority({ model: item.model, account })
                                }
                              >
                                <SlidersHorizontal />
                                调优先级
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <Sheet
        open={!!detail}
        onOpenChange={(open) => !open && setSelection(null)}
      >
        <SheetContent className='w-full overflow-y-auto sm:max-w-2xl'>
          <SheetHeader>
            <SheetTitle className='break-all'>
              {detail?.account.name}
            </SheetTitle>
            <SheetDescription className='break-all'>
              {detail?.model} · 共 {detail?.account.channels.length} 条渠道
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div className='space-y-4 p-4'>
              {detail.account.id > 0 && (
                <p className='text-muted-foreground text-xs'>
                  账户 #{detail.account.id} · {detail.account.provider}
                  <span className='ml-2'>{balanceLabel(detail.account)}</span>
                </p>
              )}
              {detail.account.id > 0 && (
                <UpstreamWalletCredential
                  key={detail.account.id}
                  walletID={detail.account.id}
                  title='上游网址与账号密码'
                />
              )}
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <span className='text-muted-foreground text-sm'>
                  优先级 {priorityLabel(detail.account)}
                </span>
                <Button
                  variant='outline'
                  disabled={detail.account.id === 0}
                  onClick={() => editPriority(detail)}
                >
                  <SlidersHorizontal />
                  统一调整优先级
                </Button>
              </div>
              {detail.account.id === 0 && (
                <p className='text-muted-foreground text-sm'>
                  这些渠道未绑定上游账户，可分别打开渠道设置查看。
                </p>
              )}
              {detail.account.channels.map((c) => (
                <div key={c.id} className='space-y-3 rounded-xl border p-4'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='font-medium break-all'>
                        #{c.id} · {c.name}
                      </p>
                      <p className='text-muted-foreground mt-1 text-xs break-all'>
                        实际模型 {c.upstream_model}
                      </p>
                    </div>
                    <Badge variant={c.status === 1 ? 'secondary' : 'outline'}>
                      {{ 1: '启用', 3: '自动停用' }[c.status] ?? '已停用'}
                    </Badge>
                  </div>
                  <p className='text-muted-foreground text-xs break-all'>
                    优先级 {c.priority} · 权重 {c.weight} · 分组{' '}
                    {c.groups.join('、')}
                  </p>
                  {c.models.length > 1 && (
                    <p className='text-muted-foreground text-xs break-all'>
                      同时接入{' '}
                      {c.models.filter((m) => m !== detail.model).join('、')}
                    </p>
                  )}
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={loadingChannel !== null}
                    onClick={() => void openChannel(c.id)}
                  >
                    {loadingChannel === c.id ? '正在读取…' : '渠道详情与设置'}
                    <ChevronRight />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!editing}
        onOpenChange={(open) =>
          !open && !mutation.isPending && setEditing(null)
        }
      >
        <DialogContent
          showCloseButton={!mutation.isPending}
          className='sm:max-w-lg'
        >
          <DialogHeader>
            <DialogTitle>统一调整优先级</DialogTitle>
            <DialogDescription className='break-all'>
              {editing?.model} · {editing?.account.name}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 text-sm'>
            <p>
              将此账户的全部 <strong>{editing?.account.channels.length}</strong>{' '}
              条渠道设为同一优先级，包含{' '}
              {editing
                ? editing.account.channels.length - editing.account.enabled
                : 0}{' '}
              条已停用渠道。
            </p>
            <p className='text-muted-foreground'>
              当前优先级：{editing && priorityLabel(editing.account)}
              。保存后保留各渠道的启停状态与权重。
            </p>
            <p className='text-muted-foreground max-h-20 overflow-y-auto text-xs break-all'>
              渠道 ID：{editing?.account.channels.map((c) => c.id).join('、')}
            </p>
            {otherModels.length > 0 && (
              <div
                role='note'
                className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300'
              >
                优先级属于整条渠道，以下模型也会一起受到影响：
                <span className='break-all'>{otherModels.join('、')}</span>
              </div>
            )}
            <label className='block space-y-2'>
              <span className='font-medium'>新的优先级</span>
              <Input
                autoFocus
                inputMode='numeric'
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={mutation.isPending}
                placeholder='输入整数，数值越大越优先'
                aria-invalid={priority !== '' && nextPriority === null}
              />
            </label>
            {priority !== '' && nextPriority === null && (
              <p role='alert' className='text-destructive text-xs'>
                请输入 -2147483648 到 2147483647 之间的整数
              </p>
            )}
            {saveError && (
              <p role='alert' className='text-destructive'>
                {saveError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              disabled={mutation.isPending}
              onClick={() => setEditing(null)}
            >
              取消
            </Button>
            <Button
              disabled={nextPriority === null || mutation.isPending}
              onClick={() =>
                editing &&
                nextPriority !== null &&
                mutation.mutate({
                  model: editing.model,
                  account_id: editing.account.id,
                  version: editing.account.version,
                  priority: nextPriority,
                })
              }
            >
              {mutation.isPending
                ? '正在保存…'
                : `确认更新 ${editing?.account.channels.length ?? 0} 条渠道`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChannelMutateDrawer
        open={!!channel}
        currentRow={channel}
        onOpenChange={(open) => {
          if (!open) {
            setChannel(null)
            void queryClient.invalidateQueries({ queryKey })
          }
        }}
      />
    </>
  )
}
