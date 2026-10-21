import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  CheckCheck,
  EyeOff,
  Search,
  ShieldCheck,
  Flag,
  ArrowUpRight,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { CommunityAccessManagement } from './access-policy'
import { communityRequest, loadCommunityAdmin } from './api'
import { CommunityCategoryManagement } from './category-management'
import { CommunityNavigationManagement } from './topic-navigation'
import { WorkCommentReports } from './work-comment-reports'

export function CommunityModeration() {
  const auth = useAuthStore((state) => state.auth)
  const client = useQueryClient()
  const [tab, setTab] = useState<'open' | 'resolved' | 'hidden'>('open')
  const [search, setSearch] = useState('')
  const key = ['community-admin', auth.user?.id, auth.session?.sid]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadCommunityAdmin(signal),
    enabled: auth.user?.role === 100,
    retry: false,
  })
  const update = useMutation({
    mutationFn: (operation: { path: string; data: Record<string, unknown> }) =>
      communityRequest(operation.path, { method: 'put', data: operation.data }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key })
      void client.invalidateQueries({ queryKey: ['community-topics'] })
      void client.invalidateQueries({ queryKey: ['community-topic'] })
      void client.invalidateQueries({ queryKey: ['work-comments'] })
      toast.success('处理结果已保存')
    },
    onError: (error) => handleServerError(error),
  })
  if (auth.user?.role !== 100) {
    return (
      <div className='sf-state' role='alert'>
        <ShieldCheck />
        <h1>需要管理员权限</h1>
        <p>社区管理仅向管理员开放。</p>
        <Button variant='outline' render={<Link to='/creators' />}>
          返回社区
        </Button>
      </div>
    )
  }
  const reports = query.data?.reports ?? []
  const hidden = query.data?.hidden ?? []
  const term = search.trim().toLocaleLowerCase()
  const shown = reports.filter(
    (report) =>
      (tab === 'open' ? report.state === 'open' : report.state !== 'open') &&
      [report.title, report.reporter, report.reason]
        .join(' ')
        .toLocaleLowerCase()
        .includes(term)
  )
  const emptyTitle = term
    ? '没有匹配的内容'
    : {
        open: '当前没有待处理举报',
        resolved: '还没有已处理的举报',
        hidden: '没有隐藏的话题',
      }[tab]
  const hiddenShown = hidden.filter((topic) =>
    topic.title.toLocaleLowerCase().includes(term)
  )
  return (
    <main className='sf-moderation-page'>
      <header className='sf-admin-heading'>
        <div>
          <span className='sf-rail-kicker'>COMMUNITY CARE</span>
          <h1>社区管理</h1>
          <p>认真对待每一份反馈，一起维护友善、有价值的讨论。</p>
        </div>
        <Button variant='outline' render={<Link to='/creators/manage' />}>
          作品审核与展示管理 <ArrowUpRight />
        </Button>
      </header>
      <CommunityAccessManagement />
      <CommunityNavigationManagement />
      <CommunityCategoryManagement />
      <div className='sf-admin-stats'>
        {[
          {
            icon: Flag,
            label: '待处理话题举报',
            count: reports.filter((item) => item.state === 'open').length,
          },
          {
            icon: CheckCheck,
            label: '已处理话题举报',
            count: reports.filter((item) => item.state !== 'open').length,
          },
          { icon: EyeOff, label: '已隐藏话题', count: hidden.length },
        ].map((item) => (
          <div key={item.label}>
            <item.icon />
            <span>{item.label}</span>
            <strong>{query.data ? item.count : '—'}</strong>
          </div>
        ))}
      </div>
      <h2 className='sf-admin-section-title'>论坛话题管理</h2>
      <div className='sf-admin-toolbar'>
        <nav aria-label='管理内容'>
          <button
            type='button'
            aria-pressed={tab === 'open'}
            onClick={() => setTab('open')}
          >
            待处理
          </button>
          <button
            type='button'
            aria-pressed={tab === 'resolved'}
            onClick={() => setTab('resolved')}
          >
            已处理
          </button>
          <button
            type='button'
            aria-pressed={tab === 'hidden'}
            onClick={() => setTab('hidden')}
          >
            隐藏话题
          </button>
        </nav>
        <label>
          <Search />
          <Input
            aria-label='搜索管理内容'
            placeholder='搜索标题、举报人或原因'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {query.isPending && (
        <p className='sf-loading' role='status'>
          正在加载管理数据…
        </p>
      )}
      {query.isError && (
        <div role='alert' className='sf-inline-error'>
          管理数据暂不可用。
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
      {query.data && (
        <section aria-label={tab === 'hidden' ? '隐藏话题' : '话题内容举报'}>
          {tab === 'hidden'
            ? hiddenShown.map((topic) => (
                <article key={topic.id} className='sf-report-card'>
                  <div>
                    <Link
                      to='/creators/topics/$topicId'
                      params={{ topicId: topic.id }}
                    >
                      {topic.title}
                    </Link>
                    <span className='sf-status-badge'>已隐藏</span>
                  </div>
                  <p>隐藏内容仅对管理员可见，恢复后将重新公开。</p>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        path: `/topics/${topic.id}/moderation`,
                        data: { revision: topic.revision, hidden: false },
                      })
                    }
                  >
                    恢复公开
                  </Button>
                </article>
              ))
            : shown.map((report) => (
                <article key={report.id} className='sf-report-card'>
                  <div>
                    <Link
                      to='/creators/topics/$topicId'
                      params={{ topicId: report.topicId }}
                    >
                      {report.title}
                    </Link>
                    <span className='sf-status-badge'>
                      {report.state === 'open' ? '待处理' : '已处理'}
                    </span>
                  </div>
                  <p>
                    举报人：{report.reporter} · 原因：{report.reason}
                  </p>
                  <blockquote>{report.content}</blockquote>
                  {report.state === 'open' && (
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({
                          path: `/admin/reports/${report.id}`,
                          data: {},
                        })
                      }
                    >
                      标记已处理
                    </Button>
                  )}
                </article>
              ))}
          {(tab === 'hidden' ? !hiddenShown.length : !shown.length) && (
            <div className='sf-state sf-admin-empty'>
              <ShieldCheck />
              <h2>{emptyTitle}</h2>
              <p>
                {term
                  ? '试试其他关键词，或清空搜索条件。'
                  : '所有处理结果会保留在这里，方便后续查看。'}
              </p>
              {term && (
                <Button variant='outline' onClick={() => setSearch('')}>
                  清空搜索
                </Button>
              )}
            </div>
          )}
        </section>
      )}
      {query.data && (
        <WorkCommentReports
          reports={query.data.workReports ?? []}
          pending={update.isPending}
          onUpdate={(operation) => update.mutate(operation)}
        />
      )}
    </main>
  )
}
