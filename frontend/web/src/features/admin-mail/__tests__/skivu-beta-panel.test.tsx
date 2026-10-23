import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { Form } from '@/components/ui/form'

import { SkivuBetaMailPanel } from '../components/skivu-beta-panel'
import type { MailFormValues } from '../lib/schema'
import { betaMailAmount, skivuBetaTemplate } from '../lib/skivu-beta-template'

const server = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  review: vi.fn(),
  send: vi.fn(),
  save: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/features/community/app-beta-api', () => ({
  betaList: server.list,
  betaReview: server.review,
}))
vi.mock('../api', () => ({
  uploadMailImage: server.upload,
  changeMailState: server.send,
  createMailDraft: server.save,
}))
vi.mock('@/lib/handle-server-error', () => ({
  handleServerError: server.error,
}))
vi.mock('@/lib/format', () => ({
  formatQuota: (value: number) => String(value),
}))

const clients: QueryClient[] = []
function Editor({ initial = {} }: { initial?: Partial<MailFormValues> }) {
  const form = useForm<MailFormValues>({
    defaultValues: {
      subject: '',
      content: '',
      format: 'text',
      audience: 'emails',
      user_ids: [],
      recipient_emails: '',
      ...initial,
    },
  })
  const values = form.watch()
  return (
    <Form {...form}>
      <SkivuBetaMailPanel onEdit={vi.fn()} />
      <output data-testid='values'>{JSON.stringify(values)}</output>
    </Form>
  )
}
function show(initial?: Partial<MailFormValues>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <Editor initial={initial} />
    </QueryClientProvider>
  )
}
const values = () =>
  JSON.parse(screen.getByTestId('values').textContent || '{}') as MailFormValues
beforeEach(() => {
  vi.clearAllMocks()
  server.list.mockResolvedValue({
    items: [
      {
        user_id: 7,
        username: 'approved-user',
        status: 'approved',
        balance: 7500000,
      },
      { user_id: 8, username: 'pending-user', status: 'pending', balance: 0 },
    ],
    total: 1,
    app_available: true,
  })
  server.upload.mockResolvedValue({
    name: `${'a'.repeat(64)}.jpg`,
    html: '',
    url: '',
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['poster'], { type: 'image/jpeg' }),
    })
  )
})
afterEach(() => {
  cleanup()
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.unstubAllGlobals()
})

test('prepares a $15 draft with an empty selected-user audience without sending or allocating', async () => {
  show()
  expect(server.list).not.toHaveBeenCalled()
  await userEvent.click(
    screen.getByRole('checkbox', { name: '附带 App 宣传海报' })
  )
  await userEvent.click(
    screen.getByRole('button', { name: '载入内测通知模板' })
  )
  await waitFor(() => expect(values().subject).toContain('$15'))
  expect(values()).toMatchObject({
    audience: 'users',
    user_ids: [],
    recipient_emails: '',
    format: 'html',
  })
  expect(values().content).toContain('与中转站余额独立计算')
  expect(server.upload).not.toHaveBeenCalled()
  expect(server.review).not.toHaveBeenCalled()
  expect(server.send).not.toHaveBeenCalled()
  expect(server.save).not.toHaveBeenCalled()
})
test('loads only approved accounts and transfers explicitly selected IDs', async () => {
  show()
  await userEvent.click(screen.getByRole('button', { name: '已开通用户' }))
  await waitFor(() => expect(server.list).toHaveBeenCalled())
  await waitFor(() => expect(screen.getByText('approved-user')).toBeVisible())
  expect(
    await screen.findByRole('checkbox', { name: /approved-user/ })
  ).toBeVisible()
  expect(
    screen.queryByRole('checkbox', { name: /pending-user/ })
  ).not.toBeInTheDocument()
  expect(server.list).toHaveBeenCalledWith(
    'approved',
    1,
    expect.any(AbortSignal)
  )
  await userEvent.click(screen.getByRole('checkbox', { name: /approved-user/ }))
  await userEvent.click(
    screen.getByRole('checkbox', { name: '附带 App 宣传海报' })
  )
  await userEvent.click(
    screen.getByRole('button', { name: '载入内测通知模板' })
  )
  await waitFor(() => expect(values().user_ids).toEqual([7]))
})
test('requires confirmation before replacing existing contents and all-user audience', async () => {
  show({
    subject: 'Keep this draft',
    content: 'Keep this body',
    audience: 'all_users',
  })
  await userEvent.click(
    screen.getByRole('checkbox', { name: '附带 App 宣传海报' })
  )
  await userEvent.click(
    screen.getByRole('button', { name: '载入内测通知模板' })
  )
  expect(screen.getByRole('alertdialog')).toBeVisible()
  expect(values().subject).toBe('Keep this draft')
  await userEvent.click(screen.getByRole('button', { name: '替换并载入模板' }))
  await waitFor(() => expect(values().audience).toBe('users'))
  expect(values().user_ids).toEqual([])
  expect(values().subject).toContain('Skivu 内测已开通')
})
test('uploads the bundled poster as an existing mail-image marker, without save/send/quota calls', async () => {
  show()
  await userEvent.click(
    screen.getByRole('button', { name: '载入内测通知模板' })
  )
  await waitFor(() =>
    expect(values().content).toContain(
      `data-mail-image="${'a'.repeat(64)}.jpg"`
    )
  )
  expect(server.upload).toHaveBeenCalledOnce()
  expect(server.upload.mock.calls[0][0]).toMatchObject({
    name: 'Skivu-promo-20261023.jpg',
    type: 'image/jpeg',
  })
  expect(values().content).not.toContain('<img')
  expect(server.save).not.toHaveBeenCalled()
  expect(server.send).not.toHaveBeenCalled()
  expect(server.review).not.toHaveBeenCalled()
})
test('poster upload failure leaves the existing draft untouched', async () => {
  server.upload.mockRejectedValueOnce(new Error('upload failed'))
  show({
    subject: 'Original subject',
    content: 'Original body',
    audience: 'all_users',
  })
  await userEvent.click(
    screen.getByRole('button', { name: '载入内测通知模板' })
  )
  await userEvent.click(screen.getByRole('button', { name: '替换并载入模板' }))
  await waitFor(() => expect(server.error).toHaveBeenCalled())
  expect(values()).toMatchObject({
    subject: 'Original subject',
    content: 'Original body',
    audience: 'all_users',
  })
})
test('rejects invalid notification amounts and unsafe attachment identifiers', async () => {
  for (const value of ['0', '-15', '15.001', '<script>', '1000000']) {
    expect(betaMailAmount(value)).toBeNull()
  }
  expect(skivuBetaTemplate('15.50').subject).toContain('$15.5')
  expect(() => skivuBetaTemplate('15', 'bad.jpg" onclick="alert(1)')).toThrow()
  show()
  await userEvent.clear(screen.getByLabelText('通知中的额度（USD）'))
  await userEvent.type(screen.getByLabelText('通知中的额度（USD）'), '0')
  expect(
    screen.getByRole('button', { name: '载入内测通知模板' })
  ).toBeDisabled()
  expect(server.upload).not.toHaveBeenCalled()
})
