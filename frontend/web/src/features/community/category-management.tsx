import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Pencil, Plus, Tags } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { communityRequest } from './api'
import type { CommunityCategory } from './types'

type CategoryCatalog = { categories: CommunityCategory[]; revision: string }
type Draft = {
  id?: string
  name: string
  description: string
  color: string
  revision: string
}

export function CommunityCategoryManagement() {
  const auth = useAuthStore((state) => state.auth)
  return auth.user?.role === 100 ? (
    <CategoryManager key={`${auth.user.id}:${auth.session?.sid}`} />
  ) : null
}

function CategoryManager() {
  const client = useQueryClient()
  const auth = useAuthStore((state) => state.auth)
  const key = ['community-categories-admin', auth.user?.id, auth.session?.sid]
  const [draft, setDraft] = useState<Draft | null>(null)
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      communityRequest<CategoryCatalog>('/admin/categories', { signal }),
    retry: false,
  })
  const mutation = useMutation({
    mutationFn: (op: {
      path: string
      method: 'post' | 'put'
      data: Record<string, unknown>
      close?: boolean
    }) =>
      communityRequest<CategoryCatalog>(op.path, {
        method: op.method,
        data: op.data,
      }),
    onSuccess: (result, op) => {
      client.setQueryData(key, result)
      void client.invalidateQueries({ queryKey: ['community-meta'] })
      if (op.close) setDraft(null)
      toast.success(op.close ? '社区分类已保存' : '分类顺序已更新')
    },
    onError: (error) => {
      handleServerError(error)
      // Refresh the list without replacing a pending edit or silently retrying it.
      void client.invalidateQueries({ queryKey: key })
    },
  })
  const categories = query.data?.categories ?? []
  function move(index: number, offset: number) {
    if (!query.data) return
    const ids = categories.map((category) => category.id)
    const target = index + offset
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    mutation.mutate({
      path: '/admin/categories/order',
      method: 'put',
      data: { ids, revision: query.data.revision },
    })
  }
  return (
    <section
      className='sf-category-manager'
      id='community-categories'
      aria-labelledby='community-categories-title'
    >
      <div className='sf-category-manager-heading'>
        <div>
          <h2 id='community-categories-title'>
            <Tags />
            社区分类管理
          </h2>
          <p>设置话题分类，在侧边栏、分类筛选和发帖时同步使用。</p>
        </div>
        <Button
          className='sf-primary'
          disabled={!query.data || mutation.isPending}
          onClick={() => {
            if (query.data) {
              mutation.reset()
              setDraft({
                name: '',
                description: '',
                color: '#4a9ed7',
                revision: query.data.revision,
              })
            }
          }}
        >
          <Plus />
          添加分类
        </Button>
      </div>
      {query.isPending && (
        <p role='status' className='sf-loading'>
          正在加载社区分类…
        </p>
      )}
      {query.isError && (
        <div role='alert' className='sf-inline-error'>
          分类暂时无法加载。
          <Button
            variant='ghost'
            onClick={() => {
              void query.refetch()
            }}
          >
            重试
          </Button>
        </div>
      )}
      <div className='sf-category-management-list'>
        {categories.map((category, index) => (
          <div className='sf-category-management-row' key={category.id}>
            <i
              className='sf-category-dot'
              style={{ backgroundColor: category.color }}
            />
            <div className='sf-category-management-copy'>
              <strong>{category.name}</strong>
              {category.adminOnly && (
                <span className='sf-category-admin-badge'>仅管理员发帖</span>
              )}
              <p>{category.description || '暂未填写分类说明'}</p>
            </div>
            <div className='sf-category-management-actions'>
              <Button
                variant='ghost'
                size='icon'
                aria-label={`上移 ${category.name}`}
                disabled={index === 0 || mutation.isPending}
                onClick={() => move(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant='ghost'
                size='icon'
                aria-label={`下移 ${category.name}`}
                disabled={index === categories.length - 1 || mutation.isPending}
                onClick={() => move(index, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant='outline'
                size='sm'
                aria-label={`编辑 ${category.name}`}
                disabled={mutation.isPending}
                onClick={() =>
                  setDraft({
                    ...category,
                    revision: query.data?.revision ?? '',
                  })
                }
              >
                <Pencil />
                编辑
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDraft(null)
        }}
        title={draft?.id ? '编辑社区分类' : '添加社区分类'}
        description='保存后即可用于话题分类，不会改变作品广场的作品分类。'
      >
        {draft && (
          <form
            className='sf-category-form'
            onSubmit={(event) => {
              event.preventDefault()
              if (mutation.isPending || !draft.name.trim()) return
              mutation.mutate({
                path: draft.id
                  ? `/admin/categories/${encodeURIComponent(draft.id)}`
                  : '/admin/categories',
                method: draft.id ? 'put' : 'post',
                data: {
                  name: draft.name.trim(),
                  description: draft.description.trim(),
                  color: draft.color,
                  revision: draft.revision,
                },
                close: true,
              })
            }}
          >
            <div>
              <Label htmlFor='community-category-name'>分类名称</Label>
              <Input
                id='community-category-name'
                value={draft.name}
                maxLength={24}
                required
                disabled={mutation.isPending}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                placeholder='例如：开源项目、生活分享'
              />
            </div>
            <div>
              <Label htmlFor='community-category-description'>分类说明</Label>
              <Textarea
                id='community-category-description'
                value={draft.description}
                maxLength={180}
                rows={3}
                disabled={mutation.isPending}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                placeholder='介绍这里适合讨论什么（选填）'
              />
            </div>
            <div>
              <Label htmlFor='community-category-color'>分类颜色</Label>
              <div className='sf-category-color-input'>
                <Input
                  id='community-category-color'
                  type='color'
                  value={draft.color}
                  disabled={mutation.isPending}
                  onChange={(event) =>
                    setDraft({ ...draft, color: event.target.value })
                  }
                />
                <span>{draft.color}</span>
                <span className='sf-category-preview'>
                  <i
                    className='sf-category-dot'
                    style={{ backgroundColor: draft.color }}
                  />
                  {draft.name || '分类预览'}
                </span>
              </div>
            </div>
            {mutation.isError && (
              <p role='alert' className='text-destructive'>
                保存失败，你填写的内容已保留。若分类已被其他页面修改，请关闭后重新打开编辑。
              </p>
            )}
            <div className='sf-category-form-footer'>
              <Button
                type='button'
                variant='outline'
                disabled={mutation.isPending}
                onClick={() => setDraft(null)}
              >
                取消
              </Button>
              <Button
                type='submit'
                className='sf-primary'
                disabled={mutation.isPending || !draft.name.trim()}
              >
                {mutation.isPending ? '正在保存…' : '保存分类'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </section>
  )
}
