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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { ApiKey } from '../../types'

const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { api } = await import('@/lib/api')
const { ApiKeysProvider } = await import('../api-keys-provider')
const { ApiKeysMutateDrawer } = await import('../api-keys-mutate-drawer')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: { translation: {} },
    zhCN: {
      translation: {
        Default: '默认',
        'moni-token': 'moni-token',
        'Per Request': 'moni计费',
      },
    },
  },
})

type ApiMethod = (url: string, data?: unknown) => Promise<{ data: unknown }>
type MockableApi = {
  get: ApiMethod
  post: ApiMethod
  put: ApiMethod
}
type RenderedDrawer = {
  queryClient: InstanceType<typeof QueryClient>
}

const apiClient = api as unknown as MockableApi
const originalGet = apiClient.get
const originalPost = apiClient.post
const originalPut = apiClient.put
let renderedDrawer: RenderedDrawer | null = null

const existingKey: ApiKey = {
  id: 12,
  name: 'existing-key',
  key: 'sk-existing',
  status: 1,
  remain_quota: 100000,
  used_quota: 0,
  unlimited_quota: true,
  expired_time: -1,
  created_time: 1,
  accessed_time: 1,
  group: 'typesafe',
  auto_groups: null,
  cross_group_retry: false,
  model_limits_enabled: false,
  model_limits: '',
  allow_ips: '',
}

function installApiFixtures(
  createdPayloads: Array<Record<string, unknown>>,
  updatedPayloads: Array<Record<string, unknown>> = []
) {
  apiClient.get = async (url) => {
    if (url.startsWith('/api/user/models')) {
      const group = new URL(url, 'https://skymoni.test').searchParams.get(
        'group'
      )
      const byGroup: Record<string, string[]> = {
        default: ['gpt-6-astra'],
        vip: ['vip-model'],
        typesafe: ['jev-latest'],
        deepseek: ['deepseek-flash', 'deepseek-flash-low', 'deepseek-v4-pro'],
        auto: ['gpt-6-astra', 'vip-model'],
      }
      return {
        data: {
          success: true,
          data: group ? byGroup[group] || [] : Object.values(byGroup).flat(),
        },
      }
    }
    switch (url) {
      case '/api/status':
        return { data: { data: { default_use_auto_group: true } } }
      case '/api/user/self/groups':
        return {
          data: {
            success: true,
            data: {
              auto: { desc: 'Automatic routing', ratio: 'auto' },
              default: { desc: 'Standard access', ratio: 1 },
              metered: { desc: 'metered', ratio: 1 },
              'per-request': { desc: 'per-request', ratio: 1 },
              typesafe: { desc: 'typesafe', ratio: 1 },
              vip: { desc: 'Priority access', ratio: 2 },
              deepseek: { desc: 'DeepSeek only', ratio: 1 },
            },
          },
        }
      case '/api/token/auto-groups':
        return {
          data: {
            success: true,
            data: { groups: ['vip', 'default'], max_count: 3 },
          },
        }
      case '/api/token/12':
        return { data: { success: true, data: existingKey } }
      default:
        throw new Error(`Unexpected GET ${url}`)
    }
  }
  apiClient.post = async (url, data) => {
    expect(url).toBe('/api/token/')
    expect(data && typeof data === 'object').toBeTruthy()
    createdPayloads.push(data as Record<string, unknown>)
    return { data: { success: true, data: {} } }
  }
  apiClient.put = async (url, data) => {
    expect(url).toBe('/api/token/')
    updatedPayloads.push(data as Record<string, unknown>)
    return { data: { success: true, data: existingKey } }
  }
}

