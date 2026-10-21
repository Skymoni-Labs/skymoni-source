import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Heart,
  MessageCircle,
  Reply,
  Pencil,
  Trash2,
  Flag,
  Send,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { Textarea } from '@/components/ui/textarea'
import {
  CommunityAccessDescription,
  CommunitySignupLabel,
} from '@/features/community/access-copy'
import { communityRequest } from '@/features/community/api'
import { forumMarkdownSanitize } from '@/features/community/markdown'
import {
  CommunityTime,
  MemberAvatar,
  MemberName,
} from '@/features/community/shared'
import type { Post } from '@/features/community/types'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

type WorkComment = Post & { replyToName?: string }
export type WorkCommentListing = {
  workId: string
  title: string
  comments: WorkComment[]
  count: number
  total: number
  page: number
  pageSize: number
}

export function WorkComments({ workId }: { workId: string }) {
  const actor = useAuthStore(
    (state) => `${state.auth.user?.id}:${state.auth.session?.sid}`
  )
  return <WorkCommentsPanel key={`${workId}:${actor}`} workId={workId} />
}

function WorkCommentsPanel({ workId }: { workId: string }) {
  const auth = useAuthStore((state) => state.auth)
  const user = auth.user
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const key = ['work-comments', workId, user?.id, auth.session?.sid, page]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      communityRequest<WorkCommentListing>(
        `/works/${encodeURIComponent(workId)}/comments`,
        { signal, params: { page } }
      ),
    retry: false,
    staleTime: 15000,
  })
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState<WorkComment | null>(null)
  const [preview, setPreview] = useState(false)
  const [editing, setEditing] = useState<WorkComment | null>(null)
  const [editContent, setEditContent] = useState('')
  const [deleting, setDeleting] = useState<WorkComment | null>(null)
  const [reporting, setReporting] = useState<WorkComment | null>(null)
  const [reason, setReason] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['work-comments', workId] })
    void client.invalidateQueries({ queryKey: ['community-notifications'] })
  }
  const update = useMutation({
    mutationFn: (operation: {
      path: string
      method: 'put' | 'post'
      data: Record<string, unknown>
    }) => communityRequest(operation.path, operation),
    onSuccess: refresh,
    onError: (error) => handleServerError(error),
  })
  const publish = useMutation({
    mutationFn: () =>
      communityRequest(`/works/${encodeURIComponent(workId)}/comments`, {
        method: 'post',
        data: { content, replyTo: replyTo?.id },
      }),
    onSuccess: () => {
      setContent('')
      setReplyTo(null)
      setPreview(false)
      setPage(Math.ceil(((query.data?.total ?? 0) + 1) / 30))
      refresh()
      toast.success('评论已发布')
    },
    onError: (error) => handleServerError(error),
  })
  return (
    <section
      className='sf-work-comments'
      id='work-comments'
      aria-label='作品评论'
    >
      <FormNavigationGuard when={!!content.trim()} />
      <header className='sf-work-comments-heading'>
        <div>
          <span className='sf-rail-kicker'>WORK / COMMENTS</span>
          <h2>
            <MessageCircle />
            作品评论 {query.data && <small>{query.data.count}</small>}
          </h2>
          <p>交流这件作品的使用体验、想法和建议。</p>
        </div>
        <span className='sf-status-badge'>作品专属评论区</span>
      </header>
      {query.isPending && (
        <p className='sf-loading' role='status'>
          正在加载作品评论…
        </p>
      )}
      {query.isError && (
        <div className='sf-inline-error' role='alert'>
          作品评论暂时无法加载。
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
      {query.data && !query.data.total && (
        <div className='sf-comments-empty'>
          <MessageCircle />
          <div>
            <strong>还没有评论，来说说你的想法</strong>
            <p>可以提一个具体问题，也可以分享你的使用体验。</p>
          </div>
        </div>
      )}
      {query.data?.comments.map((comment) => (
        <article
          className='sf-post'
          id={`comment-${comment.id}`}
          key={comment.id}
        >
          <div className='sf-post-avatar'>
            <MemberAvatar author={comment.author} />
          </div>
          <div className='sf-post-body'>
            <header>
              <strong>
                <MemberName author={comment.author} />
              </strong>
              <span>@{comment.author.username}</span>
              <span className='sf-post-time'>
                <CommunityTime timestamp={comment.createdAt} />
              </span>
              {comment.editedAt > 0 && !comment.deleted && (
                <small>已编辑</small>
              )}
            </header>
            {comment.replyTo && (
              <p className='sf-reply-context'>
                回复 @{comment.replyToName || '社区成员'}
              </p>
            )}
            {comment.deleted ? (
              <p className='sf-deleted-post'>这条评论已删除。</p>
            ) : (
              <>
                <div className='sf-post-content'>
                  <Markdown sanitizeOptions={forumMarkdownSanitize}>
                    {comment.content}
                  </Markdown>
                </div>
                <div className='sf-post-actions'>
                  <Button
                    variant='ghost'
                    size='sm'
                    aria-pressed={comment.liked}
                    disabled={
                      update.isPending || user?.id === comment.author.id
                    }
                    onClick={() => {
                      if (!user) {
                        toast.info('登录后即可给作品评论点赞')
                        return
                      }
                      update.mutate({
                        path: `/work-comments/${comment.id}/like`,
                        method: 'put',
                        data: { liked: !comment.liked },
                      })
                    }}
                  >
                    <Heart />赞{comment.likes > 0 ? ` ${comment.likes}` : ''}
                  </Button>
                  {user && (
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => {
                        setReplyTo(comment)
                        setPreview(false)
                        requestAnimationFrame(() => {
                          input.current?.focus()
                          input.current?.scrollIntoView?.({
                            behavior: 'smooth',
                            block: 'center',
                          })
                        })
                      }}
                    >
                      <Reply />
                      回复
                    </Button>
                  )}
                  {(user?.id === comment.author.id || user?.role === 100) && (
                    <>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => {
                          setEditing(comment)
                          setEditContent(comment.content)
                        }}
                      >
                        <Pencil />
                        编辑
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => setDeleting(comment)}
                      >
                        <Trash2 />
                        删除
                      </Button>
                    </>
                  )}
                  {user && (
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => {
                        setReporting(comment)
                        setReason('')
                      }}
                    >
                      <Flag />
                      举报
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </article>
      ))}
      {(query.data?.total ?? 0) > 30 && (
        <nav className='sf-pagination' aria-label='作品评论分页'>
          <Button
            variant='outline'
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </Button>
          <span>
            第 {page} / {Math.ceil((query.data?.total ?? 0) / 30)} 页
          </span>
          <Button
            variant='outline'
            disabled={page * 30 >= (query.data?.total ?? 0) || query.isFetching}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </nav>
      )}
      {user ? (
        <form
          className='sf-reply-form sf-work-comment-form'
          onSubmit={(event) => {
            event.preventDefault()
            publish.mutate()
          }}
        >
          <div className='sf-comment-editor-heading'>
            <h3>
              {replyTo ? (
                <>
                  回复 @<MemberName author={replyTo.author} />
                </>
              ) : (
                '发表作品评论'
              )}
            </h3>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              aria-pressed={preview}
              onClick={() => setPreview(!preview)}
            >
              {preview ? '继续编辑' : '预览评论'}
            </Button>
          </div>
          {replyTo && (
            <div className='sf-reply-context'>
              回复 @<MemberName author={replyTo.author} />
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => setReplyTo(null)}
              >
                取消回复
              </Button>
            </div>
          )}
          {preview ? (
            <div className='sf-markdown-preview'>
              <Markdown sanitizeOptions={forumMarkdownSanitize}>
                {content || '写下评论后可以在这里预览。'}
              </Markdown>
            </div>
          ) : (
            <Textarea
              ref={input}
              aria-label='作品评论内容'
              placeholder='写下对这件作品的想法，支持 Markdown…'
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
              maxLength={20000}
              rows={5}
            />
          )}
          <div>
            <span>友善交流 · {content.length.toLocaleString()} / 20,000</span>
            <Button
              type='submit'
              className='sf-primary'
              disabled={
                !content.trim() ||
                publish.isPending ||
                query.isPending ||
                query.isError
              }
            >
              <Send />
              {publish.isPending ? '正在发布…' : '发布评论'}
            </Button>
          </div>
        </form>
      ) : (
        <div className='sf-comments-signin'>
          <div>
            <h3>登录后参与作品交流</h3>
            <p>
              <CommunityAccessDescription>
                免费注册即可评论和回复，无需充值或创作者资格。
              </CommunityAccessDescription>
            </p>
          </div>
          <Button
            className='sf-primary'
            render={
              <Link
                to='/sign-in'
                search={{ redirect: `/creators/works/${workId}` }}
              />
            }
          >
            登录后评论
          </Button>
          <Button
            variant='outline'
            render={
              <Link
                to='/sign-up'
                search={{ redirect: `/creators/works/${workId}` }}
              />
            }
          >
            <CommunitySignupLabel />
          </Button>
        </div>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        title='编辑作品评论'
        description='修改仅应用于这条作品评论。'
      >
        <Textarea
          aria-label='编辑作品评论内容'
          value={editContent}
          onChange={(event) => setEditContent(event.target.value)}
          rows={6}
          maxLength={20000}
        />
        <Button
          className='mt-4'
          disabled={!editContent.trim() || update.isPending}
          onClick={() => {
            if (!editing) {
              return
            }
            update.mutate(
              {
                path: `/work-comments/${editing.id}`,
                method: 'put',
                data: { content: editContent, revision: editing.revision },
              },
              { onSuccess: () => setEditing(null) }
            )
          }}
        >
          保存评论修改
        </Button>
      </Dialog>
      <Dialog
        open={!!reporting}
        onOpenChange={(open) => {
          if (!open) setReporting(null)
        }}
        title='举报作品评论'
        description='管理员会在作品评论举报中查看并处理。'
      >
        <Textarea
          aria-label='作品评论举报原因'
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          maxLength={1000}
        />
        <Button
          className='mt-4'
          disabled={reason.trim().length < 3 || update.isPending}
          onClick={() => {
            if (!reporting) {
              return
            }
            update.mutate(
              {
                path: `/work-comments/${reporting.id}/report`,
                method: 'post',
                data: { reason },
              },
              {
                onSuccess: () => {
                  setReporting(null)
                  toast.success('举报已提交')
                },
              }
            )
          }}
        >
          提交评论举报
        </Button>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title='删除这条作品评论？'
        desc='评论正文会隐藏，保留删除标记和回复关系。'
        confirmText='删除评论'
        destructive
        isLoading={update.isPending}
        handleConfirm={() => {
          if (!deleting) {
            return
          }
          update.mutate(
            {
              path: `/work-comments/${deleting.id}`,
              method: 'put',
              data: { deleted: true, revision: deleting.revision },
            },
            { onSuccess: () => setDeleting(null) }
          )
        }}
      />
    </section>
  )
}
