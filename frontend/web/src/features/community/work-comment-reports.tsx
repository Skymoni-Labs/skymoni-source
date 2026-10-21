import { Link } from '@tanstack/react-router'
import { MessageCircle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'

import type { WorkCommentReport } from './types'

export function WorkCommentReports(props: {
  reports: WorkCommentReport[]
  pending: boolean
  onUpdate: (operation: { path: string; data: Record<string, unknown> }) => void
}) {
  const [filter, setFilter] = useState('open')
  const [removing, setRemoving] = useState<WorkCommentReport | null>(null)
  const shown = props.reports.filter(
    (report) => filter === 'all' || report.state === filter
  )
  return (
    <section className='sf-work-report-panel' aria-label='作品评论举报'>
      <header>
        <div>
          <h2>
            <MessageCircle />
            作品评论举报
          </h2>
          <p>仅管理作品详情中的评论，不影响作品本身的分类和上架状态。</p>
        </div>
        <NativeSelect
          aria-label='作品评论举报状态'
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value='open'>待处理</option>
          <option value='resolved'>已处理</option>
          <option value='all'>全部</option>
        </NativeSelect>
      </header>
      {shown.map((report) => (
        <article key={report.id} className='sf-report-card'>
          <div>
            <Link
              to='/creators/works/$workId'
              params={{ workId: report.workId }}
            >
              {report.title}
            </Link>
            <span className='sf-status-badge'>
              {report.state === 'open' ? '待处理' : '已处理'}
            </span>
          </div>
          <p>
            作品评论 · 举报人：{report.reporter} · 原因：{report.reason}
          </p>
          <blockquote>
            {report.deleted ? '这条评论已删除。' : report.content}
          </blockquote>
          {report.state === 'open' && (
            <div className='sf-report-actions'>
              <Button
                size='sm'
                variant='outline'
                disabled={props.pending}
                onClick={() =>
                  props.onUpdate({
                    path: `/admin/work-reports/${report.id}`,
                    data: {},
                  })
                }
              >
                标记评论举报已处理
              </Button>
              {!report.deleted && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={props.pending}
                  onClick={() => setRemoving(report)}
                >
                  移除违规评论
                </Button>
              )}
            </div>
          )}
        </article>
      ))}
      {!shown.length && (
        <div className='sf-state'>
          <ShieldCheck />
          <h3>没有符合条件的作品评论举报</h3>
          <p>作品评论和论坛话题的举报分别管理。</p>
        </div>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title='移除这条作品评论？'
        desc='评论将保留删除标记，作品和其他评论不受影响。'
        confirmText='移除评论'
        destructive
        isLoading={props.pending}
        handleConfirm={() => {
          if (removing) {
            props.onUpdate({
              path: `/admin/work-reports/${removing.id}`,
              data: { remove: true, revision: removing.revision },
            })
            setRemoving(null)
          }
        }}
      />
    </section>
  )
}
