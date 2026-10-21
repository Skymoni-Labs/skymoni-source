import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { expect, test } from 'vitest'

import { articleCommand } from '../article-commands'
import { ArticleEditor, type ArticleEditorHandle } from '../article-editor'
import { CommunityContent } from '../content'
import type { TopicFormat, TopicUpload } from '../types'

const image: TopicUpload = {
  id: 'image1',
  name: '风景.png',
  image: true,
  size: 12,
  mime: 'image/png',
  url: '/api/community/uploads/image1',
}
function Harness({
  initial = '第一段正文\n\n第二段正文',
  format = 'markdown',
}: {
  initial?: string
  format?: TopicFormat
}) {
  const [content, setContent] = useState(initial),
    [busy, setBusy] = useState(false)
  const editor = useRef<ArticleEditorHandle>(null)
  return (
    <>
      <button
        type='button'
        onClick={() => {
          setBusy(true)
          setTimeout(() => {
            editor.current?.insertUpload(image)
            editor.current?.insertUpload({
              ...image,
              id: 'image2',
              name: '第二张.png',
              url: '/api/community/uploads/image2',
            })
            setBusy(false)
          }, 30)
        }}
      >
        异步批量上传
      </button>
      <button type='button' onClick={() => editor.current?.insertUpload(image)}>
        插入已上传图片
      </button>
      <ArticleEditor
        ref={editor}
        value={content}
        format={format}
        disabled={busy}
        onChange={setContent}
      />
    </>
  )
}
function select(start: number, end = start) {
  const editor = screen.getByLabelText('正文') as HTMLTextAreaElement
  editor.focus()
  editor.setSelectionRange(start, end)
  fireEvent.select(editor)
  return editor
}

test('heading and center render together in Markdown without allowing unsafe HTML', () => {
  const heading = articleCommand(
    '原始标题\n后续段落',
    { start: 0, end: 4 },
    'h2',
    'markdown'
  )
  expect(heading.content).toBe('## 原始标题\n后续段落')
  const centered = articleCommand(
    heading.content,
    { start: 0, end: 7 },
    'center',
    'markdown'
  )
  const { container } = render(
    <CommunityContent>
      {`${
        centered.content
      }\n\n<img src="x" onerror="bad()"><script>bad()</script><div style="position:fixed">Safe</div>`}
    </CommunityContent>
  )
  expect(
    screen
      .getByRole('heading', { name: '原始标题', level: 2 })
      .closest('.sf-text-center')
  ).not.toBeNull()
  expect(screen.getByText('后续段落')).toBeVisible()
  expect(container.querySelector('[style],[onerror],script')).toBeNull()
})

test('alignment can be changed without nesting wrappers or losing the selected text', () => {
  const centered = articleCommand(
    '正文',
    { start: 0, end: 2 },
    'center',
    'markdown'
  )
  const right = articleCommand(centered.content, centered, 'right', 'markdown')
  expect(right.content).toBe('<div class="sf-text-right">\n\n正文\n\n</div>')
  expect(right.content.slice(right.start, right.end)).toBe('正文')
})

test('multiline headings and lists keep surrounding paragraphs intact', () => {
  const source = '开头\n第一项\n第二项\n结尾'
  const list = articleCommand(
    source,
    { start: 3, end: 10 },
    'ordered',
    'markdown'
  )
  expect(list.content).toBe('开头\n1. 第一项\n2. 第二项\n结尾')
  const html = articleCommand('标题', { start: 0, end: 2 }, 'h3', 'html')
  expect(html.content).toBe('<h3>标题</h3>')
})

