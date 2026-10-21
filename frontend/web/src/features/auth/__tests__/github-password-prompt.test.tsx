import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

import { GitHubPasswordPromptHost } from '../components/github-password-prompt'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const bundle: AuthBundle = {
  access_token: 'test-access',
  token_type: 'Bearer',
  access_expires_at: 2000000000,
  user: {
    id: 12,
    username: 'new-github-creator',
    github_id: '12345',
    has_password: false,
    role: 1,
  },
  session: {
    sid: 'test-session',
    current: true,
    login_method: 'oauth:github',
    ip: '',
    user_agent: '',
    created_at: 1,
    last_active_at: 1,
    expires_at: 2000000000,
  },
}

let client: QueryClient
beforeEach(() => {
  localStorage.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(STATUS_QUERY_KEY, {})
  useAuthStore.getState().auth.setBundle(bundle)
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  localStorage.clear()
  useAuthStore.getState().auth.reset('idle')
})

async function showPrompt(pathname = '/dashboard') {
  const root = createRootRoute({ component: GitHubPasswordPromptHost })
  const page = createRoute({ getParentRoute: () => root, path: '$' })
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

test('GitHub login without a password explains both login methods and shows the actual account name', async () => {
  await showPrompt('/creators/workspace')
  expect(
    await screen.findByRole('dialog', {
      name: 'Add a password to your account',
    })
  ).toBeVisible()
  expect(screen.getByText('new-github-creator')).toBeVisible()
  expect(
    screen.getByText(
      'You can keep using GitHub and set a password later in Security & Access.'
    )
  ).toBeVisible()
})

test.each([
  [
    'already has a password',
    { ...bundle.user, has_password: true },
    'oauth:github',
  ],
  [
    'password state is unknown',
    { ...bundle.user, has_password: undefined },
    'oauth:github',
  ],
  ['GitHub is not bound', { ...bundle.user, github_id: '' }, 'oauth:github'],
  ['signed in using another method', bundle.user, 'password'],
])('does not interrupt a user who %s', async (_label, user, method) => {
  useAuthStore.getState().auth.setBundle({
    ...bundle,
    user,
    session: { ...bundle.session, login_method: method },
  })
  await showPrompt()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('anonymous users and unfinished OAuth callbacks are not prompted', async () => {
  useAuthStore.getState().auth.reset()
  const anonymous = await showPrompt()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  anonymous.unmount()
  useAuthStore.getState().auth.setBundle(bundle)
  await showPrompt('/oauth/github')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('later dismisses across remounts in this browser without hiding the reminder for another account', async () => {
  const view = await showPrompt()
  await userEvent.click(
    await screen.findByRole('button', { name: 'Maybe later' })
  )
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  view.unmount()
  await showPrompt()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  act(() => {
    useAuthStore.getState().auth.setBundle({
      ...bundle,
      user: { ...bundle.user, id: 13, username: 'another-creator' },
    })
  })
  expect(await screen.findByText('another-creator')).toBeVisible()
})

test('set password opens the existing password form without requiring an old password or changing credentials', async () => {
  const put = vi.spyOn(api, 'put')
  await showPrompt()
  await userEvent.click(
    await screen.findByRole('button', { name: 'Set Password' })
  )
  expect(
    await screen.findByRole('dialog', { name: 'Set Password' })
  ).toBeVisible()
  expect(screen.getByLabelText('New Password')).toBeVisible()
  expect(screen.getByLabelText('Confirm New Password')).toBeVisible()
  expect(screen.queryByLabelText('Current Password')).not.toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(put).not.toHaveBeenCalled()
})

test('changing account while the password form is open removes the previous account form', async () => {
  await showPrompt()
  await userEvent.click(
    await screen.findByRole('button', { name: 'Set Password' })
  )
  await screen.findByLabelText('New Password')
  act(() => {
    useAuthStore.getState().auth.setBundle({
      ...bundle,
      user: { ...bundle.user, id: 13, has_password: true },
      session: { ...bundle.session, sid: 'other-session' },
    })
  })
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
})

test('unavailable browser storage still allows dismissal during the current session', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  await showPrompt()
  await userEvent.click(
    await screen.findByRole('button', { name: 'Maybe later' })
  )
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
})