async function renderDrawer(currentRow?: ApiKey): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const freshAt = Date.now() + 60_000
  queryClient.setQueryData(
    ['status'],
    { default_use_auto_group: true },
    { updatedAt: freshAt }
  )
  queryClient.setQueryData(
    ['user-models'],
    {
      success: true,
      data: [
        'gpt-6-astra',
        'jev-latest',
        'deepseek-flash',
        'deepseek-flash-low',
        'deepseek-v4-pro',
        'vip-model',
      ],
    },
    { updatedAt: freshAt }
  )
  queryClient.setQueryData(
    ['user-groups'],
    {
      success: true,
      data: {
        auto: { desc: 'Automatic routing', ratio: 'auto' },
        default: { desc: 'Standard access', ratio: 1 },
        metered: { desc: 'metered', ratio: 1 },
        'per-request': { desc: 'per-request', ratio: 1 },
        typesafe: { desc: 'typesafe', ratio: 1 },
        vip: { desc: 'Priority access', ratio: 2 },
        deepseek: { desc: 'DeepSeek only', ratio: 1 },
      },
    },
    { updatedAt: freshAt }
  )
  queryClient.setQueryData(
    ['token-auto-groups'],
    {
      success: true,
      data: { groups: ['vip', 'default'], max_count: 3 },
    },
    { updatedAt: freshAt }
  )
  renderedDrawer = { queryClient }

  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ApiKeysProvider>
          <ApiKeysMutateDrawer
            open
            onOpenChange={() => undefined}
            currentRow={currentRow}
          />
        </ApiKeysProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
  await waitFor(
    () => {
      const saveButton = findButton('Save changes', false)
      expect(saveButton).toBeEnabled()
    },
    { timeout: 1500 }
  )
}

function findButton(text: string, required: true): HTMLButtonElement
function findButton(text: string, required: false): HTMLButtonElement | null
function findButton(text: string, required = true): HTMLButtonElement | null {
  const button = screen
    .queryAllByRole<HTMLButtonElement>('button')
    .find((candidate) => candidate.textContent?.includes(text))
  if (required && !button) {
    throw new Error(`Expected button containing "${text}"`)
  }
  return button ?? null
}

function getControlByLabel(labelText: 'Name' | 'Quantity'): HTMLInputElement
function getControlByLabel(labelText: 'API model group'): HTMLButtonElement
function getControlByLabel(labelText: 'Auto group order'): HTMLElement
function getControlByLabel(labelText: string): HTMLElement {
  const label = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
    (candidate) => candidate.textContent?.trim() === labelText
  )
  if (!label) {
    throw new Error(`Expected label "${labelText}"`)
  }

  const control =
    label.control ??
    label
      .closest('[data-slot="form-item"]')
      ?.querySelector<HTMLElement>(
        '[data-slot="form-control"], input, textarea, button[role="combobox"], [role="group"]'
      )
  if (!control) {
    throw new Error(`Expected control for label "${labelText}"`)
  }
  return control
}

function changeInput(input: HTMLInputElement, value: string): void {
  fireEvent.input(input, { target: { value } })
}

function selectComboboxOption(
  trigger: HTMLButtonElement,
  optionDescription: string
): void {
  fireEvent.click(trigger)
  const option = [
    ...document.querySelectorAll<HTMLElement>('[data-slot="command-item"]'),
  ].find((candidate) => candidate.textContent?.includes(optionDescription))
  if (!option) {
    throw new Error(`Expected option containing "${optionDescription}"`)
  }
  fireEvent.click(option)
}

afterEach(async () => {
  await i18n.changeLanguage('en')
  apiClient.get = originalGet
  apiClient.post = originalPost
  apiClient.put = originalPut
  localStorage.clear()
  if (renderedDrawer) {
    renderedDrawer.queryClient.clear()
    renderedDrawer = null
  }
})

