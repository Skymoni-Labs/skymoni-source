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
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ShopOrder } from '@/features/shop-preview/types'

import { ShopAfterSales } from './after-sales'

const pending = {
  id: '12',
  userId: 7,
  userName: 'alice',
  name: 'Drip',
  packageName: '100 GiB',
  priceCents: 20000,
  status: 'pending',
  created: '2026-10-06T00:00:00Z',
} as ShopOrder
const delivered = {
  ...pending,
  id: '13',
  status: 'delivered',
  userName: 'bob',
  userId: 8,
} as ShopOrder

function view(overrides: Partial<Parameters<typeof ShopAfterSales>[0]> = {}) {
  const actions = {
    onStatusChange: vi.fn(),
    onQueryChange: vi.fn(),
    onPageChange: vi.fn(),
    onRefund: vi.fn(),
    onDeliver: vi.fn(),
  }
  render(
    <ShopAfterSales
      orders={[pending, delivered]}
      total={51}
      page={1}
      status='all'
      query=''
      loading={false}
      {...actions}
      {...overrides}
    />
  )
  return actions
}

describe('ShopAfterSales', () => {
  it('shows sold orders, customer, status and order actions', () => {
    const actions = view()
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('alice')).toBeInTheDocument()
    expect(within(rows[2]).getByText('bob')).toBeInTheDocument()
    fireEvent.click(
      within(rows[1]).getByRole('button', { name: 'Refund credit' })
    )
    expect(actions.onRefund).toHaveBeenCalledWith(pending)
    fireEvent.click(
      within(rows[2]).getByRole('button', { name: 'Refund credit' })
    )
    expect(actions.onRefund).toHaveBeenCalledWith(delivered)
    expect(
      within(rows[2]).queryByRole('button', { name: 'Confirm delivery' })
    ).not.toBeInTheDocument()
    fireEvent.click(
      within(rows[1]).getByRole('button', { name: 'Confirm delivery' })
    )
    expect(actions.onDeliver).toHaveBeenCalledWith(pending)
    const mobileOrders = screen.getAllByRole('article')
    fireEvent.click(
      within(mobileOrders[1]).getByRole('button', { name: 'Refund credit' })
    )
    expect(actions.onRefund).toHaveBeenCalledWith(delivered)
  })

  it('filters and searches without shifting the order table', () => {
    const actions = view()
    fireEvent.click(screen.getByRole('button', { name: 'Refunded orders' }))
    expect(actions.onStatusChange).toHaveBeenCalledWith('refunded')
    fireEvent.change(screen.getByRole('textbox', { name: 'Search orders' }), {
      target: { value: '12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search orders' }))
    expect(actions.onQueryChange).toHaveBeenCalledWith('12')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(actions.onPageChange).toHaveBeenCalledWith(2)
  })

  it('shows an empty result and disables unavailable page controls', () => {
    view({ orders: [], total: 0 })
    expect(screen.getAllByText('No matching orders')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })
})
