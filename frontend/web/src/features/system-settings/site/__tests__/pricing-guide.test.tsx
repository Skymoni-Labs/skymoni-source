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
import i18next from 'i18next'
import { useState } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { PricingGuideSection } from '../pricing-guide-section'

function Fixture() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <PricingGuideSection defaultValue='' />
      </SettingsPageProvider>
    </>
  )
}

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['status'], {
    reference_usd_cny: 6.713233,
    reference_fx_date: '2026-09-25',
  })
  render(
    <QueryClientProvider client={client}>
      <Fixture />
    </QueryClientProvider>
  )
  return client
}

beforeEach(() => {
  i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { reference_usd_cny: 6.713233, reference_fx_date: '2026-09-25' },
    },
  })
})

it('previews the draft, saves both sections together and refreshes public status', async () => {
  const client = renderSettings()
  const refresh = vi.spyOn(client, 'invalidateQueries')
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Conversion guide title' }),
    { target: { value: 'Custom conversion' } }
  )
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Conversion guide content' }),
    { target: { value: '¥{{creditPrice}} per credit\nSecond line' } }
  )
  fireEvent.click(
    screen.getByRole('switch', { name: 'Model billing suffixes' })
  )
  expect(
    screen.getByRole('region', { name: 'Custom conversion' })
  ).toHaveTextContent('¥0.10 per credit')
  expect(screen.queryByText('-token-pro')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save pricing guide' }))
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'PricingGuideConfig',
      value: JSON.stringify({
        showConversion: true,
        conversionTitle: 'Custom conversion',
        conversionContent: '¥{{creditPrice}} per credit\nSecond line',
        showSuffix: false,
        suffixTitle: '',
        suffixContent: '',
      }),
    })
  )
  await waitFor(() =>
    expect(refresh).toHaveBeenCalledWith({ queryKey: ['status'] })
  )
  client.clear()
})

it('restoring defaults restores the original preview and saves empty overrides', async () => {
  const client = renderSettings()
  fireEvent.click(
    screen.getByRole('button', { name: 'Load default text for editing' })
  )
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Conversion guide content',
      }) as HTMLTextAreaElement
    ).value
  ).toContain('{{exchangeRate}}')
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Model suffix guide content',
      }) as HTMLTextAreaElement
    ).value
  ).toContain('-token-pro')
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Model suffix guide title' }),
    { target: { value: 'Our routes' } }
  )
  fireEvent.click(
    screen.getByRole('switch', { name: 'How model prices convert' })
  )
  fireEvent.click(
    screen.getByRole('switch', { name: 'Model billing suffixes' })
  )
  expect(screen.getByText('Both guide sections are hidden.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Use default guide' }))
  expect(
    screen.getByRole('region', { name: 'How model prices convert' })
  ).toBeVisible()
  expect(
    screen.getByRole('textbox', { name: 'Model suffix guide title' })
  ).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Save pricing guide' }))
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/api/option/', {
      key: 'PricingGuideConfig',
      value: JSON.stringify({
        showConversion: true,
        conversionTitle: '',
        conversionContent: '',
        showSuffix: true,
        suffixTitle: '',
        suffixContent: '',
      }),
    })
  )
  client.clear()
})

it('a failed save keeps the draft available for retry', async () => {
  vi.mocked(api.put).mockResolvedValue({
    data: { success: false, message: 'Save failed' },
  })
  const client = renderSettings()
  const input = screen.getByRole('textbox', { name: 'Conversion guide title' })
  fireEvent.change(input, { target: { value: 'Unsaved title' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save pricing guide' }))
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Save pricing guide' })
    ).toBeEnabled()
  )
  expect(input).toHaveValue('Unsaved title')
  expect(screen.getByRole('region', { name: 'Unsaved title' })).toBeVisible()
  client.clear()
})
