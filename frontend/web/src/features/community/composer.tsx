import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Send, Check, FileText } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { communityRequest, loadCommunityMeta, loadTopic } from './api'
import { ArticleEditor, type ArticleEditorHandle } from './article-editor'
import { uploadMarkup } from './editor-file-utils'
import { TopicEditorFiles } from './editor-files'
import { CommunitySignIn } from './shared'
import { TopicTrashButton } from './topic-trash-button'
import {
  categoryFallback,
  type TopicDetail,
  type TopicFormat,
  type TopicUpload,
} from './types'

export function CommunityComposer(props: { topicId?: string }) {
  const auth = useAuthStore((state) => state.auth)
  const user = auth.user
  const detail = useQuery({
    queryKey: ['community-topic', props.topicId, user?.id, auth.session?.sid],
    queryFn: ({ signal }) => loadTopic(props.topicId ?? '', signal),
    enabled: !!props.topicId && !!user,
    retry: false,
    refetchOnWindowFocus: false,
  })
  if (!user) {
    return <CommunitySignIn redirect='/creators/new' />
  }
  if (props.topicId && detail.isPending) {
    return (
      <p className='sf-state' role='status'>
        正在加载话题…
      </p>
    )
  }
  if (props.topicId && !detail.data) {
    return (
      <p className='sf-state' role='alert'>
        话题暂时无法加载，请返回后重试。
      </p>
    )
  }
  if (
    detail.data &&
    detail.data.topic.author.id !== user.id &&
    user.role !== 100
  ) {
    return (
      <p className='sf-state' role='alert'>
        只能编辑自己的话题。
      </p>
    )
  }
  if (detail.data?.topic.deleted) {
    return (
      <div className='sf-state'>
        <h1>话题已移入回收站</h1>
        <p>恢复后可以继续编辑，原有正文和回复都已保留。</p>
        <TopicTrashButton topic={detail.data.topic} />
        <Link to='/creators' search={{ view: 'trash' }}>
          查看话题回收站
        </Link>
      </div>
    )
  }
  return (
    <CommunityComposerForm
      key={`${props.topicId ?? 'new'}:${user.id}:${auth.session?.sid}`}
      initial={detail.data}
      role={user.role}
    />
  )
}

