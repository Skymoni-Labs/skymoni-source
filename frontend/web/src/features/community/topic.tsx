import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Bookmark,
  Eye,
  Flag,
  Heart,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Pin,
  Reply,
  Send,
  Trash2,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { communityRequest, loadCommunityMeta, loadTopic } from './api'
import { CommunityContent } from './content'
import {
  CommunityNumber,
  CommunitySignIn,
  CommunityTime,
  MemberAvatar,
  MemberName,
} from './shared'
import { TopicNavigationButton } from './topic-navigation'
import { TopicReader } from './topic-reader'
import { TopicTrashButton } from './topic-trash-button'
import { categoryFallback, type Post } from './types'

export function CommunityTopic(props: { topicId: string }) {
  const auth = useAuthStore((state) => state.auth)
  const user = auth.user
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const key = [
    'community-topic',
    props.topicId,
    user?.id,
    auth.session?.sid,
    page,
  ]
  const detail = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadTopic(props.topicId, signal, page),
    staleTime: 15000,
    retry: false,
  })
  const meta = useQuery({
    queryKey: ['community-meta'],
    queryFn: ({ signal }) => loadCommunityMeta(signal),
    staleTime: 60000,
  })
  const [reply, setReply] = useState('')
  const [replyTo, setReplyTo] = useState<Post | null>(null)
  const [editing, setEditing] = useState<Post | null>(null)
  const [editContent, setEditContent] = useState('')
  const [deleting, setDeleting] = useState<Post | null>(null)
  const [reporting, setReporting] = useState<Post | null>(null)
  const [reportReason, setReportReason] = useState('')
  const textarea = useRef<HTMLTextAreaElement>(null)
  const update = useMutation({
    mutationFn: (operation: {
      path: string
      method: 'put' | 'post'
      data: Record<string, unknown>
    }) => communityRequest(operation.path, operation),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key })
      void client.invalidateQueries({ queryKey: ['community-topics'] })
      void client.invalidateQueries({ queryKey: ['community-notifications'] })
    },
    onError: (error) => handleServerError(error),
  })
  const sendReply = useMutation({
    mutationFn: () =>
      communityRequest(`/topics/${props.topicId}/replies`, {
        method: 'post',
        data: { content: reply, replyTo: replyTo?.id },
      }),
    onSuccess: () => {
      setReply('')
      setReplyTo(null)
      const previousTotal =
        detail.data?.totalPosts ?? (detail.data?.topic.replies ?? 0) + 1
      setPage(Math.ceil((previousTotal + 1) / 100))
      void client.invalidateQueries({
        queryKey: ['community-topic', props.topicId],
      })
      void client.invalidateQueries({ queryKey: ['community-topics'] })
      toast.success('回复已发布')
    },
    onError: (error) => handleServerError(error),
  })
  if (detail.isPending) {
    return (
      <p className='sf-state' role='status'>
        正在加载话题…
      </p>
    )
  }
  if (!detail.data) {
    return (
      <div className='sf-state' role='alert'>
        <h1>话题暂不可用</h1>
        <p>话题可能不存在、已被隐藏，或服务暂时无法连接。</p>
        <Button
          onClick={() => {
            void detail.refetch()
          }}
        >
          重试
        </Button>
        <Link to='/creators'>返回社区</Link>
      </div>
    )
  }
  const { topic, posts } = detail.data
  const category = (meta.data?.categories ?? categoryFallback).find(
    (item) => item.id === topic.category
  )
  const canEdit = user?.id === topic.author.id || user?.role === 100
  const moderate = (field: 'pinned' | 'closed' | 'hidden') => {
    update.mutate({
      path: `/topics/${topic.id}/moderation`,
      method: 'put',
      data: { revision: topic.revision, [field]: !topic[field] },
    })
  }
  return (
    <main className='sf-topic-page'>
      <FormNavigationGuard when={!!reply.trim()} />
      <Link to='/creators' className='sf-back'>
        <ArrowLeft />
        返回话题列表
      </Link>
      <header className='sf-topic-header'>
        <div className='sf-topic-meta'>
          <Link to='/creators' search={{ category: topic.category }}>
            <i style={{ backgroundColor: category?.color }} />
            {category?.name}
          </Link>
          {topic.tags.map((tag) => (
            <Link
              key={tag}
              to='/creators'
              search={{ q: tag }}
              className='sf-tag'
            >
              {tag}
            </Link>
          ))}
        </div>
        <h1>
          {topic.pinned && <Pin />}
          {(detail.data.totalPosts ?? 0) > 100 && (
            <nav className='sf-pagination' aria-label='回复分页'>
              <Button
                variant='outline'
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                上一页回复
              </Button>
              <span>第 {page} 页</span>
              <Button
                variant='outline'
                disabled={page * 100 >= (detail.data.totalPosts ?? 0)}
                onClick={() => setPage(page + 1)}
              >
                下一页回复
              </Button>
            </nav>
          )}
          {topic.closed && <LockKeyhole />}
          {topic.title}
        </h1>
        <div className='sf-topic-header-meta'>
          <span>
            <MessageCircle />
            <CommunityNumber value={topic.replies} /> 条回复
          </span>
          <span>
            <Eye />
            <CommunityNumber value={topic.views} /> 次浏览
          </span>
          <CommunityTime timestamp={topic.createdAt} />
          {canEdit && !topic.deleted && (
            <Link
              to='/creators/topics/$topicId/edit'
              params={{ topicId: topic.id }}
            >
              <Pencil />
              编辑话题
            </Link>
          )}
        </div>
        <TopicNavigationButton topic={topic} />
        {canEdit && (
          <TopicTrashButton topic={topic} onChanged={() => setReply('')} />
        )}
        {topic.deleted && (
          <p className='sf-inline-error'>
            话题已移入回收站，仅作者和管理员可见。恢复后可继续编辑和讨论。
          </p>
        )}
        {topic.hidden && (
          <p className='sf-inline-error'>此话题已隐藏，仅管理员可见。</p>
        )}
      </header>
      <div className='sf-topic-layout'>
        <div className='sf-posts'>
          {posts.map((post, index) => (
            <article key={post.id} className='sf-post' id={`post-${post.id}`}>
              <div className='sf-post-avatar'>
                <MemberAvatar author={post.author} />
              </div>
              <div className='sf-post-body'>
                <header>
                  <Link
                    to='/creators/members/$memberId'
                    params={{ memberId: String(post.author.id) }}
                  >
                    <strong>
                      <MemberName author={post.author} />
                    </strong>
                  </Link>
                  <span className='sf-post-time'>
                    <CommunityTime timestamp={post.createdAt} />
                  </span>
                  <span className='sf-post-number'>
                    #{(page - 1) * 100 + index + 1}
                  </span>
                </header>
                {post.replyTo && (
                  <p className='sf-reply-context'>
                    回复{' '}
                    <MemberName
                      author={
                        posts.find((item) => item.id === post.replyTo)
                          ?.author ?? {
                          id: 0,
                          name: '社区成员',
                          username: '',
                          avatar: '',
                        }
                      }
                    />
                  </p>
                )}
                {post.deleted ? (
                  <p className='sf-deleted-post'>这条回复已删除。</p>
                ) : index === 0 && page === 1 ? (
                  <TopicReader
                    key={post.id}
                    content={post.content}
                    format={post.contentFormat ?? topic.contentFormat}
                    prompt={/提示词|prompt/i.test(topic.title)}
                  />
                ) : (
                  <CommunityContent
                    format={
                      post.contentFormat ??
                      (index === 0 && page === 1
                        ? topic.contentFormat
                        : 'markdown')
                    }
                    className='sf-post-content'
                  >
                    {post.content}
                  </CommunityContent>
                )}
                {post.editedAt > 0 && (
                  <small className='sf-edited'>已编辑</small>
                )}
                {!post.deleted && !topic.deleted && (
                  <div className='sf-post-actions'>
                    <Button
                      variant='ghost'
                      size='sm'
                      disabled={
                        !user || user.id === post.author.id || update.isPending
                      }
                      aria-pressed={post.liked}
                      onClick={() =>
                        update.mutate({
                          path: `/posts/${post.id}/like`,
                          method: 'put',
                          data: { liked: !post.liked },
                        })
                      }
                    >
                      <Heart fill={post.liked ? 'currentColor' : 'none'} />
                      {post.likes || '赞'}
                    </Button>
                    {user && !topic.closed && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => {
                          setReplyTo(post)
                          textarea.current?.focus()
                          textarea.current?.scrollIntoView({
                            block: 'center',
                            behavior: 'smooth',
                          })
                        }}
                      >
                        <Reply />
                        回复
                      </Button>
                    )}
                    {user && (
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        aria-label='举报此内容'
                        onClick={() => {
                          setReporting(post)
                          setReportReason('')
                        }}
                      >
                        <Flag />
                      </Button>
                    )}
                    {(user?.id === post.author.id || user?.role === 100) &&
                      index > 0 && (
                        <>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            aria-label='编辑回复'
                            onClick={() => {
                              setEditing(post)
                              setEditContent(post.content)
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            aria-label='删除回复'
                            onClick={() => setDeleting(post)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        <aside className='sf-topic-aside'>
          <div>
            <span className='sf-rail-kicker'>TOPIC</span>
            <h2>这场讨论</h2>
            <p>
              <CommunityNumber
                value={posts.filter((post) => !post.deleted).length}
              />{' '}
              条内容 ·{' '}
              <CommunityNumber
                value={new Set(posts.map((post) => post.author.id)).size}
              />{' '}
              位参与者
            </p>
            <div className='sf-avatar-stack'>
              {[
                ...new Map(
                  posts.map((post) => [post.author.id, post.author])
                ).values(),
              ]
                .slice(0, 6)
                .map((author) => (
                  <MemberAvatar key={author.id} author={author} small />
                ))}
            </div>
            <Button
              variant='outline'
              disabled={!user || update.isPending || topic.deleted}
              aria-pressed={topic.bookmarked}
              onClick={() =>
                update.mutate({
                  path: `/topics/${topic.id}/bookmark`,
                  method: 'put',
                  data: { bookmarked: !topic.bookmarked },
                })
              }
            >
              <Bookmark fill={topic.bookmarked ? 'currentColor' : 'none'} />
              {topic.bookmarked ? '已收藏' : '收藏话题'}
            </Button>
          </div>
          {user?.role === 100 && !topic.deleted && (
            <div>
              <h2>管理此话题</h2>
              <Button
                variant='ghost'
                disabled={update.isPending}
                onClick={() => moderate('pinned')}
              >
                {topic.pinned ? '取消置顶' : '置顶话题'}
              </Button>
              <Button
                variant='ghost'
                disabled={update.isPending}
                onClick={() => moderate('closed')}
              >
                {topic.closed ? '重新开放回复' : '关闭回复'}
              </Button>
              <Button
                variant='ghost'
                disabled={update.isPending}
                onClick={() => moderate('hidden')}
              >
                {topic.hidden ? '恢复公开' : '隐藏话题'}
              </Button>
            </div>
          )}
        </aside>
      </div>
      {!!detail.data.attachments?.length && (
        <section className='sf-topic-attachments'>
          <h2>话题附件</h2>
          <ul>
            {detail.data.attachments.map((file) => (
              <li key={file.id}>
                <a href={file.url} target='_blank' rel='noopener noreferrer'>
                  {file.name}
                </a>
                <small>{Math.max(1, Math.ceil(file.size / 1024))} KB</small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {topic.closed && (
        <p className='sf-closed-notice'>
          <LockKeyhole />
          这个话题已关闭回复，已有内容仍可阅读。
        </p>
      )}
      {!topic.closed && !topic.deleted && user && (
        <form
          className='sf-reply-form'
          onSubmit={(event) => {
            event.preventDefault()
            sendReply.mutate()
          }}
        >
          <h2>加入讨论</h2>
          {replyTo && (
            <div className='sf-reply-context'>
              回复 <MemberName author={replyTo.author} />
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => setReplyTo(null)}
              >
                取消引用
              </Button>
            </div>
          )}
          <Textarea
            ref={textarea}
            aria-label='回复内容'
            placeholder='写下你的回复，支持 Markdown…'
            maxLength={20000}
            rows={5}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            required
          />
          <div>
            <span>友善交流，让每一次回应都有价值。</span>
            <Button
              type='submit'
              className='sf-primary'
              disabled={!reply.trim() || sendReply.isPending}
            >
              <Send />
              {sendReply.isPending ? '发布中…' : '发布回复'}
            </Button>
          </div>
        </form>
      )}
      {!topic.closed && !topic.deleted && !user && (
        <CommunitySignIn redirect={`/creators/topics/${topic.id}`} />
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
          }
        }}
        title='编辑回复'
        description='保存后会保留编辑标记。'
      >
        <Textarea
          aria-label='编辑回复内容'
          rows={8}
          maxLength={20000}
          value={editContent}
          onChange={(event) => setEditContent(event.target.value)}
        />
        <Button
          disabled={!editContent.trim() || update.isPending}
          onClick={() => {
            if (editing) {
              update.mutate(
                {
                  path: `/posts/${editing.id}`,
                  method: 'put',
                  data: { content: editContent, revision: editing.revision },
                },
                { onSuccess: () => setEditing(null) }
              )
            }
          }}
        >
          保存修改
        </Button>
      </Dialog>
      <Dialog
        open={!!reporting}
        onOpenChange={(open) => {
          if (!open) {
            setReporting(null)
          }
        }}
        title='举报内容'
        description='说明问题，管理员会查看并处理。'
      >
        <Textarea
          aria-label='举报原因'
          rows={5}
          maxLength={1000}
          value={reportReason}
          onChange={(event) => setReportReason(event.target.value)}
        />
        <Button
          disabled={reportReason.trim().length < 3 || update.isPending}
          onClick={() => {
            if (reporting) {
              update.mutate(
                {
                  path: `/posts/${reporting.id}/report`,
                  method: 'post',
                  data: { reason: reportReason },
                },
                {
                  onSuccess: () => {
                    setReporting(null)
                    toast.success('举报已提交')
                  },
                }
              )
            }
          }}
        >
          提交举报
        </Button>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
          }
        }}
        title='删除这条回复？'
        desc='删除后，讨论中会保留删除标记。'
        confirmText='删除回复'
        destructive
        isLoading={update.isPending}
        handleConfirm={() => {
          if (deleting) {
            update.mutate(
              {
                path: `/posts/${deleting.id}`,
                method: 'put',
                data: { deleted: true, revision: deleting.revision },
              },
              { onSuccess: () => setDeleting(null) }
            )
          }
        }}
      />
    </main>
  )
}
