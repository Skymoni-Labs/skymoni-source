import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Link2,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { communityRequest, loadCommunityMeta } from './api'
import type {
  Topic,
  TopicNavigationCatalog,
  TopicNavigationItem,
} from './types'

type Operation = {
  path: string
  method: 'post' | 'put'
  data: Record<string, unknown>
}

function useNavigationCatalog() {
  const auth = useAuthStore((state) => state.auth)
  return useQuery({
    queryKey: ['community-navigation-admin', auth.user?.id, auth.session?.sid],
    queryFn: ({ signal }) =>
      communityRequest<TopicNavigationCatalog>('/admin/navigation', { signal }),
    enabled: auth.user?.role === 100,
    retry: false,
  })
}

function useSaveNavigation(onSaved?: () => void) {
  const auth = useAuthStore((state) => state.auth)
  const client = useQueryClient()
  return useMutation({
    mutationFn: (op: Operation) =>
      communityRequest<TopicNavigationCatalog>(op.path, {
        method: op.method,
        data: op.data,
      }),
    onSuccess: (result) => {
      client.setQueryData(
        ['community-navigation-admin', auth.user?.id, auth.session?.sid],
        result
      )
      void client.invalidateQueries({ queryKey: ['community-meta'] })
      toast.success('顶部导航已更新')
      onSaved?.()
    },
    onError: (error) => {
      handleServerError(error)
      void client.invalidateQueries({
        queryKey: [
          'community-navigation-admin',
          auth.user?.id,
          auth.session?.sid,
        ],
      })
    },
  })
}

export function CommunityTopicLinks() {
  const location = useRouterState({ select: (state) => state.location })
  const user = useAuthStore((state) => state.auth.user)
  const meta = useQuery({
    queryKey: ['community-meta'],
    queryFn: ({ signal }) => loadCommunityMeta(signal),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  })
  return (
    <>
      {meta.data?.navigation?.map((item) => (
        <Link
          key={item.id}
          to='/creators'
          search={{ category: item.categoryId }}
          className='sf-topic-module-link'
          title={item.title}
          aria-current={
            location.pathname.replace(/\/$/, '') === '/creators' &&
            (location.search as { category?: string }).category ===
              item.categoryId
              ? 'page'
              : undefined
          }
        >
          <BookOpen aria-hidden />
          <span>{item.label}</span>
        </Link>
      ))}
      {user?.role === 100 && (
        <Link
          to='/creators/moderation'
          hash='community-navigation'
          className='sf-navigation-manage-link'
          aria-label='管理顶部导航'
        >
          <Settings2 aria-hidden />
          <span>管理导航</span>
        </Link>
      )}
    </>
  )
}

