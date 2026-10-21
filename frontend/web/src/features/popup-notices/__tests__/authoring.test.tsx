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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { PopupEditorDialog } from '../components/editor-dialog'
import type { PopupNotice } from '../types'

const api = vi.hoisted(() => ({
  savePopupNotice: vi.fn(),
  setPopupNoticeState: vi.fn(),
}))
const users = vi.hoisted(() => ({ searchUsers: vi.fn(), getUser: vi.fn() }))
vi.mock('../api', () => api)
vi.mock('@/features/users/api', () => users)
const clients: QueryClient[] = []
const saved: PopupNotice = {
  id: 12,
  title: 'Welcome',
  content: 'Hello users',
  format: 'auto',
  audience: 'all_users',
  target_user_id: 0,
  status: 'draft',
  frequency: 'once',
  duration_days: 0,
  start_at: 0,
  end_at: 0,
  priority: 0,
  revision: 1,
  created_at: 0,
  updated_at: 0,
  published_at: 0,
  created_by: 1,
}

function renderEditor(notice: PopupNotice | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <PopupEditorDialog notice={notice} onClose={onClose} />
    </QueryClientProvider>
  )
  return onClose
}

async function fillContent() {
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Popup title' }),
    'Welcome'
  )
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Popup content' }),
    'Hello users'
  )
}

beforeEach(() => {
  api.savePopupNotice.mockReset().mockResolvedValue(saved)
  api.setPopupNoticeState
    .mockReset()
    .mockResolvedValue({ ...saved, status: 'published' })
  users.searchUsers.mockReset().mockResolvedValue({
    success: true,
    data: {
      items: [{ id: 20, username: 'alice', display_name: 'Alice' }],
      total: 1,
    },
  })
  users.getUser.mockReset().mockResolvedValue({
    success: true,
    data: { id: 20, username: 'alice', display_name: 'Alice' },
  })
})
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
})

