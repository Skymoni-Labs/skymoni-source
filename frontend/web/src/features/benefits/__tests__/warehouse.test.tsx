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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { createPreviewData } from '@/features/benefits-preview/lib/seed'

import { Warehouse } from '../components/warehouse'

describe('warehouse empty and filtered states', () => {
  test('a new warehouse explains redemption instead of suggesting a failed search', async () => {
    const user = userEvent.setup()
    const onRedeem = vi.fn()
    render(
      <Warehouse
        items={[]}
        onRedeem={onRedeem}
        onPopup={vi.fn()}
        hideAnnouncement
      />
    )
    expect(screen.getByText('Your warehouse is empty')).toBeInTheDocument()
    expect(screen.queryByText('No matching resources')).not.toBeInTheDocument()
    await user.click(
      screen.getAllByRole('button', { name: 'Redeem a resource' })[1]
    )
    expect(onRedeem).toHaveBeenCalledOnce()
  })

  test('clearing a local search restores resources and does not start redemption', async () => {
    const user = userEvent.setup()
    const onRedeem = vi.fn()
    render(
      <Warehouse
        items={createPreviewData().warehouse}
        onRedeem={onRedeem}
        onPopup={vi.fn()}
        hideAnnouncement
      />
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Search resources' }),
      'missing-resource'
    )
    expect(screen.getByText('No matching resources')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(
      screen.getByRole('textbox', { name: 'Search resources' })
    ).toHaveValue('')
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(onRedeem).not.toHaveBeenCalled()
  })

  test('clearing server-side filters resets both controls and preserves total counts', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    const onFilter = vi.fn()
    render(
      <Warehouse
        items={[]}
        counts={{ all: 12, active: 10, expired: 2 }}
        search='missing-resource'
        filter='expired'
        onSearch={onSearch}
        onFilter={onFilter}
        onRedeem={vi.fn()}
        onPopup={vi.fn()}
        hideAnnouncement
      />
    )
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onSearch).toHaveBeenCalledWith('')
    expect(onFilter).toHaveBeenCalledWith('all')
  })
})
