import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { beforeEach, expect, test, vi } from 'vitest'

import { PopupImageUpload } from '../components/image-upload'
import type { PopupFormValues } from '../lib/schema'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  error: vi.fn(),
  busy: vi.fn(),
}))
vi.mock('@/features/admin-mail/api', () => ({ uploadMailImage: mocks.upload }))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: mocks.error }))
const imageName = `${'a'.repeat(64)}.png`

function Fixture({
  content,
  format,
}: {
  content: string
  format: PopupFormValues['format']
}) {
  const form = useForm<PopupFormValues>({ defaultValues: { content, format } })
  return (
    <FormProvider {...form}>
      <PopupImageUpload onBusyChange={mocks.busy} />
      <output data-testid='values'>{JSON.stringify(form.watch())}</output>
    </FormProvider>
  )
}
const values = () =>
  JSON.parse(screen.getByTestId('values').textContent ?? '{}')
const imageFile = () => new File(['png'], 'poster.png', { type: 'image/png' })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.upload.mockResolvedValue({ name: imageName })
})

test('upload retains template content and inserts the image inside its root', async () => {
  render(
    <Fixture
      format='auto'
      content='<div data-mail-template="starry-compact-static"><h2>邀请</h2></div>'
    />
  )
  await userEvent.upload(screen.getByLabelText('选择弹窗图片'), imageFile())
  await waitFor(() => expect(values().content).toContain('data-mail-image'))
  const doc = new DOMParser().parseFromString(values().content, 'text/html')
  expect(
    doc.querySelector('[data-mail-template] [data-mail-image]')
  ).not.toBeNull()
  expect(doc.querySelector('h2')?.textContent).toBe('邀请')
  expect(values().format).toBe('html')
  expect(mocks.busy.mock.calls).toEqual([[true], [false]])
})

test('explicit plain text escapes markup and keeps line breaks when inserting an image', async () => {
  render(<Fixture format='text' content={'Hello <world>\nNext line'} />)
  await userEvent.upload(screen.getByLabelText('选择弹窗图片'), imageFile())
  await waitFor(() => expect(values().format).toBe('html'))
  expect(values().content).toContain('Hello &lt;world&gt;<br>Next line')
})

test('automatic Markdown preserves headings and lists when switching to HTML', async () => {
  render(<Fixture format='auto' content={'# Welcome\n\n- One\n- Two'} />)
  await userEvent.upload(screen.getByLabelText('选择弹窗图片'), imageFile())
  await waitFor(() => expect(values().format).toBe('html'))
  expect(values().content).toContain('<h1>Welcome</h1>')
  expect(values().content).toContain('<li>Two</li>')
})

test('failed upload leaves the original draft and format intact', async () => {
  mocks.upload.mockRejectedValue(new Error('Upload failed'))
  render(<Fixture format='markdown' content='Keep this draft' />)
  await userEvent.upload(screen.getByLabelText('选择弹窗图片'), imageFile())
  await waitFor(() => expect(mocks.error).toHaveBeenCalled())
  expect(values()).toMatchObject({
    content: 'Keep this draft',
    format: 'markdown',
  })
  expect(mocks.busy).toHaveBeenLastCalledWith(false)
})

test('oversized files and a fifth image are rejected before upload', async () => {
  const content = `<div data-mail-image="${imageName}"></div>`.repeat(4)
  render(<Fixture format='html' content={content} />)
  await userEvent.upload(screen.getByLabelText('选择弹窗图片'), imageFile())
  expect(mocks.upload).not.toHaveBeenCalled()
  const large = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {
    type: 'image/png',
  })
  await userEvent.upload(screen.getByLabelText('选择弹窗图片'), large)
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(values().content).toBe(content)
})