describe('API keys mutate drawer Auto group integration', () => {
  test('reordering the same Auto groups preserves existing model restrictions', async () => {
    const updates: Array<Record<string, unknown>> = []
    installApiFixtures([], updates)
    const get = apiClient.get
    apiClient.get = async (url) =>
      url === '/api/token/12'
        ? {
            data: {
              success: true,
              data: {
                ...existingKey,
                group: 'auto',
                auto_groups: ['vip', 'default'],
                model_limits_enabled: true,
                model_limits: 'vip-model',
              },
            },
          }
        : get(url)
    await renderDrawer(existingKey)
    fireEvent.click(screen.getByRole('button', { name: 'Move default up' }))
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]).toMatchObject({
      auto_groups: ['default', 'vip'],
      model_limits_enabled: true,
      model_limits: 'vip-model',
    })
  })

  test('changing an edited key group clears previous model restrictions before saving the new group', async () => {
    const updates: Array<Record<string, unknown>> = []
    installApiFixtures([], updates)
    const get = apiClient.get
    apiClient.get = async (url) =>
      url === '/api/token/12'
        ? {
            data: {
              success: true,
              data: {
                ...existingKey,
                model_limits_enabled: true,
                model_limits: 'jev-latest',
              },
            },
          }
        : get(url)
    await renderDrawer(existingKey)
    selectComboboxOption(getControlByLabel('API model group'), 'DeepSeek only')
    fireEvent.click(findButton('Advanced Settings', true))
    const input = screen.getByPlaceholderText(/Select models/)
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.setup().click(input)
    expect(
      screen.queryByRole('option', { name: 'jev-latest' })
    ).not.toBeInTheDocument()
    await userEvent
      .setup()
      .click(await screen.findByRole('option', { name: 'deepseek-flash' }))
    await userEvent.setup().keyboard('{Escape}')
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]).toMatchObject({
      group: 'deepseek',
      model_limits_enabled: true,
      model_limits: 'deepseek-flash',
    })
  })

  test('editing a key preserves an existing restriction instead of silently widening its access', async () => {
    const updates: Array<Record<string, unknown>> = []
    installApiFixtures([], updates)
    const get = apiClient.get
    apiClient.get = async (url) =>
      url === '/api/token/12'
        ? {
            data: {
              success: true,
              data: {
                ...existingKey,
                model_limits_enabled: true,
                model_limits: 'jev-latest',
              },
            },
          }
        : get(url)
    await renderDrawer(existingKey)
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]).toMatchObject({
      group: 'typesafe',
      model_limits_enabled: true,
      model_limits: 'jev-latest',
    })
  })

  test('an unavailable stored model blocks saving until the user reviews the restriction', async () => {
    const updates: Array<Record<string, unknown>> = []
    installApiFixtures([], updates)
    const get = apiClient.get
    apiClient.get = async (url) =>
      url === '/api/token/12'
        ? {
            data: {
              success: true,
              data: {
                ...existingKey,
                model_limits_enabled: true,
                model_limits: 'removed-model',
              },
            },
          }
        : get(url)
    await renderDrawer(existingKey)
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    fireEvent.click(findButton('Save changes', true))
    expect(
      await screen.findByText(
        'Selected models are unavailable in this group. Remove them or choose another group.'
      )
    ).toBeVisible()
    expect(updates).toHaveLength(0)
  })

  test('a failed group model request disables saving and retries without showing another group models', async () => {
    installApiFixtures([])
    const get = apiClient.get
    let unavailable = true
    apiClient.get = async (url) =>
      url === '/api/user/models?group=deepseek' && unavailable
        ? {
            data: {
              success: false,
              message: 'Group model request unavailable',
            },
          }
        : get(url)
    await renderDrawer()
    selectComboboxOption(getControlByLabel('API model group'), 'DeepSeek only')
    fireEvent.click(findButton('Advanced Settings', true))
    expect(await screen.findByText('Failed to load group models')).toBeVisible()
    expect(findButton('Save changes', true)).toBeDisabled()
    expect(screen.getByPlaceholderText(/Select models/)).toBeDisabled()
    unavailable = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    await userEvent.setup().click(screen.getByPlaceholderText(/Select models/))
    expect(
      await screen.findByRole('option', { name: 'deepseek-flash' })
    ).toBeVisible()
    expect(
      screen.queryByRole('option', { name: 'gpt-6-astra' })
    ).not.toBeInTheDocument()
  })

  test('a late model response from a previous group cannot replace the current group choices', async () => {
    installApiFixtures([])
    const get = apiClient.get
    let resolveModels!: (value: { data: unknown }) => void
    const pending = new Promise<{ data: unknown }>((resolve) => {
      resolveModels = resolve
    })
    apiClient.get = async (url) =>
      url === '/api/user/models?group=deepseek' ? pending : get(url)
    await renderDrawer()
    selectComboboxOption(getControlByLabel('API model group'), 'DeepSeek only')
    fireEvent.click(findButton('Advanced Settings', true))
    expect(await screen.findByText('Loading group models...')).toBeVisible()
    expect(findButton('Save changes', true)).toBeDisabled()
    selectComboboxOption(
      getControlByLabel('API model group'),
      'Standard access'
    )
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    resolveModels({ data: { success: true, data: ['deepseek-flash'] } })
    await userEvent.setup().click(screen.getByPlaceholderText(/Select models/))
    expect(
      await screen.findByRole('option', { name: 'gpt-6-astra' })
    ).toBeVisible()
    expect(
      screen.queryByRole('option', { name: 'deepseek-flash' })
    ).not.toBeInTheDocument()
  })

  test('selecting DeepSeek limits the model picker to models from that group', async () => {
    installApiFixtures([])
    await renderDrawer()
    selectComboboxOption(getControlByLabel('API model group'), 'DeepSeek only')
    fireEvent.click(findButton('Advanced Settings', true))
    const input = screen.getByPlaceholderText(/Select models/)
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.setup().click(input)
    expect(
      await screen.findByRole('option', { name: 'deepseek-flash' })
    ).toBeVisible()
    expect(
      screen.getByRole('option', { name: 'deepseek-flash-low' })
    ).toBeVisible()
    expect(
      screen.getByRole('option', { name: 'deepseek-v4-pro' })
    ).toBeVisible()
    expect(
      screen.queryByRole('option', { name: 'gpt-6-astra' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'jev-latest' })
    ).not.toBeInTheDocument()
  })

  test('custom Auto model choices include only the selected Auto groups', async () => {
    installApiFixtures([])
    await renderDrawer()
    const add = getControlByLabel(
      'Auto group order'
    ).querySelector<HTMLButtonElement>('button[role="combobox"]')
    if (!add) throw new Error('Expected Auto group selector')
    selectComboboxOption(add, 'Priority access')
    fireEvent.click(findButton('Advanced Settings', true))
    const input = screen.getByPlaceholderText(/Select models/)
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.setup().click(input)
    expect(
      await screen.findByRole('option', { name: 'vip-model' })
    ).toBeVisible()
    expect(
      screen.queryByRole('option', { name: 'gpt-6-astra' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'deepseek-flash' })
    ).not.toBeInTheDocument()
  })

  test('keeps a new key quota empty after individual backspaces and preserves decimal typing', async () => {
    installApiFixtures([])
    await renderDrawer()
    const user = userEvent.setup()
    await user.click(screen.getByRole('switch', { name: 'Unlimited Quota' }))
    const quota = screen.getByRole<HTMLInputElement>('textbox', {
      name: /Quota/,
    })
    expect(quota).toHaveValue('10')
    await user.click(quota)
    await user.keyboard('{End}{Backspace}{Backspace}')
    expect(quota).toHaveValue('')
    await user.type(quota, '0.25')
    expect(quota).toHaveValue('0.25')
    await user.clear(quota)
    await user.type(quota, '10')
    expect(quota).toHaveValue('10')
  })

  test('allows clearing zero quota, rejects an empty amount, and saves a decimal replacement', async () => {
    const updatedPayloads: Array<Record<string, unknown>> = []
    installApiFixtures([], updatedPayloads)
    await renderDrawer(existingKey)
    fireEvent.click(screen.getByRole('switch', { name: 'Unlimited Quota' }))
    const quota = screen.getByRole<HTMLInputElement>('textbox', {
      name: /Quota/,
    })
    expect(quota).toHaveValue('0')
    const select = vi.spyOn(quota, 'select')
    fireEvent.focus(quota)
    expect(select).toHaveBeenCalledOnce()
    changeInput(quota, '')
    expect(quota).toHaveValue('')
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    fireEvent.click(findButton('Save changes', true))
    await screen.findByText('Quota must be zero or greater')
    expect(updatedPayloads).toHaveLength(0)
    changeInput(quota, '10.25')
    expect(quota).toHaveValue('10.25')
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(updatedPayloads).toHaveLength(1))
    const { parseQuotaFromDollars } = await import('@/lib/format')
    expect(updatedPayloads[0]?.remain_quota).toBe(parseQuotaFromDollars(10.25))
    expect(updatedPayloads[0]?.unlimited_quota).toBe(false)
  })

  test('shows four business labels while submitting the selected raw group key', async () => {
    const createdPayloads: Array<Record<string, unknown>> = []
    installApiFixtures(createdPayloads)
    await i18n.changeLanguage('zhCN')
    await renderDrawer()

    const groupTrigger = getControlByLabel('API model group')
    fireEvent.click(groupTrigger)
    const options = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="command-item"]'),
    ]
    for (const label of ['默认', 'moni-token', 'moni计费', 'Jev']) {
      expect(
        options.some((option) => option.textContent?.includes(label))
      ).toBe(true)
    }
    expect(screen.queryByText('metered')).not.toBeInTheDocument()
    expect(screen.queryByText('per-request')).not.toBeInTheDocument()
    expect(screen.queryByText('typesafe')).not.toBeInTheDocument()
    const meteredOption = screen
      .getByText('moni-token')
      .closest<HTMLElement>('[data-slot="command-item"]')
    if (!meteredOption) throw new Error('Expected moni-token option')
    fireEvent.click(meteredOption)
    expect(groupTrigger).toHaveTextContent('moni-token')

    changeInput(getControlByLabel('Name'), 'metered-key')
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(createdPayloads).toHaveLength(1))
    expect(createdPayloads[0]?.group).toBe('metered')
  })

  test('shows the stored Jev group in edit mode and saves a new raw group key', async () => {
    const updatedPayloads: Array<Record<string, unknown>> = []
    installApiFixtures([], updatedPayloads)
    await i18n.changeLanguage('zhCN')
    await renderDrawer(existingKey)

    const groupTrigger = getControlByLabel('API model group')
    expect(groupTrigger).toHaveTextContent('Jev')
    selectComboboxOption(groupTrigger, 'moni计费')
    expect(groupTrigger).toHaveTextContent('moni计费')

    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(updatedPayloads).toHaveLength(1))
    expect(updatedPayloads[0]?.group).toBe('per-request')
    expect(updatedPayloads[0]?.id).toBe(12)
  })

  test('inherits the root Auto order and sends an empty override for every batch-created key', async () => {
    const createdPayloads: Array<Record<string, unknown>> = []
    installApiFixtures(createdPayloads)
    await renderDrawer()

    const groupTrigger = getControlByLabel('API model group')
    expect(groupTrigger.textContent?.includes('auto')).toBe(true)
    expect(
      document.body.textContent?.includes(
        'Using the complete global Auto order (2 groups)'
      )
    ).toBe(true)
    expect(
      [
        ...document.querySelectorAll('[data-slot="global-auto-order-name"]'),
      ].map((item) => item.textContent)
    ).toEqual(['vip', 'Default'])
    expect(findButton('Restore global Auto', true).disabled).toBe(true)

    changeInput(getControlByLabel('Name'), 'batch')
    changeInput(getControlByLabel('Quantity'), '2')
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(createdPayloads).toHaveLength(2))

    expect(createdPayloads.length).toBe(2)
    expect(createdPayloads[0]?.name).toBe('batch')
    for (const payload of createdPayloads) {
      expect(payload.group).toBe('auto')
      expect(payload.auto_groups).toEqual([])
      expect(payload.cross_group_retry).toBe(true)
    }
  })

  test('preserves an unsaved custom order and mode after Auto to ordinary to Auto changes', async () => {
    const createdPayloads: Array<Record<string, unknown>> = []
    installApiFixtures(createdPayloads)
    await renderDrawer()

    const autoOrderControl = getControlByLabel('Auto group order')
    const addGroupTrigger = autoOrderControl.querySelector<HTMLButtonElement>(
      'button[role="combobox"]'
    )
    if (!addGroupTrigger) {
      throw new Error('Expected Auto group order combobox')
    }
    selectComboboxOption(addGroupTrigger, 'Priority access')

    expect(
      document.querySelector('button[aria-label="Remove vip"]')
    ).toBeTruthy()
    expect(document.body.textContent?.includes('1 / 3 groups selected')).toBe(
      true
    )
    expect(findButton('Restore global Auto', true).disabled).toBe(false)

    const groupTrigger = getControlByLabel('API model group')
    selectComboboxOption(groupTrigger, 'Standard access')
    expect(document.querySelector('button[aria-label="Remove vip"]')).toBe(null)
    selectComboboxOption(groupTrigger, 'Automatic routing')

    expect(
      document.querySelector('button[aria-label="Remove vip"]')
    ).toBeTruthy()
    expect(document.body.textContent?.includes('1 / 3 groups selected')).toBe(
      true
    )
    expect(findButton('Restore global Auto', true).disabled).toBe(false)

    changeInput(getControlByLabel('Name'), 'custom')
    await waitFor(() => expect(findButton('Save changes', true)).toBeEnabled())
    fireEvent.click(findButton('Save changes', true))
    await waitFor(() => expect(createdPayloads).toHaveLength(1))
    expect(createdPayloads[0]?.auto_groups).toEqual(['vip'])
  })
})
