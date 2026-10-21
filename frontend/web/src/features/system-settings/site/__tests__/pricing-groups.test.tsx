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
import i18next from 'i18next'
import { useState } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { PricingGroupsSection } from '../pricing-groups-section'

function Fixture(props: { empty?: boolean }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <PricingGroupsSection
          defaultValue='["vip"]'
          groupRatio={
            props.empty ? '{}' : '{"default":1,"vip":2,"moni-gpt-premium":1}'
          }
        />
      </SettingsPageProvider>
    </>
  )
}
function renderSettings(empty = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <Fixture empty={empty} />
    </QueryClientProvider>
  )
  return client
}
beforeEach(() => {
  i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
})
it('selects from existing groups and saves the real group identifiers', async () => {
  const user = userEvent.setup()
  const client = renderSettings()
  const refresh = vi.spyOn(client, 'invalidateQueries')
  expect(screen.getByText('1 groups selected')).toBeVisible()
  expect(screen.queryByRole('textbox')).toBeNull()
  await user.click(
    screen.getByRole('combobox', { name: 'Select existing groups' })
  )
  await user.click(screen.getByRole('option', { name: /moni-gpt-premium/ }))
  await user.keyboard('{Escape}')
  expect(screen.getByText('2 groups selected')).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'Save displayed groups' })
  )
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'PricingVisibleGroups',
      value: '["vip","moni-gpt-premium"]',
    })
  )
  await waitFor(() =>
    expect(refresh).toHaveBeenCalledWith({ queryKey: ['status'] })
  )
  client.clear()
})
it('select all and clear selection allow explicitly hiding every group', async () => {
  const client = renderSettings()
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
  expect(screen.getByText('3 groups selected')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
  expect(screen.getByText('0 groups selected')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Save displayed groups' }))
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'PricingVisibleGroups',
      value: '[]',
    })
  )
  client.clear()
})
it('a failed save retains the selected groups for retry', async () => {
  vi.mocked(api.put).mockResolvedValue({
    data: { success: false, message: 'Save failed' },
  })
  const client = renderSettings()
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save displayed groups' }))
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Save displayed groups' })
    ).toBeEnabled()
  )
  expect(screen.getByText('3 groups selected')).toBeVisible()
  client.clear()
})
it('does not invent groups when none exist', () => {
  const client = renderSettings(true)
  expect(
    screen.getByText(
      'No existing groups. Create a group first in group settings.'
    )
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled()
  expect(screen.getByText('0 groups selected')).toBeVisible()
  client.clear()
})
