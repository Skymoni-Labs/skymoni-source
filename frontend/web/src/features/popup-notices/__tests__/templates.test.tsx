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

import { api } from '@/lib/api'

import { PopupEditorDialog } from '../components/editor-dialog'
import { PopupTemplateEditor } from '../components/template-editor'
import { PopupTemplateLibrary } from '../components/template-library'
import type { PopupNotice, PopupTemplate } from '../types'

const template: PopupTemplate = {
  id: 1,
  name: '福利模板',
  title: '领取资源',
  content: '## 福利已上线',
  format: 'markdown',
  revision: 1,
  created_at: 1,
  updated_at: 1,
  created_by: 1,
}
const clients: QueryClient[] = []

function show(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>{component}</QueryClientProvider>
  )
}

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items: [template], total: 1 } },
  })
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: template },
  })
  vi.spyOn(api, 'put').mockResolvedValue({
    data: { success: true, data: { ...template, revision: 2 } },
  })
  vi.spyOn(api, 'delete').mockResolvedValue({ data: { success: true } })
})
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.restoreAllMocks()
})

describe('popup templates', () => {
  test('saving the current popup creates a named server template and keeps the unpublished popup open', async () => {
    show(<PopupEditorDialog notice={null} onClose={vi.fn()} />)
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Popup title' }),
      '活动'
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Popup content' }),
      '活动正文'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Save as template' })
    )
    const editor = await screen.findByRole('dialog', {
      name: 'Save popup template',
    })
    expect(
      within(editor).getByRole('textbox', { name: 'Popup title' })
    ).toHaveValue('活动')
    await userEvent.type(
      within(editor).getByRole('textbox', { name: 'Template name' }),
      '活动常用模板'
    )
    await userEvent.click(
      within(editor).getByRole('button', { name: 'Save template' })
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Save popup template' })
      ).not.toBeInTheDocument()
    )
    expect(api.post).toHaveBeenCalledWith(
      '/api/popup-notices/admin/templates',
      expect.objectContaining({
        name: '活动常用模板',
        title: '活动',
        content: '活动正文',
        format: 'auto',
      })
    )
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox', { name: 'Popup content' })).toHaveValue(
      '活动正文'
    )
  })

  test('applying a template asks before replacing content and preserves recipient and delivery settings', async () => {
    const notice: PopupNotice = {
      id: 2,
      title: '原有标题',
      content: '原有正文',
      format: 'text',
      audience: 'guest',
      target_user_id: 0,
      status: 'draft',
      frequency: 'visit',
      duration_days: 7,
      start_at: 0,
      end_at: 0,
      priority: 9,
      revision: 1,
      created_at: 1,
      updated_at: 1,
      published_at: 0,
      created_by: 1,
    }
    show(<PopupEditorDialog notice={notice} onClose={vi.fn()} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Template library' })
    )
    const library = await screen.findByRole('dialog', {
      name: 'Popup template library',
    })
    await userEvent.click(
      await within(library).findByRole('button', { name: 'Use template' })
    )
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Replace popup content with the template?',
    })
    await userEvent.click(
      within(confirm).getByRole('button', { name: 'Cancel' })
    )
    expect(screen.getByRole('textbox', { name: 'Popup title' })).toHaveValue(
      '原有标题'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Template library' })
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Use template' })
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Replace with template' })
    )
    expect(screen.getByRole('textbox', { name: 'Popup title' })).toHaveValue(
      '领取资源'
    )
    expect(screen.getByRole('textbox', { name: 'Popup content' })).toHaveValue(
      '## 福利已上线'
    )
    expect(
      screen.getByRole('combobox', { name: 'Content format' })
    ).toHaveValue('markdown')
    expect(screen.getByRole('combobox', { name: 'Audience' })).toHaveValue(
      'guest'
    )
    expect(
      screen.getByRole('combobox', { name: 'Display frequency' })
    ).toHaveValue('visit')
    expect(
      screen.getByRole('spinbutton', { name: 'Display duration (days)' })
    ).toHaveValue(7)
    expect(screen.getByRole('spinbutton', { name: 'Priority' })).toHaveValue(9)
    expect(api.post).not.toHaveBeenCalled()
  })

  test('a template library beyond the first page loads another page and searches without a quantity cap', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: { items: [template], total: 125 } },
    })
    show(<PopupTemplateLibrary onClose={vi.fn()} onApply={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/api/popup-notices/admin/templates',
        { params: { p: 2, page_size: 20, keyword: '' } }
      )
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search templates' }),
      '福利'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        '/api/popup-notices/admin/templates',
        { params: { p: 1, page_size: 20, keyword: '福利' } }
      )
    )
  })

  test('a failed template save retains the authored content for retry', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { success: false, message: '保存失败' },
    })
    const close = vi.fn()
    show(
      <PopupTemplateEditor
        initial={{
          name: '模板',
          title: '标题',
          content: '<p>内容</p>',
          format: 'html',
        }}
        onClose={close}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save template' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('textbox', { name: 'Popup content' })).toHaveValue(
      '<p>内容</p>'
    )
    expect(close).not.toHaveBeenCalled()
  })

  test('editing and deleting a template send its current revision and require deletion confirmation', async () => {
    const close = vi.fn()
    const editor = show(
      <PopupTemplateEditor template={template} onClose={close} />
    )
    await userEvent.clear(
      screen.getByRole('textbox', { name: 'Template name' })
    )
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Template name' }),
      '新名称'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save template' }))
    await waitFor(() => expect(close).toHaveBeenCalled())
    expect(api.put).toHaveBeenCalledWith(
      '/api/popup-notices/admin/templates/1',
      expect.objectContaining({ name: '新名称', revision: 1 })
    )
    editor.unmount()
    show(<PopupTemplateLibrary onClose={vi.fn()} onApply={vi.fn()} />)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Template actions' })
    )
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete template' })
    )
    expect(api.delete).not.toHaveBeenCalled()
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Delete template?',
    })
    await userEvent.click(
      within(confirm).getByRole('button', { name: 'Delete template' })
    )
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(
        '/api/popup-notices/admin/templates/1',
        { data: { revision: 1 } }
      )
    )
  })

  test('an empty template cannot be saved and displays a validation message', async () => {
    show(<PopupTemplateEditor onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save template' }))
    expect(
      await screen.findByText('Template name is required')
    ).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})
