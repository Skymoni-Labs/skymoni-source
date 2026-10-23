/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { MailComposer } from '../components/composer'
import { MailDetailDialog } from '../components/detail-dialog'
import { skivuBetaTemplate } from '../lib/skivu-beta-template'
import type { MailCampaign } from '../types'

const server = vi.hoisted(() => ({
  previewMail: vi.fn(),
  createMailDraft: vi.fn(),
  getMailDraftInput: vi.fn(),
  getMailTemplateInput: vi.fn(),
  updateMailDraft: vi.fn(),
  getMail: vi.fn(),
  mailRecipients: vi.fn(),
  changeMailState: vi.fn(),
  scheduleMail: vi.fn(),
}))
const users = vi.hoisted(() => ({ searchUsers: vi.fn(), getUser: vi.fn() }))
vi.mock('../api', () => server)
vi.mock('@/features/users/api', () => users)
const clients: QueryClient[] = []
const draft: MailCampaign = {
  id: 12,
  subject: 'Notice',
  content: 'Hello',
  html: '<p>Hello</p>',
  format: 'text',
  audience: 'all_users',
  status: 'draft',
  send_at: 0,
  schedule_error: '',
  recipient_count: 2,
  skipped_count: 1,
  created_at: 1700000000,
  counts: { pending: 2 },
}

function renderMail(element: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>
  )
}

beforeEach(() => {
  server.createMailDraft.mockResolvedValue(draft)
  server.getMailDraftInput.mockResolvedValue({
    subject: 'Notice',
    content: 'Hello',
    format: 'text',
    audience: 'emails',
    user_ids: [],
    emails: ['reader@example.invalid'],
  })
  server.updateMailDraft.mockResolvedValue(draft)
  server.getMailTemplateInput.mockResolvedValue({
    request_key: 'original-request-key',
    subject: 'Sent notice',
    content: 'Original body',
    format: 'text',
    audience: 'emails',
    user_ids: [],
    emails: ['reader@example.invalid'],
  })
  server.previewMail.mockResolvedValue('<p>Preview body</p>')
  server.getMail.mockResolvedValue(draft)
  server.mailRecipients.mockResolvedValue([
    {
      id: 21,
      user_id: 5,
      username: 'alice',
      email: 'alice@example.invalid',
      status: 'pending',
      result: '',
    },
  ])
  server.changeMailState.mockResolvedValue(undefined)
  users.searchUsers.mockResolvedValue({
    success: true,
    data: { items: [{ id: 5, username: 'alice', display_name: 'Alice' }] },
  })
  users.getUser.mockResolvedValue({
    success: true,
    data: { id: 5, username: 'alice', display_name: 'Alice' },
  })
})
afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
  vi.clearAllMocks()
})

async function fillMail() {
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Email subject' }),
    'Notice'
  )
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Email content' }),
    'Hello'
  )
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Recipients' }),
    'all_users'
  )
}

test('a prepared built-in template waits for recipients and never saves or sends on load', async () => {
  const onContentChange = vi.fn()
  renderMail(
    <MailComposer
      initialValues={{
        ...skivuBetaTemplate('15'),
        format: 'html',
        audience: 'users',
        user_ids: [],
        recipient_emails: '',
      }}
      onSaved={vi.fn()}
      onContentChange={onContentChange}
    />
  )
  expect(
    await screen.findByRole('textbox', { name: 'Email subject' })
  ).toHaveValue('Skivu 内测已开通｜赠送 $15 App 专属额度')
  expect(onContentChange).toHaveBeenCalledWith(true)
  expect(server.getMailTemplateInput).not.toHaveBeenCalled()
  await userEvent.click(
    screen.getByRole('button', { name: 'Save email draft' })
  )
  expect(await screen.findByText('Select at least one user')).toBeVisible()
  expect(server.createMailDraft).not.toHaveBeenCalled()
  expect(server.changeMailState).not.toHaveBeenCalled()
})

test('saving a prepared template creates a new draft with selected recipients', async () => {
  const onSaved = vi.fn()
  renderMail(
    <MailComposer
      initialValues={{
        ...skivuBetaTemplate('12.5'),
        format: 'html',
        audience: 'users',
        user_ids: [5],
        recipient_emails: '',
      }}
      onSaved={onSaved}
    />
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Save email draft' })
  )
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(draft))
  expect(server.createMailDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: expect.stringContaining('$12.5'),
      audience: 'users',
      user_ids: [5],
      emails: [],
      format: 'html',
    })
  )
  expect(server.updateMailDraft).not.toHaveBeenCalled()
  expect(server.changeMailState).not.toHaveBeenCalled()
})

