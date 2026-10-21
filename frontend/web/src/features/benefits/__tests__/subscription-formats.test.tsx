import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { DripSubscriptionPanel } from '../components/drip-subscription-panel'
import type { WarehouseItem } from '../types'

const base = 'https://skymoni.com/api/drip/sub/'
const id = 'TestSubscription123'
const item: WarehouseItem = {
  id: 'purchase-1',
  benefit: {
    id: 'drip',
    name: 'Drip',
    summary: 'Subscription',
    category: 'resource',
    tone: 'sky',
    format: 'markdown',
    instructions: '',
    fields: [],
    stockMode: 'individual',
    validityDays: 100,
    enabled: true,
  },
  fields: [
    { id: 'code', label: 'Code', kind: 'secret', value: 'DRIP-TEST-123' },
  ],
  received: '2026-10-11',
  expires: '2027-01-19',
  status: 'active',
  sourceCode: 'shop:1',
}

function showPanel(universalUrl = `${base}sub/${id}`) {
  return render(
    <DripSubscriptionPanel
      item={item}
      clashUrl={`${base}clash/${id}`}
      universalUrl={universalUrl}
      onClose={vi.fn()}
    />
  )
}

describe('subscription formats', () => {
  test('copies the selected format address to the clipboard', async () => {
    const user = userEvent.setup()
    showPanel()
    for (const [format, kind] of [
      ['SUB', 'sub'],
      ['JSON', 'json'],
      ['CLASH', 'clash'],
    ]) {
      await user.click(
        screen.getByRole('button', { name: `Copy ${format} subscription` })
      )
      expect(await navigator.clipboard.readText()).toBe(`${base}${kind}/${id}`)
    }
  })
  test('exposes all three format addresses without opening the guide', () => {
    showPanel()
    expect(
      screen.getByRole('textbox', { name: 'Universal subscription address' })
    ).toHaveValue(`${base}sub/${id}`)
    expect(
      screen.getByRole('textbox', { name: 'JSON subscription address' })
    ).toHaveValue(`${base}json/${id}`)
    expect(
      screen.getByRole('textbox', { name: 'Clash subscription address' })
    ).toHaveValue(`${base}clash/${id}`)
    for (const [format, kind, extension] of [
      ['SUB', 'sub', 'txt'],
      ['JSON', 'json', 'json'],
      ['CLASH', 'clash', 'yaml'],
    ]) {
      expect(
        screen.getByRole('button', { name: `Copy ${format} subscription` })
      ).toBeEnabled()
      expect(
        screen.getByRole('button', { name: `Download ${format} subscription` })
      ).toHaveAttribute('href', `${base}${kind}/${id}`)
      expect(
        screen.getByRole('button', { name: `Download ${format} subscription` })
      ).toHaveAttribute('download', `skymoni.${extension}`)
    }
    expect(screen.queryByText('DRIP-TEST-123')).not.toBeInTheDocument()
  })

  test('opens and closes the selected format QR with the matching accessible state', async () => {
    const user = userEvent.setup()
    showPanel()
    const toggle = screen.getByRole('button', { name: 'Show SUB QR code' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByTitle('SUB subscription QR code')).toBeInTheDocument()
    expect(
      screen.queryByTitle('CLASH subscription QR code')
    ).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Hide SUB QR code' }))
    expect(
      screen.queryByTitle('SUB subscription QR code')
    ).not.toBeInTheDocument()
  })

  test('does not invent a JSON address for an unrelated universal URL', () => {
    showPanel('https://example.com/other/subscription')
    expect(
      screen.queryByRole('textbox', { name: 'JSON subscription address' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Universal subscription address' })
    ).toHaveValue('https://example.com/other/subscription')
  })
})
