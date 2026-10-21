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
import { renderHook, waitFor } from '@testing-library/react'
import { createInstance } from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { usePlaygroundOptions } from '../use-playground-options'

afterEach(() => {
  vi.restoreAllMocks()
})

it('shows the four public group labels while selecting the raw default key', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        default: { desc: 'default', ratio: 1 },
        metered: { desc: 'metered', ratio: 1 },
        'per-request': { desc: 'per-request', ratio: 1 },
        typesafe: { desc: 'typesafe', ratio: 1 },
      },
    },
  })
  const i18n = createInstance()
  await i18n.use(initReactI18next).init({
    lng: 'zhCN',
    resources: {
      zhCN: {
        translation: {
          Default: '默认',
          'moni-token': 'moni-token',
          'Per Request': 'moni计费',
        },
      },
    },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const setGroups = vi.fn()
  const updateConfig = vi.fn()
  function wrapper(props: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>{props.children}</I18nextProvider>
      </QueryClientProvider>
    )
  }

  renderHook(
    () =>
      usePlaygroundOptions({
        currentGroup: '',
        currentModel: '',
        setGroups,
        setModels: vi.fn(),
        updateConfig,
      }),
    { wrapper }
  )

  await waitFor(() => expect(setGroups).toHaveBeenCalled())
  expect(setGroups).toHaveBeenLastCalledWith([
    { value: 'default', label: '默认', ratio: 1, desc: undefined },
    { value: 'metered', label: 'moni-token', ratio: 1, desc: undefined },
    { value: 'per-request', label: 'moni计费', ratio: 1, desc: undefined },
    { value: 'typesafe', label: 'Jev', ratio: 1, desc: undefined },
  ])
  expect(updateConfig).toHaveBeenCalledWith('group', 'default')
})