function CommunityComposerForm(props: { initial?: TopicDetail; role: number }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [title, setTitle] = useState(props.initial?.topic.title ?? '')
  const [category, setCategory] = useState(
    props.initial?.topic.category ?? 'general'
  )
  const [tags, setTags] = useState(props.initial?.topic.tags.join(', ') ?? '')
  const [content, setContent] = useState(props.initial?.posts[0]?.content ?? '')
  const [format, setFormat] = useState<TopicFormat>(
    props.initial?.topic.contentFormat ?? 'markdown'
  )
  const [uploads, setUploads] = useState<TopicUpload[]>(
    props.initial?.attachments ?? []
  )
  const [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [revision] = useState(props.initial?.topic.revision)
  const editor = useRef<ArticleEditorHandle>(null)
  const parsedTags = [
    ...new Set(
      tags
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ]
  const meta = useQuery({
    queryKey: ['community-meta'],
    queryFn: ({ signal }) => loadCommunityMeta(signal),
    staleTime: 60000,
  })
  const mutation = useMutation({
    mutationFn: () =>
      communityRequest<{ id: string }>(
        props.initial?.topic.id
          ? `/topics/${props.initial?.topic.id}`
          : '/topics',
        {
          method: props.initial?.topic.id ? 'put' : 'post',
          data: {
            title,
            category,
            content,
            tags: parsedTags,
            revision,
            contentFormat: format,
            attachments: uploads.map((file) => file.id),
          },
        }
      ),
    onSuccess: async (result) => {
      setDirty(false)
      void client.invalidateQueries({ queryKey: ['community-topics'] })
      await client.invalidateQueries({
        queryKey: ['community-topic', props.initial?.topic.id],
      })
      void client.invalidateQueries({ queryKey: ['community-meta'] })
      toast.success(props.initial?.topic.id ? '话题已更新' : '话题已发布')
      void navigate({
        to: '/creators/topics/$topicId',
        params: { topicId: result.id },
        ignoreBlocker: true,
      })
    },
    onError: (error) => handleServerError(error),
  })
  const categories = (meta.data?.categories ?? categoryFallback).filter(
    (item) => !item.adminOnly || props.role === 100
  )
  let submitLabel = props.initial ? '保存修改' : '发布话题'
  if (mutation.isPending) {
    submitLabel = '正在保存…'
  }
  return (
    <main className='sf-composer-page'>
      <FormNavigationGuard when={dirty && !mutation.isSuccess} />
      <Link to='/creators' className='sf-back'>
        <ArrowLeft />
        返回社区
      </Link>
      <header>
        <span className='sf-rail-kicker'>SHARE SOMETHING GOOD</span>
        <h1>{props.initial?.topic.id ? '编辑话题' : '发起一个新话题'}</h1>
        <p>
          把问题说清楚，把经验分享出来。支持
          Markdown、HTML、纯文本，以及图片和附件。
        </p>
      </header>
      <div className='sf-compose-layout'>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!uploading && !mutation.isPending) mutation.mutate()
          }}
          onChange={() => setDirty(true)}
        >
          <Label htmlFor='community-topic-title'>话题标题</Label>
          <Input
            id='community-topic-title'
            required
            minLength={3}
            maxLength={180}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder='用一句话说明你想聊什么'
          />
          <div className='sf-composer-fields'>
            <div>
              <Label htmlFor='community-topic-category'>选择分类</Label>
              <NativeSelect
                id='community-topic-category'
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor='community-topic-tags'>
                标签 <small>选填，最多 5 个，逗号分隔</small>
              </Label>
              <Input
                id='community-topic-tags'
                maxLength={140}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder='例如 Python, AI, 开源'
              />
              {parsedTags.length > 5 && (
                <p role='alert' className='sf-field-error'>
                  最多添加 5 个标签，当前 {parsedTags.length} 个。
                </p>
              )}
            </div>
          </div>
          <div className='sf-editor-format'>
            <Label htmlFor='community-topic-format'>正文格式</Label>
            <NativeSelect
              id='community-topic-format'
              value={format}
              disabled={uploading || mutation.isPending}
              onChange={(event) => {
                setFormat(event.target.value as TopicFormat)
                setDirty(true)
              }}
            >
              <option value='markdown'>Markdown (.md)</option>
              <option value='html'>HTML (.html)</option>
              <option value='text'>纯文本 (.txt)</option>
            </NativeSelect>
            <span>切换格式会保留正文内容</span>
          </div>
          <TopicEditorFiles
            content={content}
            uploads={uploads}
            disabled={mutation.isPending}
            onBusy={setUploading}
            onImport={(document) => {
              setContent(document.content)
              setFormat(document.format)
              setDirty(true)
            }}
            onUpload={(file) => {
              setUploads((current) => [...current, file])
              editor.current?.insertUpload(file)
              setDirty(true)
            }}
            onInsert={(file) => editor.current?.insertUpload(file)}
            onRemove={(file) => {
              setUploads((current) =>
                current.filter((item) => item.id !== file.id)
              )
              setContent((current) =>
                (['markdown', 'html', 'text'] as TopicFormat[]).reduce(
                  (value, mode) =>
                    value.split(uploadMarkup(file, mode)).join(''),
                  current
                )
              )
              setDirty(true)
            }}
          />
          <ArticleEditor
            ref={editor}
            value={content}
            format={format}
            disabled={uploading || mutation.isPending}
            onChange={(value) => {
              setContent(value)
              setDirty(true)
            }}
          />
          <div className='sf-composer-submit'>
            <p>尊重他人，保护隐私，分享有价值的内容。</p>
            {props.initial && (
              <TopicTrashButton
                topic={props.initial.topic}
                disabled={mutation.isPending || uploading}
                onChanged={() => setDirty(false)}
              />
            )}
            <Button
              type='submit'
              className='sf-primary'
              disabled={
                mutation.isPending ||
                uploading ||
                parsedTags.length > 5 ||
                title.trim().length < 3 ||
                content.trim().length < 8
              }
            >
              <Send />
              {submitLabel}
            </Button>
          </div>
        </form>
        <aside className='sf-compose-help'>
          <span className='sf-help-icon'>
            <FileText />
          </span>
          <h2>好的讨论，从清晰表达开始</h2>
          <p>一个具体的问题，一段亲身经历，或一个值得分享的发现。</p>
          <ul>
            <li>
              <Check />
              标题简洁，让人一眼明白主题
            </li>
            <li>
              <Check />
              提供背景、步骤或相关链接
            </li>
            <li>
              <Check />
              代码和长内容使用 Markdown 排版
            </li>
            <li>
              <Check />
              选择合适分类，方便大家找到
            </li>
          </ul>
          <div>
            <strong>你选择的分类</strong>
            <p>
              {categories.find((item) => item.id === category)?.description}
            </p>
          </div>
          <Link to='/creators/guidelines'>阅读社区指南 →</Link>
        </aside>
      </div>
    </main>
  )
}