test('saving a draft freezes the request and never sends email', async () => {
  const onSaved = vi.fn()
  renderMail(<MailComposer onSaved={onSaved} />)
  await fillMail()
  await userEvent.click(
    screen.getByRole('button', { name: 'Save email draft' })
  )
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(draft))
  expect(server.createMailDraft.mock.calls[0][0]).toMatchObject({
    subject: 'Notice',
    content: 'Hello',
    audience: 'all_users',
    user_ids: [],
  })
  expect(server.changeMailState).not.toHaveBeenCalled()
})

test('batch selected user IDs are saved into the draft without sending', async () => {
  users.searchUsers.mockResolvedValue({
    success: true,
    data: {
      items: [
        {
          id: 5,
          username: 'alice',
          display_name: 'Alice',
          email: 'alice@example.invalid',
          status: 1,
        },
        {
          id: 6,
          username: 'bob',
          display_name: 'Bob',
          email: 'bob@example.invalid',
          status: 1,
        },
      ],
      total: 2,
      page: 1,
      page_size: 50,
    },
  })
  renderMail(<MailComposer onSaved={vi.fn()} />)
  await fillMail()
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Recipients' }),
    'users'
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '本页全选' })).toBeEnabled()
  )
  await userEvent.click(screen.getByRole('button', { name: '本页全选' }))
  await userEvent.click(
    screen.getByRole('button', { name: 'Save email draft' })
  )
  await waitFor(() => expect(server.createMailDraft).toHaveBeenCalled())
  expect(server.createMailDraft.mock.calls[0][0]).toMatchObject({
    audience: 'users',
    user_ids: [5, 6],
    emails: [],
  })
  expect(server.changeMailState).not.toHaveBeenCalled()
})

test('reopening and editing a draft updates that draft and preserves its recipients', async () => {
  const onSaved = vi.fn()
  const onCancelEdit = vi.fn()
  renderMail(
    <MailComposer draftId={12} onSaved={onSaved} onCancelEdit={onCancelEdit} />
  )
  const subject = screen.getByRole('textbox', { name: 'Email subject' })
  await waitFor(() => expect(subject).toHaveValue('Notice'))
  expect(
    screen.getByRole('textbox', { name: 'Recipient email addresses' })
  ).toHaveValue('reader@example.invalid')
  await userEvent.clear(subject)
  await userEvent.type(subject, 'Updated notice')
  await userEvent.click(
    screen.getByRole('button', { name: 'Update email draft' })
  )
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(draft))
  expect(server.updateMailDraft).toHaveBeenCalledWith(
    12,
    expect.objectContaining({
      subject: 'Updated notice',
      content: 'Hello',
      audience: 'emails',
      emails: ['reader@example.invalid'],
      user_ids: [],
    })
  )
  expect(onCancelEdit).toHaveBeenCalledOnce()
  expect(server.createMailDraft).not.toHaveBeenCalled()
  expect(server.changeMailState).not.toHaveBeenCalled()
})

test('a reused sent template saves edited content into a new draft', async () => {
  const onSaved = vi.fn()
  renderMail(<MailComposer templateId={18} onSaved={onSaved} />)
  const subject = screen.getByRole('textbox', { name: 'Email subject' })
  await waitFor(() => expect(subject).toHaveValue('Sent notice'))
  expect(server.getMailTemplateInput).toHaveBeenCalledWith(18)
  const content = screen.getByRole('textbox', { name: 'Email content' })
  await userEvent.clear(subject)
  await userEvent.type(subject, 'New notice')
  await userEvent.clear(content)
  await userEvent.type(content, 'Revised body')
  await userEvent.click(
    screen.getByRole('button', { name: 'Save email draft' })
  )
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(draft))
  expect(server.createMailDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: 'New notice',
      content: 'Revised body',
      audience: 'emails',
      emails: ['reader@example.invalid'],
      user_ids: [],
    })
  )
  expect(server.createMailDraft.mock.calls[0][0].request_key).not.toBe(
    'original-request-key'
  )
  expect(server.getMailDraftInput).not.toHaveBeenCalled()
  expect(server.updateMailDraft).not.toHaveBeenCalled()
  expect(server.changeMailState).not.toHaveBeenCalled()
})

test('a sent-mail detail offers template reuse without initiating another send', async () => {
  server.getMail.mockResolvedValueOnce({
    ...draft,
    id: 18,
    status: 'completed',
  })
  const onReuseTemplate = vi.fn()
  renderMail(
    <MailDetailDialog
      id={18}
      smtpReady
      onClose={vi.fn()}
      onReuseTemplate={onReuseTemplate}
    />
  )
  await userEvent.click(
    await screen.findByRole('button', { name: 'Reuse template' })
  )
  expect(onReuseTemplate).toHaveBeenCalledWith(18)
  expect(
    screen.queryByRole('button', { name: 'Send email' })
  ).not.toBeInTheDocument()
  expect(server.changeMailState).not.toHaveBeenCalled()
})

