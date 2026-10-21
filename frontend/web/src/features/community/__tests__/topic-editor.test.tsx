import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { communityRequest } from '../api'
import { CommunityContent } from '../content'
import {
  importTopicDocument,
  uploadMarkup,
  uploadTopicFile,
} from '../editor-file-utils'
import { TopicEditorFiles } from '../editor-files'
import type { TopicUpload } from '../types'

vi.mock('../api', () => ({ communityRequest: vi.fn() }))
const image: TopicUpload = {
  id: 'image1',
  name: '截图.png',
  size: 12,
  mime: 'image/png',
  image: true,
  url: '/api/community/uploads/image1',
}
beforeEach(() => {
  vi.mocked(communityRequest).mockReset()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'member', role: 1 })
})
afterEach(() => useAuthStore.getState().auth.reset())

test.each([
  ['article.md', '# Markdown heading', 'markdown'],
  ['article.html', '<h1>HTML heading</h1>', 'html'],
  ['article.txt', 'A plain text document', 'text'],
])(
  'imports %s into the matching editor mode',
  async (name, content, format) => {
    expect(await importTopicDocument(new File([content], name))).toEqual({
      content,
      format,
    })
  }
)

test('HTML rendering keeps article formatting and removes scripts, styles and event handlers', () => {
  const { container } = render(
    <CommunityContent format='html'>
      {
        '<h1>HTML heading</h1><table><tr><td>Cell</td></tr></table><img src="x" onerror="alert(1)"><script>bad()</script><p style="position:fixed">Paragraph</p><a href="javascript:alert(1)">Bad link</a>'
      }
    </CommunityContent>
  )
  expect(screen.getByRole('heading', { name: 'HTML heading' })).toBeVisible()
  expect(screen.getByRole('cell', { name: 'Cell' })).toBeVisible()
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('[onerror]')).toBeNull()
  expect(container.querySelector('[style]')).toBeNull()
  expect(screen.getByText('Bad link')).not.toHaveAttribute('href')
})

test('plain text mode shows markup literally', () => {
  const { container } = render(
    <CommunityContent format='text'>
      {'<h1>A literal document</h1>'}
    </CommunityContent>
  )
  expect(screen.getByText('<h1>A literal document</h1>')).toBeVisible()
  expect(container.querySelector('h1')).toBeNull()
})

test('uploads use the regular member API without creator activation', async () => {
  vi.mocked(communityRequest).mockResolvedValue(image)
  expect(
    await uploadTopicFile(
      new File(['image bytes'], '截图.png', { type: 'image/png' })
    )
  ).toEqual(image)
  expect(communityRequest).toHaveBeenCalledWith(
    '/uploads',
    expect.objectContaining({
      method: 'post',
      data: { name: '截图.png', content: btoa('image bytes') },
    })
  )
  expect(uploadMarkup(image, 'markdown')).toBe(
    '![截图.png](/api/community/uploads/image1)'
  )
  expect(uploadMarkup(image, 'html')).toContain(
    '<img src="/api/community/uploads/image1"'
  )
})

test('oversized files fail before any upload request', async () => {
  await expect(
    uploadTopicFile(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.zip')
    )
  ).rejects.toThrow('5 MB')
  expect(communityRequest).not.toHaveBeenCalled()
})

test('account switching during file reading cancels transmission', async () => {
  const operation = uploadTopicFile(new File(['image'], 'image.png'))
  useAuthStore.getState().auth.setUser({ id: 2, username: 'other', role: 1 })
  await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  expect(communityRequest).not.toHaveBeenCalled()
})

test('importing into an existing draft requires replacement confirmation', async () => {
  const imported = vi.fn()
  render(
    <TopicEditorFiles
      content='Existing draft body'
      uploads={[]}
      onImport={imported}
      onUpload={vi.fn()}
      onRemove={vi.fn()}
      onBusy={vi.fn()}
    />
  )
  await userEvent.upload(
    screen.getByLabelText('选择导入内容文件'),
    new File(['<h2>Imported</h2>'], 'article.html', { type: 'text/html' })
  )
  await screen.findByRole('alertdialog')
  expect(imported).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '替换正文' }))
  expect(imported).toHaveBeenCalledWith(
    expect.objectContaining({ format: 'html', content: '<h2>Imported</h2>' })
  )
})

test('batch image selection preserves all files while requests finish asynchronously', async () => {
  const uploaded = vi.fn()
  vi.mocked(communityRequest).mockResolvedValue(image)
  render(
    <TopicEditorFiles
      content=''
      uploads={[]}
      onImport={vi.fn()}
      onUpload={uploaded}
      onRemove={vi.fn()}
      onBusy={vi.fn()}
    />
  )
  await userEvent.upload(screen.getByLabelText('选择上传图片'), [
    new File(['first'], 'first.png', { type: 'image/png' }),
    new File(['second'], 'second.png', { type: 'image/png' }),
  ])
  await waitFor(() => expect(uploaded).toHaveBeenCalledTimes(2))
  expect(communityRequest).toHaveBeenCalledTimes(2)
})
