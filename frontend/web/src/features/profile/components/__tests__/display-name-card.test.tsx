import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { saveAccountIdentity } from '@/lib/site-identity'

import type { UserProfile } from '../../types'
import { DisplayNameCard } from '../display-name-card'

vi.mock('@/lib/site-identity', () => ({
  saveAccountIdentity: vi.fn(async () => undefined),
}))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('saving the displayed name through the actual button writes the shared site profile', async () => {
  const update = vi.fn(async () => undefined)
  render(
    <DisplayNameCard
      profile={
        { id: 7, username: 'account', display_name: 'Before' } as UserProfile
      }
      onUpdate={update}
    />
  )
  await userEvent.clear(screen.getByRole('textbox', { name: '显示名称' }))
  await userEvent.type(
    screen.getByRole('textbox', { name: '显示名称' }),
    'After'
  )
  await userEvent.click(screen.getByRole('button', { name: '保存名称' }))
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  expect(saveAccountIdentity).toHaveBeenCalledWith({ name: 'After' })
})