describe('popup authoring', () => {
  test('an empty editor fills an editable Markdown template and previews it without saving or publishing', async () => {
    renderEditor()
    await userEvent.click(
      screen.getByRole('button', { name: 'Use announcement template' })
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Popup title' })).toHaveValue(
      'Welcome to skymoni'
    )
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', {
        name: 'Popup content',
      }).value
    ).toContain('### Explore the Model Square')
    expect(
      screen.getByRole('combobox', { name: 'Content format' })
    ).toHaveValue('markdown')
    expect(
      screen.getByRole('heading', { name: 'Check your wallet' })
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const preview = await screen.findByRole('dialog', {
      name: 'Welcome to skymoni',
    })
    expect(
      within(preview).getByRole('heading', { name: 'Explore the Model Square' })
    ).toBeInTheDocument()
    expect(
      within(preview).getByRole('heading', { name: 'Need help?' })
    ).toBeInTheDocument()
    await userEvent.click(
      within(preview).getByRole('button', { name: 'Close preview' })
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Popup title' }),
      ' · Edited'
    )
    expect(screen.getByRole('textbox', { name: 'Popup title' })).toHaveValue(
      'Welcome to skymoni · Edited'
    )
    expect(api.savePopupNotice).not.toHaveBeenCalled()
    expect(api.setPopupNoticeState).not.toHaveBeenCalled()
  })

  test.each([
    { title: 'Keep my title', content: '' },
    { title: '', content: 'Keep my content' },
  ])(
    'existing content $title$content requires confirmation and cancel keeps it unchanged',
    async (content) => {
      renderEditor({ ...saved, ...content, format: 'text' })
      await userEvent.click(
        screen.getByRole('button', { name: 'Use announcement template' })
      )
      const confirmation = await screen.findByRole('alertdialog', {
        name: 'Replace popup content with the template?',
      })
      expect(
        within(confirmation).getByText(
          'This replaces the title and content. Your audience, frequency, and display duration will stay the same.'
        )
      ).toBeInTheDocument()
      await userEvent.click(
        within(confirmation).getByRole('button', { name: 'Cancel' })
      )
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Popup title' })).toHaveValue(
        content.title
      )
      expect(
        screen.getByRole('textbox', { name: 'Popup content' })
      ).toHaveValue(content.content)
      expect(
        screen.getByRole('combobox', { name: 'Content format' })
      ).toHaveValue('text')
      expect(api.savePopupNotice).not.toHaveBeenCalled()
      expect(api.setPopupNoticeState).not.toHaveBeenCalled()
    }
  )

  test('confirming template replacement preserves the selected audience, frequency, duration and priority', async () => {
    renderEditor({
      ...saved,
      audience: 'guest',
      frequency: 'daily',
      duration_days: 14,
      priority: 5,
      format: 'html',
    })
    await userEvent.click(
      screen.getByRole('button', { name: 'Use announcement template' })
    )
    const confirmation = await screen.findByRole('alertdialog', {
      name: 'Replace popup content with the template?',
    })
    await userEvent.click(
      within(confirmation).getByRole('button', {
        name: 'Replace with template',
      })
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Popup title' })).toHaveValue(
      'Welcome to skymoni'
    )
    expect(screen.getByRole('combobox', { name: 'Audience' })).toHaveValue(
      'guest'
    )
    expect(
      screen.getByRole('combobox', { name: 'Display frequency' })
    ).toHaveValue('daily')
    expect(
      screen.getByRole('spinbutton', { name: 'Display duration (days)' })
    ).toHaveValue(14)
    expect(screen.getByRole('spinbutton', { name: 'Priority' })).toHaveValue(5)
    expect(
      screen.getByRole('combobox', { name: 'Content format' })
    ).toHaveValue('markdown')
    expect(api.savePopupNotice).not.toHaveBeenCalled()
    expect(api.setPopupNoticeState).not.toHaveBeenCalled()
  })

  test('creating and previewing a popup does not publish or save it', async () => {
    renderEditor()
    await fillContent()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const preview = await screen.findByRole('dialog', { name: 'Welcome' })
    expect(
      within(preview).getByText(
        'Only visible to you. This preview does not publish the popup.'
      )
    ).toBeInTheDocument()
    expect(api.savePopupNotice).not.toHaveBeenCalled()
    expect(api.setPopupNoticeState).not.toHaveBeenCalled()
  })

  test('saving a seven-day draft stores its duration without starting the display period', async () => {
    renderEditor()
    await fillContent()
    await userEvent.type(
      screen.getByRole('spinbutton', { name: 'Display duration (days)' }),
      '7'
    )
    expect(
      screen.queryByLabelText('Start time (optional)')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('End time (optional)')
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(api.savePopupNotice).toHaveBeenCalledWith(
        expect.objectContaining({
          duration_days: 7,
          start_at: 0,
          end_at: 0,
          status: 'draft',
        }),
        undefined
      )
    )
    expect(api.setPopupNoticeState).not.toHaveBeenCalled()
  })

  test('clearing a finite duration leaves an empty input and saves unlimited display', async () => {
    renderEditor({ ...saved, duration_days: 7 })
    const duration = screen.getByRole('spinbutton', {
      name: 'Display duration (days)',
    })
    expect(duration).toHaveValue(7)
    await userEvent.clear(duration)
    expect(duration).toHaveValue(null)
    expect(duration).toHaveAttribute('placeholder', 'Unlimited (leave blank)')
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(api.savePopupNotice).toHaveBeenCalledWith(
        expect.objectContaining({ duration_days: 0, start_at: 0, end_at: 0 }),
        12
      )
    )
  })

  test.each(['0', '-1', '3651', '1.5'])(
    'duration %s displays validation and prevents saving or publishing',
    async (value) => {
      renderEditor(saved)
      const duration = screen.getByRole('spinbutton', {
        name: 'Display duration (days)',
      })
      await userEvent.type(duration, value)
      await userEvent.click(
        screen.getByRole('button', { name: 'Save and publish' })
      )
      expect(
        await screen.findByText(
          'Enter a whole number of days from 1 to 3650, or leave blank for unlimited display.'
        )
      ).toBeInTheDocument()
      expect(duration).toHaveAttribute('aria-invalid', 'true')
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(api.savePopupNotice).not.toHaveBeenCalled()
    }
  )

  test('editing a legacy finite window preserves its rounded-up duration on save', async () => {
    renderEditor({ ...saved, start_at: 1000, end_at: 130600 })
    expect(
      screen.getByRole('spinbutton', { name: 'Display duration (days)' })
    ).toHaveValue(2)
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(api.savePopupNotice).toHaveBeenCalledWith(
        expect.objectContaining({ duration_days: 2, start_at: 0, end_at: 0 }),
        12
      )
    )
  })

  test('saving an existing published popup makes an atomic draft with its original revision', async () => {
    renderEditor({ ...saved, status: 'published', revision: 4 })
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(api.savePopupNotice).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'draft',
          revision: 4,
          audience: 'all_users',
        }),
        12
      )
    )
    expect(api.setPopupNoticeState).not.toHaveBeenCalled()
  })

  test('publishing requires confirmation of the selected guest audience and then publishes the saved draft', async () => {
    renderEditor()
    await fillContent()
    await userEvent.type(
      screen.getByRole('spinbutton', { name: 'Display duration (days)' }),
      '7'
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Audience' }),
      'guest'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Save and publish' })
    )
    const confirmation = await screen.findByRole('alertdialog', {
      name: 'Publish popup?',
    })
    expect(
      within(confirmation).getByText('Visitors who are not signed in')
    ).toBeInTheDocument()
    expect(within(confirmation).getByText('7 days')).toBeInTheDocument()
    expect(api.savePopupNotice).not.toHaveBeenCalled()
    await userEvent.click(
      within(confirmation).getByRole('button', { name: 'Publish' })
    )
    await waitFor(() =>
      expect(api.setPopupNoticeState).toHaveBeenCalledWith(12, 'published')
    )
    expect(api.savePopupNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'draft',
        audience: 'guest',
        target_user_id: 0,
        duration_days: 7,
        start_at: 0,
        end_at: 0,
      }),
      undefined
    )
  })

  test('a specific-user popup requires choosing a recipient before it can save', async () => {
    renderEditor()
    await fillContent()
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Audience' }),
      'user'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Select a recipient')).toBeInTheDocument()
    expect(api.savePopupNotice).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('combobox', { name: 'Recipient' }))
    await userEvent.click(
      await screen.findByRole('option', { name: 'alice · Alice (#20)' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(api.savePopupNotice).toHaveBeenCalledWith(
        expect.objectContaining({ audience: 'user', target_user_id: 20 }),
        undefined
      )
    )
  })

  test('clearing priority does not restore the default zero while typing a replacement', async () => {
    renderEditor(saved)
    const priority = screen.getByRole('spinbutton', { name: 'Priority' })
    await userEvent.clear(priority)
    expect(priority).toHaveValue(null)
    await userEvent.type(priority, '12')
    expect(priority).toHaveValue(12)
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(api.savePopupNotice).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 12 }),
        12
      )
    )
  })

  test('empty content displays validation and prevents publishing', async () => {
    renderEditor()
    await userEvent.click(
      screen.getByRole('button', { name: 'Save and publish' })
    )
    expect(
      await screen.findByText('Popup title is required')
    ).toBeInTheDocument()
    expect(screen.getByText('Popup content is required')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(api.savePopupNotice).not.toHaveBeenCalled()
  })

  test('saving failure keeps the editor open with the content recoverable', async () => {
    api.savePopupNotice.mockRejectedValue(new Error('Save failed'))
    const onClose = renderEditor()
    await fillContent()
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(api.savePopupNotice).toHaveBeenCalledOnce())
    expect(screen.getByRole('textbox', { name: 'Popup content' })).toHaveValue(
      'Hello users'
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})
