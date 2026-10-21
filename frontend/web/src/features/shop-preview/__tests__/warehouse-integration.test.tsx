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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import { ShopPreview } from '..'

describe('unified local commerce interface', () => {
  test('a purchased account and a code claim appear together with their sources and synchronized wallet balance', async () => {
    const user = userEvent.setup()
    render(<ShopPreview />)
    const navigation = () =>
      within(screen.getByRole('navigation', { name: 'Store navigation' }))
    await user.click(screen.getAllByRole('button', { name: 'Buy product' })[0])
    await user.click(
      screen.getByRole('button', { name: 'Buy with wallet credit' })
    )
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Confirm payment' }))
    await user.click(
      await screen.findByRole('button', { name: 'Continue shopping' })
    )
    await user.click(navigation().getByRole('button', { name: 'My warehouse' }))
    expect(screen.getByText('Store purchase')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '灵感设计素材包' })
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Redeem a resource' }))
    await user.type(screen.getByLabelText('Benefit code'), 'SKY-MUSE-2026')
    await user.click(screen.getByRole('button', { name: 'Redeem benefit' }))
    await user.click(
      await screen.findByRole('button', { name: 'View my warehouse' })
    )
    expect(
      screen.getAllByRole('heading', { name: 'Muse 创作账号' })
    ).toHaveLength(2)
    expect(screen.getAllByText('Code redemption').length).toBeGreaterThan(1)
    expect(screen.queryByText('DEMO-only-1')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'View the announcement' })
    ).not.toBeInTheDocument()
    await user.click(navigation().getByRole('button', { name: 'Wallet' }))
    expect(screen.getByText(/300/)).toBeInTheDocument()
  })

  test('resource inventory management exposes the existing packages and opens the same product editor', async () => {
    const user = userEvent.setup()
    render(<ShopPreview />)
    await user.click(
      within(
        screen.getByRole('navigation', { name: 'Store navigation' })
      ).getByRole('button', { name: 'Product management' })
    )
    await user.click(screen.getByRole('tab', { name: 'Inventory and codes' }))
    await user.click(screen.getByRole('button', { name: 'Import inventory' }))
    expect(screen.getByRole('option', { name: /90 天/ })).toBeInTheDocument()
    await user.selectOptions(
      screen.getByLabelText('Benefit name'),
      'muse::extended'
    )
    await user.click(
      screen.getByRole('button', { name: 'Fill sample inventory' })
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Import inventory',
      })
    )
    await user.click(screen.getByRole('tab', { name: 'Product configuration' }))
    expect(screen.getByText(/扩展 · 90 天/)).toHaveTextContent('6')
  })
})
