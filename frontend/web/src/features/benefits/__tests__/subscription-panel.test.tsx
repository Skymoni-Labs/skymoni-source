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
*/
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { WarehouseDetail } from '../components/warehouse'
import type { WarehouseItem } from '../types'

const clashUrl = 'https://skymoni.com/api/drip/sub/clash/TestSubscription123'
const universalUrl = 'https://skymoni.com/api/drip/sub/sub/TestSubscription123'

function makeItem(fields: WarehouseItem['fields']): WarehouseItem {
  return {
    id: 'purchase-1',
    benefit: {
      id: 'drip',
      name: 'Drip',
      summary: 'Subscription',
      category: 'resource',
      tone: 'sky',
      format: 'markdown',
      instructions: 'Instructions',
      fields: [],
      stockMode: 'individual',
      validityDays: 100,
      enabled: true,
    },
    fields,
    received: '2026-10-10',
    expires: '2027-01-18',
    status: 'active',
    sourceCode: 'shop:1',
  }
}

describe('Drip subscription panel', () => {
  test('shows client imports, QR code, guide and the separate redemption code', async () => {
    const user = userEvent.setup()
    render(
      <WarehouseDetail
        item={makeItem([
          { id: 'code', label: 'Code', kind: 'secret', value: 'DRIP-TEST-123' },
          {
            id: 'clash-subscription',
            label: 'Clash',
            kind: 'link',
            value: clashUrl,
          },
          {
            id: 'universal-subscription',
            label: 'Universal',
            kind: 'link',
            value: universalUrl,
          },
        ])}
        onClose={vi.fn()}
      />
    )

    expect(
      screen.getByRole('dialog', { name: 'Subscription panel' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Clash subscription address' })
    ).toHaveValue(clashUrl)
    expect(
      screen.getByRole('button', {
        name: 'Import to Clash (Windows, macOS, Android)',
      })
    ).toHaveAttribute(
      'href',
      `clash://install-config?url=${encodeURIComponent(clashUrl)}&name=skymoni`
    )
    expect(
      screen.getByRole('button', { name: 'Import to Stash' })
    ).toHaveAttribute(
      'href',
      `stash://install-config?url=${encodeURIComponent(clashUrl)}`
    )
    expect(
      screen.getByRole('button', { name: 'Import to Shadowrocket (iOS)' })
    ).toHaveAttribute(
      'href',
      `shadowrocket://add/${encodeURIComponent(universalUrl)}`
    )
    expect(
      screen.getByRole('button', { name: 'Import to Surge (unavailable)' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: 'Import to Quantumult X (unavailable)',
      })
    ).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Show CLASH QR code' }))
    expect(screen.getByTitle('CLASH subscription QR code')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Need help? View import guide' })
    )
    expect(
      screen.getByRole('button', { name: 'Copy universal subscription link' })
    ).toBeInTheDocument()
    expect(screen.queryByText('DRIP-TEST-123')).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Drip redemption code' })
    )
    expect(screen.getByText('DRIP-TEST-123')).toBeInTheDocument()
  })

  test('keeps ordinary warehouse items in the existing detail dialog', () => {
    render(
      <WarehouseDetail
        item={makeItem([
          { id: 'code', label: 'Code', kind: 'text', value: 'ordinary-value' },
        ])}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('dialog', { name: 'Drip' })).toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: 'Subscription panel' })
    ).not.toBeInTheDocument()
  })
})
