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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { getGroups, mergeChannelGroup } from '../../api'
import { MergeGroupDialog } from '../dialogs/merge-group-dialog'

vi.mock('../../api', () => ({ getGroups: vi.fn(), mergeChannelGroup: vi.fn() }))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))

beforeEach(() => {
  vi.mocked(getGroups).mockResolvedValue({
    success: true,
    data: ['default', 'deepseek', 'auto'],
  })
  vi.mocked(mergeChannelGroup).mockResolvedValue({ updated: 1, unchanged: 1 })
})

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onSuccess = vi.fn()
  const onClose = vi.fn()
  // The channel table already caches the full API response under this key.
  client.setQueryData(['groups'], {
    success: true,
    data: ['default', 'deepseek', 'auto'],
  })
  render(
    <QueryClientProvider client={client}>
      <MergeGroupDialog
        ids={[11, 12]}
        onSuccess={onSuccess}
        onClose={onClose}
      />
    </QueryClientProvider>
  )
  return { client, onSuccess, onClose }
}

test('chooses a live group and submits only the selected IDs once', async () => {
  const user = userEvent.setup()
  const { onSuccess, client } = mount()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  expect(
    screen.getByRole('button', { name: 'Confirm add to group' })
  ).toBeDisabled()
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Target group' })).toBeEnabled()
  )
  await user.click(screen.getByRole('combobox', { name: 'Target group' }))
  expect(screen.queryByRole('option', { name: 'auto' })).not.toBeInTheDocument()
  await user.click(await screen.findByRole('option', { name: 'deepseek' }))
  expect(screen.getByText(/Existing groups are kept/)).toBeVisible()
  expect(screen.getByText(/current model search does not limit/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Confirm add to group' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
  expect(mergeChannelGroup).toHaveBeenCalledExactlyOnceWith(
    [11, 12],
    'deepseek'
  )
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channels'] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pricing'] })
})

test('cancel does not write channel data', async () => {
  const user = userEvent.setup()
  const { onClose } = mount()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(mergeChannelGroup).not.toHaveBeenCalled()
})

test('failed submission leaves the selection available for retry', async () => {
  vi.mocked(mergeChannelGroup).mockRejectedValue(
    new Error('server unavailable')
  )
  const user = userEvent.setup()
  const { onSuccess } = mount()
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Target group' })).toBeEnabled()
  )
  await user.click(screen.getByRole('combobox', { name: 'Target group' }))
  await user.click(await screen.findByRole('option', { name: 'deepseek' }))
  await user.click(screen.getByRole('button', { name: 'Confirm add to group' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Confirm add to group' })
    ).toBeEnabled()
  )
  expect(onSuccess).not.toHaveBeenCalled()
  expect(screen.getByRole('combobox', { name: 'Target group' })).toHaveValue(
    'deepseek'
  )
})

test('group lookup failure cannot be submitted and can be retried', async () => {
  vi.mocked(getGroups).mockResolvedValueOnce({
    success: false,
    message: 'not allowed',
  })
  const user = userEvent.setup()
  mount()
  await user.click(await screen.findByRole('button', { name: 'Retry' }))
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Target group' })).toBeEnabled()
  )
  expect(
    screen.getByRole('button', { name: 'Confirm add to group' })
  ).toBeDisabled()
  expect(mergeChannelGroup).not.toHaveBeenCalled()
})