test('selected users require a recipient before a draft can be saved', async () => {
  renderMail(<MailComposer onSaved={vi.fn()} />)
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Recipients' }),
    'users'
  )
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Email subject' }),
    'Notice'
  )
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Email content' }),
    'Hello'
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Save email draft' })
  )
  expect(await screen.findByText('Select at least one user')).toBeVisible()
  expect(server.createMailDraft).not.toHaveBeenCalled()
})

test('an arbitrary email address can be saved without selecting a site user', async () => {
  const onSaved = vi.fn()
  renderMail(<MailComposer onSaved={onSaved} />)
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Email subject' }),
    'Test'
  )
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Email content' }),
    'Hello'
  )
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Recipient email addresses' }),
    '2924128981@qq.com'
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Save email draft' })
  )
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(server.createMailDraft.mock.calls[0][0]).toMatchObject({
    audience: 'emails',
    emails: ['2924128981@qq.com'],
    user_ids: [],
  })
  expect(server.changeMailState).not.toHaveBeenCalled()
})

test('saving blocks duplicate clicks and restores inputs after a failure', async () => {
  let fail: (reason: Error) => void = () => undefined
  server.createMailDraft.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject
      })
  )
  renderMail(<MailComposer onSaved={vi.fn()} />)
  await fillMail()
  await userEvent.click(
    screen.getByRole('button', { name: 'Save email draft' })
  )
  expect(screen.getByRole('textbox', { name: 'Email content' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  fail(new Error('Fixture failure'))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Save email draft' })
    ).toBeEnabled()
  )
  expect(screen.getByRole('textbox', { name: 'Email content' })).toHaveValue(
    'Hello'
  )
})

test('send requires a second confirmation showing the frozen recipient count', async () => {
  renderMail(<MailDetailDialog id={12} smtpReady onClose={vi.fn()} />)
  await userEvent.click(
    await screen.findByRole('button', { name: 'Send email' })
  )
  expect(await screen.findByText('Send this email?')).toBeVisible()
  expect(screen.getByText('2 recipients')).toBeVisible()
  expect(server.changeMailState).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm send' }))
  await waitFor(() =>
    expect(server.changeMailState).toHaveBeenCalledWith(12, 'send')
  )
})

test('missing SMTP settings disables sending but preserves preview and recipients', async () => {
  renderMail(<MailDetailDialog id={12} smtpReady={false} onClose={vi.fn()} />)
  expect(
    await screen.findByRole('button', { name: 'Send email' })
  ).toBeDisabled()
  expect(await screen.findByText('alice@example.invalid')).toBeVisible()
})

test('server schedule uses Beijing time and never queues an immediate send', async () => {
  renderMail(<MailDetailDialog id={12} smtpReady onClose={vi.fn()} />)
  const field = await screen.findByLabelText('定时发送 · 北京时间')
  const next = new Date(Date.now() + 86400_000)
  const local = new Date(next.getTime() + 8 * 3600_000)
    .toISOString()
    .slice(0, 16)
  fireEvent.change(field, { target: { value: local } })
  await userEvent.click(screen.getByRole('button', { name: '定时发送' }))
  expect(await screen.findByText('确认定时发送这封邮件？')).toBeVisible()
  expect(server.scheduleMail).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '确认定时发送' }))
  await waitFor(() =>
    expect(server.scheduleMail).toHaveBeenCalledWith(
      12,
      Math.floor(new Date(local + ':00+08:00').getTime() / 1000)
    )
  )
  expect(server.changeMailState).not.toHaveBeenCalled()
})

test('scheduled mailing displays its saved time and cannot send early', async () => {
  server.getMail.mockResolvedValue({
    ...draft,
    status: 'scheduled',
    send_at: 1791853200,
  })
  renderMail(<MailDetailDialog id={12} smtpReady onClose={vi.fn()} />)
  expect(await screen.findByText(/2026\/10\/13 09:00:00/)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Send email' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel mailing' })).toBeVisible()
})

test('completed emails cannot be sent again and unconfirmed results explain the risk', async () => {
  server.getMail.mockResolvedValue({
    ...draft,
    status: 'completed',
    counts: { uncertain: 1 },
  })
  server.mailRecipients.mockResolvedValue([
    {
      id: 21,
      user_id: 5,
      username: 'alice',
      email: 'alice@example.invalid',
      status: 'uncertain',
      result: 'delivery_unknown',
    },
  ])
  renderMail(<MailDetailDialog id={12} smtpReady onClose={vi.fn()} />)
  expect(await screen.findByText('Delivery unconfirmed')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Send email' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByText(
      'Delivery may have succeeded. Check with the recipient before sending again.'
    )
  ).toBeVisible()
})
