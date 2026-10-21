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
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { HomeFooter } from '../footer'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('offers source and license information from the website footer', () => {
  render(<HomeFooter />)

  const footer = screen.getByRole('contentinfo')
  const licenses = within(footer).getByRole('navigation', {
    name: 'Open-source licenses',
  })
  expect(
    within(licenses).getByRole('link', { name: 'Get corresponding source' })
  ).toHaveAttribute('href', '/open-source.html#source')
  expect(
    within(licenses).getByRole('link', { name: 'Third-party notices' })
  ).toHaveAttribute('href', '/app-releases/THIRD_PARTY_NOTICES.txt')
  expect(
    within(licenses).getByRole('link', {
      name: 'License notices',
    })
  ).toHaveAttribute('href', '/open-source.html')
  expect(within(footer).getByText('New API · QuantumNous')).toBeVisible()
  expect(
    within(footer).getByRole('link', { name: 'Model catalog' })
  ).toHaveAttribute('href', '/pricing')
})
