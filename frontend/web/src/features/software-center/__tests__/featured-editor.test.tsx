import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { SoftwareFeaturedEditor } from '../featured-editor'
import type { SoftwareCatalog, SoftwareEntry } from '../types'

vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key.replaceAll(/{{(\w+)}}/g, (match, field: string) =>
        String(values?.[field] ?? match)
      ),
  }),
}))
const items = ['Browser', 'Mail', 'Coding', 'Draft'].map(
  (id): SoftwareEntry => ({
    id,
    name: id,
    kind: id === 'Coding' ? 'tool' : 'software',
    description: '',
    platform: '',
    version: '',
    downloadUrl: '',
    filename: '',
    detailUrl: 'https://example.com',
    imageUrl: '',
    appearance: 'generic',
    sortOrder: 0,
    published: id !== 'Draft',
  })
)
const catalog: SoftwareCatalog = {
  revision: 'fixture',
  items,
  featured: { carousel: ['Browser', 'Mail'], tiles: ['Coding'] },
}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('an administrator searches for a published tool, orders slides and saves separate card selections', async () => {
  const user = userEvent.setup()
  const save = vi.fn(async () => {})
  const close = vi.fn()
  render(
    <SoftwareFeaturedEditor catalog={catalog} onSave={save} onClose={close} />
  )
  const field = screen.getByRole('combobox', {
    name: 'Main carousel position 3',
  })
  await user.click(field)
  await user.type(field, 'Coding')
  await user.click(await screen.findByRole('option', { name: 'Coding · Tool' }))
  await user.click(
    screen.getByRole('button', { name: 'Move Main carousel position 3 up' })
  )
  expect(
    screen.getByRole('combobox', { name: 'Main carousel position 2' })
  ).toHaveValue('Coding · Tool')
  await user.click(screen.getByRole('button', { name: 'Save recommendations' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      carousel: ['Browser', 'Coding', 'Mail'],
      tiles: ['Coding'],
    })
  )
  expect(close).toHaveBeenCalledOnce()
})

test('clearing an area saves an empty selection, and a failed save keeps the editor available to retry', async () => {
  const user = userEvent.setup()
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error('Conflict'))
    .mockResolvedValueOnce(undefined)
  const close = vi.fn()
  render(
    <SoftwareFeaturedEditor catalog={catalog} onSave={save} onClose={close} />
  )
  await user.click(
    screen.getByRole('button', { name: 'Clear Right-side cards position 1' })
  )
  await user.click(screen.getByRole('button', { name: 'Save recommendations' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Recommendations were not saved'
  )
  expect(close).not.toHaveBeenCalled()
  expect(
    screen.getByRole('combobox', { name: 'Right-side cards position 1' })
  ).toHaveValue('')
  await user.click(screen.getByRole('button', { name: 'Save recommendations' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenLastCalledWith({
    carousel: ['Browser', 'Mail'],
    tiles: [],
  })
})

test('cancel closes without saving and unpublished items cannot be newly selected', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  const close = vi.fn()
  render(
    <SoftwareFeaturedEditor catalog={catalog} onSave={save} onClose={close} />
  )
  await user.click(
    screen.getByRole('combobox', { name: 'Main carousel position 3' })
  )
  expect(
    screen.queryByRole('option', { name: /Draft/ })
  ).not.toBeInTheDocument()
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: /^Cancel$/ }))
  expect(save).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
})
