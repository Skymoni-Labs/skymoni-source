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
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import type { ModelGroupCatalog } from '../../model-groups-api'
import { ModelGroupAssignmentDialog } from '../model-group-assignment-dialog'
import { ModelGroupsSection } from '../model-groups-section'

const catalog: ModelGroupCatalog = {
  version: 'version-1',
  models: ['deepseek-flash', 'gpt-model'],
  groups: [
    {
      name: 'deepseek',
      models: ['deepseek-flash'],
      managed: true,
      ratio: 1,
      description: 'DeepSeek',
      selectable: true,
    },
  ],
}
const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
let client: QueryClient
const previous = useAuthStore.getState().auth.user
beforeEach(() => {
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { ...previous, role: 100 } as NonNullable<typeof previous>,
    },
  }))
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: structuredClone(catalog) },
  })
  vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState((state) => ({
    auth: { ...state.auth, user: previous },
  }))
})
function show(content: React.ReactNode) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>{content}</QueryClientProvider>
    </I18nextProvider>
  )
}

it('selecting one model creates a group with that exact model and version', async () => {
  const user = userEvent.setup()
  show(<ModelGroupsSection />)
  await user.click(
    await screen.findByRole('checkbox', { name: 'Select model deepseek-flash' })
  )
  await user.click(
    screen.getByRole('button', { name: 'Assign models to a group' })
  )
  const dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByLabelText('Group name'), 'new-deepseek')
  await user.click(
    within(dialog).getByRole('button', { name: 'Save model group' })
  )
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      '/api/model-groups',
      expect.objectContaining({
        name: 'new-deepseek',
        models: ['deepseek-flash'],
        mode: 'create',
        expected_version: 'version-1',
        ratio: 1,
        selectable: true,
      })
    )
  )
})

it('changing the model search keeps already selected models', async () => {
  const user = userEvent.setup()
  show(<ModelGroupsSection />)
  await user.click(
    await screen.findByRole('checkbox', { name: 'Select model deepseek-flash' })
  )
  await user.type(screen.getByRole('textbox', { name: 'Search models' }), 'gpt')
  expect(
    screen.queryByRole('checkbox', { name: 'Select model deepseek-flash' })
  ).not.toBeInTheDocument()
  expect(screen.getByText('1 selected')).toBeVisible()
  await user.click(
    screen.getByRole('checkbox', { name: 'Select visible models' })
  )
  expect(screen.getByText('2 selected')).toBeVisible()
})

it('merging selected models sends an additive operation without replacing existing members', async () => {
  const user = userEvent.setup()
  show(
    <ModelGroupAssignmentDialog
      open
      onOpenChange={() => {}}
      models={['gpt-model']}
    />
  )
  await user.click(
    await screen.findByRole('tab', { name: 'Add to existing model group' })
  )
  await user.click(screen.getByRole('combobox', { name: 'Target model group' }))
  await user.click(await screen.findByRole('option', { name: 'deepseek' }))
  await user.click(screen.getByRole('button', { name: 'Save model group' }))
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      '/api/model-groups',
      expect.objectContaining({
        name: 'deepseek',
        mode: 'merge',
        models: ['gpt-model'],
      })
    )
  )
})

it('failed saves preserve the selected models and show a retry path', async () => {
  vi.mocked(api.post).mockRejectedValue(new Error('Conflict'))
  const close = vi.fn()
  const user = userEvent.setup()
  show(
    <ModelGroupAssignmentDialog
      open
      onOpenChange={close}
      models={['deepseek-flash']}
    />
  )
  await user.type(await screen.findByLabelText('Group name'), 'new-group')
  await user.click(screen.getByRole('button', { name: 'Save model group' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your selections are kept'
  )
  expect(screen.getByLabelText('Group name')).toHaveValue('new-group')
  expect(close).not.toHaveBeenCalled()
  expect(
    screen.getByRole('button', { name: 'Refresh group list' })
  ).toBeEnabled()
})

it('an empty model selection cannot create a group', async () => {
  show(<ModelGroupAssignmentDialog open onOpenChange={() => {}} models={[]} />)
  expect(
    await screen.findByRole('button', { name: 'Save model group' })
  ).toBeDisabled()
})

it('saving an empty existing group requires an explicit confirmation', async () => {
  const user = userEvent.setup()
  show(
    <ModelGroupAssignmentDialog
      open
      onOpenChange={() => {}}
      models={[]}
      group={{ ...catalog.groups[0], models: [] }}
    />
  )
  const save = await screen.findByRole('button', { name: 'Save model group' })
  expect(save).toBeDisabled()
  await user.click(
    screen.getByRole('checkbox', {
      name: 'I understand that this group will have no callable models.',
    })
  )
  await user.click(save)
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      '/api/model-groups',
      expect.objectContaining({ name: 'deepseek', mode: 'replace', models: [] })
    )
  )
})

it('a failed group-list request displays a retry and loads the models after recovery', async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error('Unavailable'))
  const user = userEvent.setup()
  show(<ModelGroupsSection />)
  await user.click(await screen.findByRole('button', { name: 'Retry' }))
  expect(
    await screen.findByRole('checkbox', { name: 'Select model deepseek-flash' })
  ).toBeVisible()
})

it('a regular administrator can inspect groups but cannot modify model access', async () => {
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { ...state.auth.user, role: 10 } as NonNullable<typeof previous>,
    },
  }))
  show(<ModelGroupsSection />)
  expect(
    await screen.findByRole('checkbox', { name: 'Select model deepseek-flash' })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(
    screen.queryByRole('button', { name: 'Edit model group deepseek' })
  ).not.toBeInTheDocument()
})