function NavigationDialog(props: {
  catalog: TopicNavigationCatalog
  item?: TopicNavigationItem
  initialCategory?: string
  onClose: () => void
}) {
  const query = useNavigationCatalog()
  const [revision, setRevision] = useState(props.catalog.revision)
  const [category, setCategory] = useState(
    props.item?.categoryId ?? props.initialCategory ?? ''
  )
  const [label, setLabel] = useState(props.item?.label ?? '')
  const [customLabel, setCustomLabel] = useState(!!props.item)
  const meta = useQuery({
    queryKey: ['community-meta'],
    queryFn: ({ signal }) => loadCommunityMeta(signal),
    staleTime: 60000,
  })
  const mutation = useSaveNavigation(props.onClose)
  const selected = meta.data?.categories.find((item) => item.id === category)
  const displayLabel = customLabel ? label : (selected?.name ?? '')
  const busy = mutation.isPending
  return (
    <Dialog
      open
      title={props.item ? '编辑导航显示名' : '添加分类到顶部导航'}
      description='选择话题分类，单独设置顶部显示名。空分类也可以添加。'
      onOpenChange={(open) => {
        if (!open && !busy) props.onClose()
      }}
      showCloseButton={!busy}
      contentClassName='sf-navigation-dialog'
      footer={
        <>
          <Button variant='outline' disabled={busy} onClick={props.onClose}>
            取消
          </Button>
          <Button
            className='sf-primary'
            type='submit'
            form='topic-navigation-form'
            disabled={busy || !selected || !displayLabel.trim()}
          >
            {busy ? '正在保存…' : '保存导航入口'}
          </Button>
        </>
      }
    >
      <form
        id='topic-navigation-form'
        className='sf-navigation-form'
        onSubmit={(event) => {
          event.preventDefault()
          if (!selected || busy) return
          mutation.mutate({
            path: props.item
              ? `/admin/navigation/${props.item.id}`
              : '/admin/navigation',
            method: props.item ? 'put' : 'post',
            data: {
              categoryId: category,
              label: displayLabel.trim(),
              revision,
            },
          })
        }}
      >
        <Label htmlFor='navigation-category'>话题分类</Label>
        <NativeSelect
          id='navigation-category'
          value={category}
          disabled={busy || !!props.item || meta.isPending}
          onChange={(event) => setCategory(event.target.value)}
          required
        >
          <option value=''>请选择话题分类</option>
          {meta.data?.categories.map((item) => (
            <option
              key={item.id}
              value={item.id}
              disabled={
                !props.item &&
                props.catalog.items.some((link) => link.categoryId === item.id)
              }
            >
              {item.name}
              {!props.item &&
              props.catalog.items.some((link) => link.categoryId === item.id)
                ? '（已添加）'
                : ''}
            </option>
          ))}
        </NativeSelect>
        {meta.isPending && <p role='status'>正在加载分类…</p>}
        {meta.isError && (
          <p role='alert'>
            分类加载失败。
            <Button
              type='button'
              variant='ghost'
              onClick={() => void meta.refetch()}
            >
              重试
            </Button>
          </p>
        )}
        <Label htmlFor='navigation-display-name'>导航显示名</Label>
        <Input
          id='navigation-display-name'
          value={displayLabel}
          maxLength={24}
          required
          disabled={busy}
          onChange={(event) => {
            setLabel(event.target.value)
            setCustomLabel(true)
          }}
          placeholder='例如：使用教程、资源合集'
        />
        <p className='sf-navigation-hint'>
          最多 24 个字符。点击入口将打开该分类的话题列表，不会修改分类原名。
        </p>
        {mutation.isError && (
          <div className='sf-navigation-save-error' role='alert'>
            <p>
              保存未完成，填写的内容已保留。如果导航配置有变化，请刷新配置后重试。
            </p>
            <Button
              type='button'
              variant='outline'
              disabled={query.isFetching || busy}
              onClick={async () => {
                const result = await query.refetch()
                if (result.data) {
                  setRevision(result.data.revision)
                  mutation.reset()
                }
              }}
            >
              刷新配置，保留填写
            </Button>
          </div>
        )}
      </form>
    </Dialog>
  )
}

export function TopicNavigationButton({ topic }: { topic: Topic }) {
  const auth = useAuthStore((state) => state.auth)
  return auth.user?.role === 100 && !topic.hidden && !topic.deleted ? (
    <TopicNavigationControl
      key={`${auth.user.id}:${auth.session?.sid}:${topic.id}`}
      topic={topic}
    />
  ) : null
}

