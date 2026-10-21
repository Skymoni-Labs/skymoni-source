import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, expect, it, vi } from 'vitest'

import { userAvatarSource } from '@/lib/avatar'
import { saveAccountIdentity } from '@/lib/site-identity'

import { AvatarSettingsCard } from '../avatar-settings-card'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (text: string) => text }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/site-identity', () => ({ saveAccountIdentity: vi.fn() }))
vi.mock('../../api', () => ({
  getUserProfile: vi.fn(async () => ({
    success: true,
    data: { id: 1, username: 'viewer', role: 1, setting: '{}' },
  })),
}))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('uses the mascot for missing, invalid or remote avatar settings', () => {
  for (const setting of [
    undefined,
    '{bad',
    '{"avatar":"https://example.com/a.png"}',
    '{"avatar":"data:image/svg+xml;base64,abc"}',
  ]) {
    expect(userAvatarSource(setting)).toBe('/skymoni-avatar.png')
  }
  expect(userAvatarSource('{"avatar":"data:image/jpeg;base64,abc"}')).toBe(
    'data:image/jpeg;base64,abc'
  )
})
it('restores the default avatar and refreshes the profile after saving', async () => {
  vi.mocked(saveAccountIdentity).mockResolvedValue(undefined)
  const refresh = vi.fn(async () => {})
  render(<AvatarSettingsCard profile={null} onProfileUpdate={refresh} />)
  expect(
    (screen.getByRole('button', { name: 'Save picture' }) as HTMLButtonElement)
      .disabled
  ).toBe(true)
  await userEvent.click(
    screen.getByRole('button', { name: 'Restore default picture' })
  )
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(saveAccountIdentity).toHaveBeenCalledWith({ avatar: '' })
})
it('rejects unsupported uploads before contacting the server', () => {
  render(<AvatarSettingsCard profile={null} onProfileUpdate={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Choose your picture'), {
    target: {
      files: [new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })],
    },
  })
  expect(toast.error).toHaveBeenCalled()
  expect(saveAccountIdentity).not.toHaveBeenCalled()
})
it('keeps the current profile when the server rejects the update', async () => {
  vi.mocked(saveAccountIdentity).mockRejectedValue(new Error('denied'))
  const refresh = vi.fn()
  render(<AvatarSettingsCard profile={null} onProfileUpdate={refresh} />)
  await userEvent.click(
    screen.getByRole('button', { name: 'Restore default picture' })
  )
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Restore default picture',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false)
  )
  expect(refresh).not.toHaveBeenCalled()
  expect(toast.success).not.toHaveBeenCalled()
})
