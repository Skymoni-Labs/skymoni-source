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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { useState } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ChannelsProvider, useChannels } from '../channels-provider'
import { EditTagDialog } from '../dialogs/edit-tag-dialog'

const i18n = createInstance()
await i18n
  .use(initReactI18next)
  .init({ lng: 'en', resources: { en: { translation: {} } } })
const animationDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)
beforeEach(() =>
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (animationDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      animationDescriptor
    )
  } else Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
})
function Harness() {
  const { setCurrentTag } = useChannels()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type='button'
        onClick={() => {
          setCurrentTag('provider')
          setOpen(true)
        }}
      >
        Edit provider
      </button>
      <EditTagDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
it('loading channel defaults preserves an edited tag name and reopening resets the form', async () => {
  let loadModels: (result: {
    data: { success: boolean; data: string }
  }) => void = () => {}
  const pending = new Promise<{ data: { success: boolean; data: string } }>(
    (resolve) => {
      loadModels = resolve
    }
  )
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/channel/tag/models') return pending
    if (url === '/api/group/') {
      return { data: { success: true, data: ['default'] } }
    }
    return { data: { success: true, data: [] } }
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const user = userEvent.setup()
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <ChannelsProvider>
          <Harness />
        </ChannelsProvider>
      </QueryClientProvider>
    </I18nextProvider>
  )
  await user.click(screen.getByRole('button', { name: 'Edit provider' }))
  const input = screen.getByRole('textbox', { name: /Tag Name/ })
  await user.clear(input)
  await user.type(input, 'edited-provider')
  loadModels({ data: { success: true, data: 'deepseek-flash' } })
  await waitFor(() =>
    expect(screen.getByText('deepseek-flash ×')).toBeVisible()
  )
  expect(input).toHaveValue('edited-provider')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(screen.getByRole('button', { name: 'Edit provider' }))
  expect(screen.getByRole('textbox', { name: /Tag Name/ })).toHaveValue(
    'provider'
  )
  client.clear()
})
