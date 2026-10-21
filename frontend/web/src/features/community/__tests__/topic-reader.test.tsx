import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { TopicReader } from '../topic-reader'

afterEach(cleanup)

test('copy prompt copies its section without instructions, download links or Markdown fences', async () => {
  const user = userEvent.setup()
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  render(
    <TopicReader
      prompt
      content={
        '## 使用方法\n先阅读说明。\n\n## 完整提示词\n\n```text\n你是一位故事讲述者。\n  保留缩进。\n# 这一行是提示词，不是目录标题\n```\n\n## 原始文件\n[下载文件](/download.txt)'
      }
    />
  )
  await user.click(screen.getByRole('button', { name: '一键复制提示词' }))
  expect(write).toHaveBeenCalledWith(
    '你是一位故事讲述者。\n  保留缩进。\n# 这一行是提示词，不是目录标题'
  )
  expect(await screen.findByRole('button', { name: '已复制' })).toBeEnabled()
  expect(screen.getByRole('status')).toHaveTextContent('提示词已复制')
  expect(
    within(screen.getByRole('navigation', { name: '正文目录' })).queryByText(
      '这一行是提示词，不是目录标题'
    )
  ).not.toBeInTheDocument()
})

test('clipboard denial reports failure instead of reporting success', async () => {
  const user = userEvent.setup()
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
    new Error('Denied')
  )
  render(<TopicReader prompt format='text' content='一段提示词正文' />)
  await user.click(screen.getByRole('button', { name: '一键复制提示词' }))
  expect(await screen.findByRole('status')).toHaveTextContent('复制未成功')
  expect(
    screen.queryByRole('button', { name: '已复制' })
  ).not.toBeInTheDocument()
})

test('long content can be expanded, collapsed and opened by its directory', async () => {
  const user = userEvent.setup()
  const content = `## 第一节\n${'这里是正文。'.repeat(300)}\n\n## 第二节\n最后一段。`
  render(<TopicReader content={content} />)
  const expand = await screen.findByRole('button', {
    name: /^展开全文$/,
  })
  expect(expand).toHaveAttribute('aria-expanded', 'false')
  const targetId = expand.getAttribute('aria-controls')!
  expect(document.getElementById(targetId)).toHaveClass('sf-reading-collapsed')
  await user.click(expand)
  expect(document.getElementById(targetId)).not.toHaveClass(
    'sf-reading-collapsed'
  )
  await user.click(screen.getAllByRole('button', { name: '收起正文' })[0])
  expect(document.getElementById(targetId)).toHaveClass('sf-reading-collapsed')
  const directory = screen.getByRole('navigation', { name: '正文目录' })
  await user.click(within(directory).getByRole('link', { name: '第二节' }))
  expect(document.getElementById(targetId)).not.toHaveClass(
    'sf-reading-collapsed'
  )
})

test('HTML headings receive unique controlled anchors and copied text stays sanitized', async () => {
  const user = userEvent.setup()
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  const view = render(
    <TopicReader
      format='html'
      content='<h2 id="unsafe">重复标题</h2><p>第一段<br>第二行</p><h2>重复标题</h2><p>末段</p><script>danger()</script>'
    />
  )
  const links = within(
    await screen.findByRole('navigation', { name: '正文目录' })
  ).getAllByRole('link')
  expect(links).toHaveLength(2)
  expect(links[0].getAttribute('href')).not.toBe(links[1].getAttribute('href'))
  for (const link of links)
    expect(
      document.getElementById(link.getAttribute('href')!.slice(1))
    ).toBeTruthy()
  expect(view.container.querySelector('script')).toBeNull()
  expect(document.getElementById('unsafe')).toBeNull()
  await user.click(screen.getByRole('button', { name: '复制正文' }))
  expect(write.mock.calls[0][0]).toContain('第一段\n第二行')
  expect(write.mock.calls[0][0]).not.toContain('danger()')
})

test('short plain text stays fully readable without redundant collapse or directory controls', () => {
  render(<TopicReader format='text' content='简短的正文。' />)
  expect(screen.getByText('简短的正文。')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: '展开全文' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('navigation', { name: '正文目录' })
  ).not.toBeInTheDocument()
})
