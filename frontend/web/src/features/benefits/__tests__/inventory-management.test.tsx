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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { InventoryManager } from '../components/inventory-manager'
import type { Benefit, InventoryItem } from '../types'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  edit: vi.fn(),
  manage: vi.fn(),
  import: vi.fn(),
}))
vi.mock('../api', () => ({
  listBenefitInventory: api.list,
  getInventoryDetail: api.detail,
  editInventory: api.edit,
  manageInventory: api.manage,
  importBenefitInventory: api.import,
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (value: unknown) => unknown) =>
    select({ auth: { user: { id: 1 }, session: { sid: 'root-fixture' } } }),
}))

const benefit: Benefit = {
  id: '1',
  name: 'Muse',
  summary: '',
  category: 'account',
  tone: 'sky',
  format: 'markdown',
  instructions: '',
  stockMode: 'individual',
  validityDays: 0,
  enabled: true,
  fields: [
    { id: 'account', label: 'Account', kind: 'text', value: '' },
    { id: 'password', label: 'Password', kind: 'secret', value: '' },
  ],
}
const item: InventoryItem = {
  id: '1',
  benefitId: '1',
  benefitName: 'Muse',
  claimed: false,
  status: 'available',
  revision: 3,
  fields: [
    { ...benefit.fields[0], value: 'stock@example.invalid' },
    { ...benefit.fields[1], value: '' },
  ],
}
function renderInventory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <InventoryManager benefits={[benefit]} />
    </QueryClientProvider>
  )
}
describe('inventory management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.list.mockResolvedValue({
      items: [item],
      total: 1,
      counts: {
        all: 1,
        available: 1,
        disabled: 0,
        reserved: 0,
        delivered: 0,
        removed: 0,
      },
    })
    api.detail.mockResolvedValue({
      ...item,
      fields: [
        item.fields[0],
        { ...benefit.fields[1], value: 'fixture-password' },
      ],
      history: [],
    })
    api.edit.mockResolvedValue(undefined)
    api.manage.mockResolvedValue(undefined)
    api.import.mockResolvedValue(undefined)
  })
  test('a single inventory item can be added with separate account and password fields', async () => {
    const user = userEvent.setup()
    renderInventory()
    await user.click(await screen.findByRole('button', { name: 'Add inventory item' }))
    const dialog = within(await screen.findByRole('dialog'))
    const save = dialog.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await user.type(dialog.getByLabelText('Account'), 'new-stock@example.invalid')
    await user.type(dialog.getByLabelText('Password'), 'new-fixture-password')
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() => expect(api.import).toHaveBeenCalledWith([expect.objectContaining({ benefitId: '1', fields: expect.arrayContaining([expect.objectContaining({ id: 'account', value: 'new-stock@example.invalid' }), expect.objectContaining({ id: 'password', value: 'new-fixture-password' })]) })]))
  })
  test('viewing a row opens private fields with the password masked and saves edits with the loaded revision', async () => {
    const user = userEvent.setup()
    renderInventory()
    expect(
      screen.queryByDisplayValue('fixture-password')
    ).not.toBeInTheDocument()
    await user.click(
      await screen.findByRole('button', { name: 'View and edit inventory' })
    )
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password'
    )
    const account = dialog.getByLabelText('Account')
    await user.clear(account)
    await user.type(account, 'updated@example.invalid')
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.edit).toHaveBeenCalledWith(
        expect.objectContaining({
          revision: 3,
          fields: expect.arrayContaining([
            expect.objectContaining({ value: 'updated@example.invalid' }),
          ]),
        }),
        '',
        false
      )
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(
      screen.queryByDisplayValue('fixture-password')
    ).not.toBeInTheDocument()
  })
  test('delivered credentials require a reason and explicit warehouse sync, and delivered rows cannot be selected for deletion', async () => {
    api.list.mockResolvedValue({
      items: [{ ...item, claimed: true, status: 'delivered' }],
      total: 1,
      counts: { all: 1, delivered: 1 },
    })
    api.detail.mockResolvedValue({
      ...item,
      claimed: true,
      status: 'delivered',
      fields: [
        item.fields[0],
        { ...benefit.fields[1], value: 'fixture-password' },
      ],
      history: [],
    })
    const user = userEvent.setup()
    renderInventory()
    await screen.findByRole('button', { name: 'View and edit inventory' })
    expect(
      screen.getByRole('checkbox', { name: 'Select inventory item' })
    ).toHaveAttribute('aria-disabled', 'true')
    await user.click(
      screen.getByRole('button', { name: 'View and edit inventory' })
    )
    const dialog = within(await screen.findByRole('dialog'))
    const save = dialog.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    await user.type(
      dialog.getByLabelText('Change reason'),
      'Correct an account credential'
    )
    expect(save).toBeDisabled()
    await user.click(
      dialog.getByRole('checkbox', {
        name: 'Confirm updating the buyer warehouse',
      })
    )
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() =>
      expect(api.edit).toHaveBeenCalledWith(
        expect.objectContaining({ claimed: true }),
        'Correct an account credential',
        true
      )
    )
  })
  test('batch deletion requires confirmation and retains each selected revision', async () => {
    api.list.mockResolvedValue({
      items: [item, { ...item, id: '2', revision: 7 }],
      total: 2,
      counts: { all: 2, available: 2 },
    })
    const user = userEvent.setup()
    renderInventory()
    await screen.findAllByRole('button', { name: 'View and edit inventory' })
    await user.click(
      screen.getByRole('checkbox', { name: 'Select this inventory page' })
    )
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(api.manage).not.toHaveBeenCalled()
    const dialog = within(await screen.findByRole('alertdialog'))
    await user.click(dialog.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(api.manage).toHaveBeenCalledWith(
        [
          expect.objectContaining({ id: '1', revision: 3 }),
          expect.objectContaining({ id: '2', revision: 7 }),
        ],
        'remove',
        ''
      )
    )
  })
  test('reserved inventory can be viewed but cannot be edited or deleted', async () => {
    const reserved = { ...item, claimed: true, status: 'reserved' }
    api.list.mockResolvedValue({
      items: [reserved],
      total: 1,
      counts: { all: 1, reserved: 1 },
    })
    api.detail.mockResolvedValue({
      ...reserved,
      fields: [
        item.fields[0],
        { ...benefit.fields[1], value: 'fixture-password' },
      ],
    })
    const user = userEvent.setup()
    renderInventory()
    await user.click(await screen.findByRole('button', { name: 'View' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByLabelText('Account')).toHaveAttribute('readonly')
    expect(
      dialog.queryByRole('button', { name: 'Save changes' })
    ).not.toBeInTheDocument()
  })
  test('search and pagination are sent to the server instead of filtering only the first page', async () => {
    api.list.mockResolvedValue({
      items: [item],
      total: 51,
      counts: { all: 51, available: 51 },
    })
    const user = userEvent.setup()
    renderInventory()
    await screen.findByRole('button', { name: 'View and edit inventory' })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(api.list).toHaveBeenCalledWith(
        2,
        expect.any(AbortSignal),
        expect.objectContaining({ status: 'all' })
      )
    )
    await user.type(screen.getByLabelText('Search inventory'), 'account-51')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(api.list).toHaveBeenCalledWith(
        1,
        expect.any(AbortSignal),
        expect.objectContaining({ keyword: 'account-51' })
      )
    )
  })
  test('failed edits keep the dialog and entered fields available for correction', async () => {
    api.edit.mockRejectedValue(new Error('Conflict'))
    const user = userEvent.setup()
    renderInventory()
    await user.click(
      await screen.findByRole('button', { name: 'View and edit inventory' })
    )
    const dialog = within(await screen.findByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.edit).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await waitFor(() =>
      expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    )
  })
})
