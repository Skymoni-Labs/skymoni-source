import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { login, register } from '../../api'
import { SignUpForm } from '../components/sign-up-form'

const flow = vi.hoisted(() => ({
  enabled: false,
  redirectToLogin: vi.fn(),
  handleLoginResult: vi.fn(async () => true),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../../api', () => ({
  login: vi.fn(async () => ({ success: true, data: { testBundle: true } })),
  register: vi.fn(async () => ({ success: true })),
  wechatLoginByCode: vi.fn(),
}))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: {},
  }),
}))
vi.mock('../../hooks/use-auth-redirect', () => ({
  useAuthRedirect: () => ({
    redirectToLogin: flow.redirectToLogin,
    handleLoginResult: flow.handleLoginResult,
  }),
}))
vi.mock('../../hooks/use-email-verification', () => ({
  useEmailVerification: () => ({ sendCode: vi.fn() }),
}))
vi.mock('../../hooks/use-turnstile', () => ({
  useTurnstile: () => ({
    isTurnstileEnabled: flow.enabled,
    turnstileToken: flow.enabled ? 'test-challenge' : undefined,
    validateTurnstile: () => true,
  }),
}))
vi.mock('../../components/oauth-providers', () => ({
  OAuthProviders: () => null,
}))
vi.mock('../../components/legal-consent', () => ({ LegalConsent: () => null }))
beforeEach(() => {
  window.history.replaceState(null, '', '/sign-up')
  flow.enabled = false
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})
it('submits the redemption code entered on the registration form', async () => {
  render(<SignUpForm />)
  await userEvent.type(screen.getByLabelText('Username'), 'invite-user')
  await userEvent.type(
    screen.getByLabelText('Password', { exact: true }),
    'testing-pass-123'
  )
  await userEvent.type(
    screen.getByLabelText('Confirm password'),
    'testing-pass-123'
  )
  await userEvent.type(
    screen.getByLabelText('Redemption code (optional)'),
    'mycode'
  )
  await userEvent.click(screen.getByRole('button', { name: /Create/ }))
  await waitFor(() =>
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ redemption_code: 'mycode', aff_code: '' })
    )
  )
})

it('allows registration without a redemption code', async () => {
  render(<SignUpForm />)
  await userEvent.type(screen.getByLabelText('Username'), 'normal-user')
  await userEvent.type(
    screen.getByLabelText('Password', { exact: true }),
    'testing-pass-123'
  )
  await userEvent.type(
    screen.getByLabelText('Confirm password'),
    'testing-pass-123'
  )
  await userEvent.click(screen.getByRole('button', { name: /Create/ }))
  await waitFor(() =>
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ redemption_code: '' })
    )
  )
})

it('signs in after a Git-originated registration and preserves the Git return', async () => {
  const target = '/git-authorize?request=' + 'a'.repeat(43) + '&method=register'
  window.history.replaceState(
    null,
    '',
    '/sign-up?redirect=' + encodeURIComponent(target)
  )
  render(<SignUpForm />)
  await userEvent.type(screen.getByLabelText('Username'), 'git-user')
  await userEvent.type(
    screen.getByLabelText('Password', { exact: true }),
    'testing-pass-123'
  )
  await userEvent.type(
    screen.getByLabelText('Confirm password'),
    'testing-pass-123'
  )
  await userEvent.click(screen.getByRole('button', { name: /Create/ }))
  await waitFor(() =>
    expect(flow.handleLoginResult).toHaveBeenCalledWith(
      { testBundle: true },
      target
    )
  )
  expect(login).toHaveBeenCalledWith(
    expect.objectContaining({ username: 'git-user' })
  )
  expect(flow.redirectToLogin).not.toHaveBeenCalled()
})

it('keeps the return path but requires a fresh sign-in challenge when Turnstile is enabled', async () => {
  flow.enabled = true
  const target = '/git-authorize?request=' + 'a'.repeat(43)
  window.history.replaceState(
    null,
    '',
    '/sign-up?redirect=' + encodeURIComponent(target)
  )
  render(<SignUpForm />)
  await userEvent.type(screen.getByLabelText('Username'), 'git-user')
  await userEvent.type(
    screen.getByLabelText('Password', { exact: true }),
    'testing-pass-123'
  )
  await userEvent.type(
    screen.getByLabelText('Confirm password'),
    'testing-pass-123'
  )
  await userEvent.click(screen.getByRole('button', { name: /Create/ }))
  await waitFor(() => expect(flow.redirectToLogin).toHaveBeenCalled())
  expect(login).not.toHaveBeenCalled()
})

it('community registration has no redemption step and returns directly to the community', async () => {
  const target = '/creators/topics/a-topic'
  window.history.replaceState(
    null,
    '',
    '/sign-up?redirect=' + encodeURIComponent(target)
  )
  render(<SignUpForm />)
  expect(
    screen.queryByLabelText('Redemption code (optional)')
  ).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Username'), 'community-user')
  await userEvent.type(
    screen.getByLabelText('Password', { exact: true }),
    'testing-pass-123'
  )
  await userEvent.type(
    screen.getByLabelText('Confirm password'),
    'testing-pass-123'
  )
  await userEvent.click(
    screen.getByRole('button', { name: '免费注册并加入社区' })
  )
  await waitFor(() =>
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ redemption_code: '' })
    )
  )
  await waitFor(() =>
    expect(flow.handleLoginResult).toHaveBeenCalledWith(
      { testBundle: true },
      target
    )
  )
})

it('community registration keeps challenge checks and falls back to sign-in when required', async () => {
  flow.enabled = true
  window.history.replaceState(null, '', '/sign-up?redirect=%2Fcreators')
  render(<SignUpForm />)
  await userEvent.type(screen.getByLabelText('Username'), 'community-user')
  await userEvent.type(
    screen.getByLabelText('Password', { exact: true }),
    'testing-pass-123'
  )
  await userEvent.type(
    screen.getByLabelText('Confirm password'),
    'testing-pass-123'
  )
  await userEvent.click(
    screen.getByRole('button', { name: '免费注册并加入社区' })
  )
  await waitFor(() => expect(flow.redirectToLogin).toHaveBeenCalled())
  expect(login).not.toHaveBeenCalled()
})
