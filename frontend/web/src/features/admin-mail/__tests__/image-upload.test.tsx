import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { beforeEach, expect, test, vi } from 'vitest'
import { MailImageUpload } from '../components/image-upload'
import type { MailFormValues } from '../lib/schema'

const mocks = vi.hoisted(() => ({ upload: vi.fn(), error: vi.fn() }))
vi.mock('../api', () => ({ uploadMailImage: mocks.upload }))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: mocks.error }))
const marker = `<div data-mail-image="${'a'.repeat(64)}.png"></div>`
function Fixture({ content, format }: { content: string; format: 'text' | 'html' }) {
  const form = useForm<MailFormValues>({ defaultValues: { content, format } })
  const values = form.watch()
  return <FormProvider {...form}><MailImageUpload onEdit={() => {}} /><output data-testid='values'>{JSON.stringify(values)}</output></FormProvider>
}
beforeEach(() => { vi.clearAllMocks(); mocks.upload.mockResolvedValue({ html: marker }) })
test('upload keeps a saved starry template around both original content and image', async () => {
  render(<Fixture format='html' content='<div data-mail-template="starry-compact-static"><p>Original text</p></div>' />)
  await userEvent.upload(screen.getByLabelText('选择邮件图片'), new File(['png'], 'poster.png', { type: 'image/png' }))
  await waitFor(() => expect(screen.getByTestId('values').textContent).toContain('data-mail-image'))
  const value = JSON.parse(screen.getByTestId('values').textContent ?? '{}')
  const document = new DOMParser().parseFromString(value.content, 'text/html')
  expect(document.querySelector('[data-mail-template] [data-mail-image]')).not.toBeNull()
  expect(document.querySelector('p')?.textContent).toBe('Original text')
})
test('plain text is preserved and escaped when image upload switches to HTML', async () => {
  render(<Fixture format='text' content={'Hello <world>\nNext line'} />)
  await userEvent.upload(screen.getByLabelText('选择邮件图片'), new File(['png'], 'poster.png', { type: 'image/png' }))
  await waitFor(() => expect(screen.getByTestId('values').textContent).toContain('data-mail-image'))
  const value = JSON.parse(screen.getByTestId('values').textContent ?? '{}')
  expect(value.format).toBe('html')
  expect(value.content).toContain('Hello &lt;world&gt;<br>Next line')
})
test('failed upload leaves the draft content and format unchanged', async () => {
  mocks.upload.mockRejectedValue(new Error('Upload failed'))
  render(<Fixture format='text' content='Keep this draft' />)
  await userEvent.upload(screen.getByLabelText('选择邮件图片'), new File(['png'], 'poster.png', { type: 'image/png' }))
  await waitFor(() => expect(mocks.error).toHaveBeenCalled())
  expect(JSON.parse(screen.getByTestId('values').textContent ?? '{}')).toMatchObject({ content: 'Keep this draft', format: 'text' })
})