function TopicNavigationControl({ topic }: { topic: Topic }) {
  const query = useNavigationCatalog()
  const [open, setOpen] = useState(false)
  const item = query.data?.items.find(
    (link) => link.categoryId === topic.category
  )
  let buttonLabel = item ? '编辑导航显示名' : '将此分类加入导航'
  if (query.isError) buttonLabel = '重试加载导航'
  return (
    <>
      <Button
        variant='outline'
        size='sm'
        className='sf-topic-navigation-button'
        disabled={query.isPending}
        onClick={() => {
          if (query.data) setOpen(true)
          else void query.refetch()
        }}
      >
        <Link2 />
        {buttonLabel}
      </Button>
      {open && query.data && (
        <NavigationDialog
          catalog={query.data}
          item={item}
          initialCategory={topic.category}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

export function CommunityNavigationManagement() {
  const auth = useAuthStore((state) => state.auth)
  return auth.user?.role === 100 ? (
    <NavigationManager key={`${auth.user.id}:${auth.session?.sid}`} />
  ) : null
}

function NavigationManager() {
  const query = useNavigationCatalog()
  const [draft, setDraft] = useState<TopicNavigationItem | null | undefined>(
    undefined
  )
  const [removing, setRemoving] = useState<{
    item: TopicNavigationItem
    revision: string
  } | null>(null)
  const mutation = useSaveNavigation(() => setRemoving(null))
  const items = query.data?.items ?? []
  function move(index: number, offset: number) {
    if (!query.data) return
    const ids = items.map((item) => item.id),
      target = index + offset
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    mutation.mutate({
      path: '/admin/navigation/order',
      method: 'put',
      data: { ids, revision: query.data.revision },
    })
  }
  return (
    <section
      className='sf-navigation-manager'
      id='community-navigation'
      aria-labelledby='community-navigation-title'
    >
      <div className='sf-category-manager-heading'>
        <div>
          <h2 id='community-navigation-title'>
            <Link2 />
            顶部分类导航
          </h2>
          <p>把常用话题分类放到顶部模块栏，导航显示名可单独编辑。</p>
        </div>
        <Button
          className='sf-primary'
          disabled={!query.data || mutation.isPending || items.length >= 12}
          onClick={() => setDraft(null)}
        >
          <Plus />
          添加分类入口
        </Button>
      </div>
      <p className='sf-navigation-hint'>
        固定的三个模块保留，最多增加 12
        个分类入口。入口始终展示该分类下的最新公开话题，空分类也可添加。
      </p>
      {query.isPending && <p role='status'>正在加载导航配置…</p>}
      {query.isError && (
        <div className='sf-state' role='alert'>
          <p>导航配置暂时无法加载。</p>
          <Button variant='outline' onClick={() => void query.refetch()}>
            重试加载导航
          </Button>
        </div>
      )}
      {query.data && !items.length && (
        <div className='sf-navigation-empty'>
          <BookOpen />
          <strong>把常用分类放到大家看得见的地方</strong>
          <p>选择一个分类，再为它设置顶部显示名，例如“skill 分享”。</p>
        </div>
      )}
      <div className='sf-navigation-items'>
        {items.map((item, index) => (
          <article key={item.id} className='sf-navigation-item'>
            <div>
              <strong>{item.label}</strong>
              <p>话题分类：{item.title}</p>
              {!item.available && (
                <span className='sf-navigation-unavailable'>分类暂不可用</span>
              )}
            </div>
            <div className='sf-navigation-item-actions'>
              <Button
                variant='ghost'
                size='icon'
                aria-label={`上移 ${item.label}`}
                disabled={!index || mutation.isPending}
                onClick={() => move(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant='ghost'
                size='icon'
                aria-label={`下移 ${item.label}`}
                disabled={index === items.length - 1 || mutation.isPending}
                onClick={() => move(index, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={mutation.isPending}
                onClick={() => setDraft(item)}
              >
                <Pencil />
                编辑显示名
              </Button>
              <Button
                variant='ghost'
                size='sm'
                disabled={mutation.isPending}
                onClick={() => {
                  if (query.data) {
                    setRemoving({ item, revision: query.data.revision })
                  }
                }}
              >
                <Trash2 />
                移除入口
              </Button>
            </div>
          </article>
        ))}
      </div>
      {draft !== undefined && query.data && (
        <NavigationDialog
          catalog={query.data}
          item={draft ?? undefined}
          onClose={() => setDraft(undefined)}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setRemoving(null)
        }}
        title='移除导航入口'
        desc={`移除“${removing?.item.label ?? ''}”的顶部入口。分类、话题和回复都会保留。`}
        confirmText='移除入口'
        destructive
        isLoading={mutation.isPending}
        handleConfirm={() => {
          if (removing) {
            mutation.mutate({
              path: `/admin/navigation/${removing.item.id}`,
              method: 'put',
              data: { remove: true, revision: removing.revision },
            })
          }
        }}
      />
    </section>
  )
}
