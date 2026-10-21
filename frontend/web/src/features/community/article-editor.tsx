import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Code2,
  Code,
  Link2,
  List,
  ListOrdered,
  Quote,
  Minus,
  Table2,
  Undo2,
  Redo2,
  Columns2,
  Eye,
  PencilLine,
} from 'lucide-react'
import {
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import {
  articleCommand,
  escapeArticleHtml,
  insertAt,
  type ArticleCommand,
  type Edit,
  type Selection,
} from './article-commands'
import { CommunityContent } from './content'
import { TOPIC_CONTENT_LIMIT, uploadMarkup } from './editor-file-utils'
import type { TopicFormat, TopicUpload } from './types'

export type ArticleEditorHandle = { insertUpload: (file: TopicUpload) => void }
export function ArticleEditor({
  ref: editorRef,
  value: content,
  format,
  disabled,
  onChange,
}: {
  ref?: Ref<ArticleEditorHandle>
  value: string
  format: TopicFormat
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const value = useRef(content)
  const selection = useRef<Selection>({
    start: content.length,
    end: content.length,
  })
  const past = useRef<Edit[]>([]),
    future = useRef<Edit[]>([])
  const [historyState, setHistoryState] = useState({ undo: false, redo: false })
  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>('split')
  const [link, setLink] = useState<{ text: string; url: string } | null>(null)
  const preview = useDeferredValue(content)
  useEffect(() => {
    if (value.current !== content) {
      value.current = content
      selection.current = { start: content.length, end: content.length }
      past.current = []
      future.current = []
      setHistoryState({
        undo: past.current.length > 0,
        redo: future.current.length > 0,
      })
    }
  }, [content, format])
  function remember() {
    if (textarea.current) {
      selection.current = {
        start: textarea.current.selectionStart,
        end: textarea.current.selectionEnd,
      }
    }
  }
  function focus(edit: Edit) {
    requestAnimationFrame(() => {
      textarea.current?.focus()
      textarea.current?.setSelectionRange(edit.start, edit.end)
    })
  }
  function commit(edit: Edit, restore = true) {
    if (edit.content.length > TOPIC_CONTENT_LIMIT) {
      toast.error('正文最多 200,000 个字符，附件已保留，可缩短正文后重新插入')
      return
    }
    if (edit.content !== value.current) {
      past.current.push({ content: value.current, ...selection.current })
      if (past.current.length > 100) past.current.shift()
      future.current = []
    }
    value.current = edit.content
    selection.current = { start: edit.start, end: edit.end }
    onChange(edit.content)
    setHistoryState({
      undo: past.current.length > 0,
      redo: future.current.length > 0,
    })
    if (restore) {
      setMode((current) => (current === 'preview' ? 'edit' : current))
      focus(edit)
    }
  }
  function command(name: ArticleCommand) {
    if (!disabled) {
      commit(articleCommand(value.current, selection.current, name, format))
    }
  }
  function history(redo = false) {
    if (disabled) return
    const source = redo ? future : past,
      target = redo ? past : future,
      edit = source.current.pop()
    if (!edit) return
    target.current.push({ content: value.current, ...selection.current })
    value.current = edit.content
    selection.current = { start: edit.start, end: edit.end }
    onChange(edit.content)
    setHistoryState({
      undo: past.current.length > 0,
      redo: future.current.length > 0,
    })
    focus(edit)
  }
  useImperativeHandle(editorRef, () => ({
    insertUpload(file) {
      // Insert rather than replace selected article text; preserve the rest of the draft.
      const point = selection.current.end
      commit(
        insertAt(
          value.current,
          { start: point, end: point },
          `\n\n${uploadMarkup(file, format)}\n\n`
        )
      )
    },
  }))
  function openLink() {
    if (disabled || format === 'text') return
    setLink({
      text:
        value.current.slice(selection.current.start, selection.current.end) ||
        '链接文字',
      url: '',
    })
  }
  const tools = [
    { name: 'bold', label: '插入粗体', hint: 'Ctrl/⌘ B', icon: Bold },
    { name: 'italic', label: '插入斜体', hint: 'Ctrl/⌘ I', icon: Italic },
    { name: 'strike', label: '插入删除线', icon: Strikethrough },
    { name: 'left', label: '左对齐', hint: 'Ctrl/⌘ Shift L', icon: AlignLeft },
    {
      name: 'center',
      label: '居中对齐',
      hint: 'Ctrl/⌘ Shift E',
      icon: AlignCenter,
    },
    {
      name: 'right',
      label: '右对齐',
      hint: 'Ctrl/⌘ Shift R',
      icon: AlignRight,
    },
    { name: 'bullet', label: '插入列表', icon: List },
    { name: 'ordered', label: '插入有序列表', icon: ListOrdered },
    { name: 'quote', label: '插入引用', icon: Quote },
    { name: 'code', label: '插入行内代码', icon: Code },
    { name: 'codeblock', label: '插入代码块', icon: Code2 },
    { name: 'table', label: '插入表格', icon: Table2 },
    { name: 'rule', label: '插入分隔线', icon: Minus },
  ] as const
  let statusText = 'Ctrl/⌘ B 加粗 · Ctrl/⌘ Alt 1–6 标题'
  if (mode === 'split') {
    statusText = '左侧编辑，右侧查看排版；图片插入到光标位置'
  }
  if (format === 'text') statusText = '纯文本模式保留文字原样'
  if (disabled) statusText = '正在处理，请稍候…'
  return (
    <section className='sf-article-editor'>
      <div className='sf-editor-heading'>
        <Label htmlFor='community-topic-content'>正文</Label>
        <div className='sf-editor-modes' role='group' aria-label='编辑视图'>
          {(
            [
              { id: 'edit', name: '编辑', icon: PencilLine },
              { id: 'split', name: '实时预览', icon: Columns2 },
              { id: 'preview', name: '预览', icon: Eye },
            ] as const
          ).map((item) => (
            <Button
              key={item.id}
              type='button'
              size='sm'
              variant={mode === item.id ? 'secondary' : 'ghost'}
              disabled={disabled}
              aria-pressed={mode === item.id}
              onClick={() => {
                remember()
                setMode(item.id)
              }}
            >
              <item.icon />
              {item.name}
            </Button>
          ))}
        </div>
      </div>
      {mode !== 'preview' && (
        <div
          className='sf-article-toolbar'
          role='toolbar'
          aria-label='正文排版'
        >
          <NativeSelect
            aria-label='段落样式'
            title='标题快捷键：Ctrl/⌘ Alt 1–6'
            value=''
            disabled={disabled || format === 'text'}
            onChange={(event) => command(event.target.value as ArticleCommand)}
          >
            <option value='' disabled>
              正文 / 标题
            </option>
            <option value='paragraph'>正文</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={`h${n}`}>
                {n} 级标题
              </option>
            ))}
          </NativeSelect>
          {tools.map((tool) => (
            <Button
              key={tool.name}
              type='button'
              size='icon-sm'
              variant='ghost'
              aria-label={tool.label}
              title={tool.label + ('hint' in tool ? `（${tool.hint}）` : '')}
              disabled={disabled || format === 'text'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command(tool.name)}
            >
              <tool.icon />
            </Button>
          ))}
          <Button
            type='button'
            size='icon-sm'
            variant='ghost'
            aria-label='插入链接'
            title='插入链接（Ctrl/⌘ K）'
            disabled={disabled || format === 'text'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={openLink}
          >
            <Link2 />
          </Button>
          <span className='sf-editor-tool-divider' aria-hidden />
          <Button
            type='button'
            size='icon-sm'
            variant='ghost'
            aria-label='撤销'
            title='撤销（Ctrl/⌘ Z）'
            disabled={disabled || !historyState.undo}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => history()}
          >
            <Undo2 />
          </Button>
          <Button
            type='button'
            size='icon-sm'
            variant='ghost'
            aria-label='重做'
            title='重做（Ctrl/⌘ Shift Z）'
            disabled={disabled || !historyState.redo}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => history(true)}
          >
            <Redo2 />
          </Button>
        </div>
      )}
      <div className={`sf-article-panes sf-article-mode-${mode}`}>
        {mode !== 'preview' && (
          <div className='sf-article-source'>
            {mode === 'split' && (
              <span className='sf-article-pane-label'>
                编辑正文 · 点击段落放置图片
              </span>
            )}
            <Textarea
              ref={textarea}
              id='community-topic-content'
              required
              minLength={8}
              maxLength={TOPIC_CONTENT_LIMIT}
              rows={18}
              value={content}
              readOnly={disabled}
              onSelect={remember}
              onClick={remember}
              onBlur={remember}
              onKeyUp={remember}
              onChange={(event) =>
                commit(
                  {
                    content: event.target.value,
                    start: event.target.selectionStart,
                    end: event.target.selectionEnd,
                  },
                  false
                )
              }
              onKeyDown={(event) => {
                if (
                  event.nativeEvent.isComposing ||
                  !(event.ctrlKey || event.metaKey) ||
                  disabled
                ) {
                  return
                }
                remember()
                const key = event.key.toLowerCase()
                if (key === 'z') {
                  event.preventDefault()
                  history(event.shiftKey)
                  return
                }
                if (key === 'y') {
                  event.preventDefault()
                  history(true)
                  return
                }
                if (format === 'text') return
                if (event.altKey && /^[1-6]$/.test(key)) {
                  event.preventDefault()
                  command(`h${key}` as ArticleCommand)
                  return
                }
                if (event.shiftKey && ['e', 'l', 'r'].includes(key)) {
                  event.preventDefault()
                  command(
                    ({ e: 'center', l: 'left', r: 'right' } as const)[
                      key as 'e' | 'l' | 'r'
                    ]
                  )
                  return
                }
                if (['b', 'i', 'k'].includes(key)) {
                  event.preventDefault()
                  if (key === 'k') openLink()
                  else command(key === 'b' ? 'bold' : 'italic')
                }
              }}
              placeholder='写下你的想法。使用上方工具栏排版；先把光标放到目标段落，再上传或插入图片。'
            />
          </div>
        )}
        {mode !== 'edit' && (
          <div
            className='sf-article-preview'
            role='region'
            aria-label='正文预览'
          >
            <span className='sf-article-pane-label'>
              阅读效果{mode === 'split' ? ' · 随输入更新' : ''}
            </span>
            <div className='sf-markdown-preview'>
              <CommunityContent format={format}>
                {preview || '还没有内容。'}
              </CommunityContent>
            </div>
          </div>
        )}
      </div>
      <div className='sf-editor-status'>
        <span>{statusText}</span>
        <span>{content.length.toLocaleString()} / 200,000</span>
      </div>
      {link && (
        <Dialog
          open
          title='插入链接'
          description='填写链接文字和实际网址。'
          onOpenChange={(open) => {
            if (!open) setLink(null)
          }}
          footer={
            <>
              <Button
                type='button'
                variant='outline'
                onClick={() => setLink(null)}
              >
                取消
              </Button>
              <Button
                type='submit'
                form='sf-article-link-form'
                disabled={!link.url.trim() || !link.text.trim()}
              >
                插入链接
              </Button>
            </>
          }
        >
          <form
            id='sf-article-link-form'
            className='sf-article-link-form'
            onSubmit={(event) => {
              event.preventDefault()
              let url = link.url.trim()
              if (!/^(https?:\/\/|mailto:|\/(?!\/))/i.test(url)) {
                toast.error('请输入 https://、http://、mailto: 或站内路径')
                return
              }
              if (format === 'html') {
                commit(
                  insertAt(
                    value.current,
                    selection.current,
                    `<a href="${escapeArticleHtml(url)}">${escapeArticleHtml(link.text)}</a>`
                  )
                )
              } else {
                url = url
                  .replaceAll(' ', '%20')
                  .replaceAll('(', '%28')
                  .replaceAll(')', '%29')
                commit(
                  insertAt(
                    value.current,
                    selection.current,
                    `[${link.text.replaceAll(/[[\]\\\r\n]/g, '')}](${url})`
                  )
                )
              }
              setLink(null)
            }}
          >
            <Label htmlFor='article-link-text'>链接文字</Label>
            <Input
              id='article-link-text'
              value={link.text}
              required
              onChange={(event) =>
                setLink({ ...link, text: event.target.value })
              }
            />
            <Label htmlFor='article-link-url'>链接网址</Label>
            <Input
              id='article-link-url'
              value={link.url}
              required
              placeholder='https://'
              onChange={(event) =>
                setLink({ ...link, url: event.target.value })
              }
            />
          </form>
        </Dialog>
      )}
    </section>
  )
}
