import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

const router = vi.hoisted(() => ({ invalidate: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  router.invalidate.mockReset()
})

import { resolveAuthentication } from '@/lib/auth-session'
vi.mock('@/lib/auth-session', () => ({ resolveAuthentication: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  Link: () => null,
  useRouter: () => router,
}))
vi.mock('@/features/errors/general-error', () => ({ GeneralError: () => null }))
import {
  AuthSessionUnavailableError,
  resolveRouteAuthentication,
} from './lib/session-route-auth'
import { AuthSessionError } from './session-recovery'
test('temporary refresh failure cannot fall through to a password form', async () => {
  vi.mocked(resolveAuthentication).mockResolvedValue({
    kind: 'transient_error',
    error: new Error('429'),
  })
  await expect(resolveRouteAuthentication()).rejects.toBeInstanceOf(
    AuthSessionUnavailableError
  )
  render(<AuthSessionError error={new AuthSessionUnavailableError()} />)
  expect(screen.getByRole('button', { name: /秒后自动重试/ })).toBeDisabled()
  expect(screen.queryByLabelText('密码')).not.toBeInTheDocument()
})

test('recovery automatically retries after the server deadline without requiring a password', async () => {
  vi.useFakeTimers()
  render(
    <AuthSessionError
      error={new AuthSessionUnavailableError(Date.now() + 3000)}
    />
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2999)
  })
  expect(router.invalidate).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(router.invalidate).toHaveBeenCalledTimes(1)
  expect(screen.queryByLabelText('密码')).not.toBeInTheDocument()
})
test('server-confirmed anonymous and authenticated outcomes can proceed normally', async () => {
  vi.mocked(resolveAuthentication).mockResolvedValue({ kind: 'anonymous' })
  expect((await resolveRouteAuthentication()).kind).toBe('anonymous')
})