test('toolbar shortcuts format selected text and undo/redo preserve the whole document', async () => {
  render(<Harness initial={'示例标题\n\n后面的正文文字'} />)
  const user = userEvent.setup()
  const editor = select(0, 4)
  await user.selectOptions(screen.getByLabelText('段落样式'), 'h2')
  expect(editor.value).toBe('## 示例标题\n\n后面的正文文字')
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name: '正文预览' })).getByRole(
        'heading',
        { name: '示例标题', level: 2 }
      )
    ).toBeVisible()
  )
  select(editor.value.indexOf('后面的'), editor.value.length)
  await user.keyboard('{Control>}b{/Control}')
  expect(editor.value).toContain('**后面的正文文字**')
  await user.click(screen.getByRole('button', { name: '撤销' }))
  expect(editor.value).toBe('## 示例标题\n\n后面的正文文字')
  await user.click(screen.getByRole('button', { name: '重做' }))
  expect(editor.value).toContain('**后面的正文文字**')
})

test.each(['markdown', 'html', 'text'] as const)(
  'async batch images insert at the remembered cursor in %s, keeping paragraphs and order',
  async (format) => {
    render(<Harness format={format} />)
    const user = userEvent.setup(),
      editor = select(5)
    await user.click(screen.getByRole('button', { name: '异步批量上传' }))
    expect(editor).toHaveAttribute('readonly')
    await waitFor(() =>
      expect(editor.value).toContain('/api/community/uploads/image2')
    )
    expect(editor.value.startsWith('第一段正文')).toBe(true)
    expect(editor.value.endsWith('\n\n第二段正文')).toBe(true)
    expect(editor.value.indexOf('/uploads/image1')).toBeLessThan(
      editor.value.indexOf('/uploads/image2')
    )
    expect(editor.value.indexOf('/uploads/image2')).toBeLessThan(
      editor.value.indexOf('第二段正文')
    )
    await waitFor(() => expect(editor).not.toHaveAttribute('readonly'))
  }
)

test('inserting an existing image preserves selected text and moves the insertion cursor', async () => {
  render(<Harness />)
  const user = userEvent.setup(),
    editor = select(0, 5)
  await user.click(screen.getByRole('button', { name: '插入已上传图片' }))
  expect(editor.value).toContain('第一段正文\n\n![风景.png]')
  select(editor.value.indexOf('第二段正文') + 5)
  await user.click(screen.getByRole('button', { name: '插入已上传图片' }))
  expect(editor.value.match(/!\[风景.png\]/g)).toHaveLength(2)
})

test('link dialog uses the edited display text and prevents unsafe URL schemes', async () => {
  render(<Harness initial='原链接文字在这里' />)
  select(0, 5)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '插入链接' }))
  await user.clear(screen.getByLabelText('链接文字'))
  await user.type(screen.getByLabelText('链接文字'), '社区指南')
  await user.type(screen.getByLabelText('链接网址'), 'javascript:bad()')
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: '插入链接',
    })
  )
  expect(screen.getByRole('dialog')).toBeVisible()
  await user.clear(screen.getByLabelText('链接网址'))
  await user.type(
    screen.getByLabelText('链接网址'),
    'https://skymoni.com/creators/guidelines'
  )
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: '插入链接',
    })
  )
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(screen.getByLabelText('正文')).toHaveValue(
    '[社区指南](https://skymoni.com/creators/guidelines)在这里'
  )
})

test('plain text disables formatting while retaining image insertion and preview', () => {
  render(<Harness format='text' />)
  expect(screen.getByRole('button', { name: '居中对齐' })).toBeDisabled()
  expect(screen.getByLabelText('段落样式')).toBeDisabled()
  expect(screen.getByRole('region', { name: '正文预览' })).toBeVisible()
})

test('external document replacement resets the insertion point and stale undo history', async () => {
  function Replacement() {
    const [value, setValue] = useState('旧内容')
    return (
      <>
        <button type='button' onClick={() => setValue('导入的新正文')}>
          替换正文
        </button>
        <ArticleEditor value={value} format='markdown' onChange={setValue} />
      </>
    )
  }
  render(<Replacement />)
  const user = userEvent.setup()
  select(0, 3)
  await user.click(screen.getByRole('button', { name: '插入粗体' }))
  await user.click(screen.getByRole('button', { name: '替换正文' }))
  expect(screen.getByLabelText('正文')).toHaveValue('导入的新正文')
  expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
})
