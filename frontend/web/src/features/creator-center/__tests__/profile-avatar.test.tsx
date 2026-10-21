import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { CreatorProfileEditor } from '../components/creator-profile-editor'
import { creatorProfileSchema, defaultCreatorProfile } from '../lib/hub'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
const profile = {
  ...defaultCreatorProfile,
  name: 'Creator',
  handle: 'my-space',
}
const avatar = 'data:image/jpeg;base64,YXZhdGFy'
const bitmap = { width: 400, height: 600, close: vi.fn() }
beforeEach(() => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(avatar)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('a selected image previews in the profile editor and is included with the saved profile', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const close = vi.fn()
  render(
    <CreatorProfileEditor profile={profile} onSave={save} onClose={close} />
  )
  await userEvent.upload(
    screen.getByLabelText('Profile picture', { selector: 'input' }),
    new File(['image'], 'avatar.webp', { type: 'image/webp' })
  )
  expect(await screen.findByRole('img')).toHaveAttribute('src', avatar)
  await userEvent.click(
    screen.getByRole('button', { name: 'Save creator profile' })
  )
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledWith({ ...profile, avatar })
})

test('restoring the default picture stays a draft until the whole profile is saved', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(
    <CreatorProfileEditor
      profile={{ ...profile, avatar }}
      onSave={save}
      onClose={vi.fn()}
    />
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Restore default picture' })
  )
  expect(screen.getByRole('img')).toHaveAttribute('src', '/skymoni-avatar.png')
  expect(save).not.toHaveBeenCalled()
  await userEvent.click(
    screen.getByRole('button', { name: 'Save creator profile' })
  )
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({ ...profile, avatar: '' })
  )
})

test('cancelling after choosing another image does not save the avatar', async () => {
  const save = vi.fn()
  const close = vi.fn()
  render(
    <CreatorProfileEditor profile={profile} onSave={save} onClose={close} />
  )
  await userEvent.upload(
    screen.getByLabelText('Profile picture', { selector: 'input' }),
    new File(['image'], 'avatar.png', { type: 'image/png' })
  )
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(close).toHaveBeenCalledOnce()
  expect(save).not.toHaveBeenCalled()
})

test('an oversized image is rejected while the previous avatar remains visible', async () => {
  render(
    <CreatorProfileEditor
      profile={{ ...profile, avatar }}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />
  )
  await userEvent.upload(
    screen.getByLabelText('Profile picture', { selector: 'input' }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
    })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Choose a PNG, JPEG or WebP image under 5 MB'
  )
  expect(screen.getByRole('img')).toHaveAttribute('src', avatar)
  expect(createImageBitmap).not.toHaveBeenCalled()
})

test('an undecodable image reports a readable error and preserves the previous avatar', async () => {
  vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('invalid image'))
  render(
    <CreatorProfileEditor
      profile={{ ...profile, avatar }}
      onSave={vi.fn()}
      onClose={vi.fn()}
    />
  )
  await userEvent.upload(
    screen.getByLabelText('Profile picture', { selector: 'input' }),
    new File(['not an image'], 'invalid.png', { type: 'image/png' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to read image'
  )
  expect(screen.getByRole('img')).toHaveAttribute('src', avatar)
})

test('pending save prevents duplicate submissions and failed save keeps the avatar available for retry', async () => {
  let fail: (cause: Error) => void = () => {}
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject
        })
    )
    .mockResolvedValueOnce(undefined)
  const close = vi.fn()
  render(
    <CreatorProfileEditor
      profile={{ ...profile, avatar }}
      onSave={save}
      onClose={close}
    />
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Save creator profile' })
  )
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  fail(new Error('offline'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save.')
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByRole('img')).toHaveAttribute('src', avatar)
  await userEvent.click(
    screen.getByRole('button', { name: 'Save creator profile' })
  )
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(save).toHaveBeenCalledTimes(2)
})

test('profile validation preserves old profiles and rejects remote or active avatar formats', () => {
  expect(creatorProfileSchema.safeParse(profile).success).toBe(true)
  for (const value of [
    'https://example.com/avatar.png',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'javascript:alert(1)',
  ]) {
    expect(
      creatorProfileSchema.safeParse({ ...profile, avatar: value }).success
    ).toBe(false)
  }
})
