import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { AppBetaManager } from '@/features/users/components/app-beta-manager'
import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import { AppBetaCard } from './app-beta-card'

const fixture = vi.hoisted(() => ({
  user: true,
  self: vi.fn(),
  apply: vi.fn(),
  pair: vi.fn(),
  revoke: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  review: vi.fn(),
  error: vi.fn(),
  account: {
    user_id: 123,
    status: 'pending',
    balance: 0,
    reserved: 0,
    used: 0,
    version: 7,
    application: '体验聊天',
    review_note: '',
  },
}))
const betaI18n = createInstance()
await betaI18n.init({ lng: 'en', resources: { en, zh } })
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: React.ReactNode }) => (
    <a href='/sign-in'>{children}</a>
  ),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      auth: {
        user: fixture.user ? { id: 123, role: 100 } : null,
        session: { sid: 'test-session' },
      },
    }),
}))
vi.mock('@/lib/handle-server-error', () => ({
  handleServerError: fixture.error,
}))
vi.mock('@/lib/currency', () => ({ getCurrencyLabel: () => 'USD' }))
vi.mock('@/lib/format', () => ({
  formatQuota: (amount: number) => `${amount} units`,
  parseQuotaFromDollars: (amount: number) => Math.round(amount * 500000),
}))
vi.mock('./app-beta-api', async (original) => ({
  ...(await original<typeof import('./app-beta-api')>()),
  betaSelf: fixture.self,
  betaApply: fixture.apply,
  betaPair: fixture.pair,
  betaRevokeDevice: fixture.revoke,
  betaList: fixture.list,
  betaDetail: fixture.detail,
  betaReview: fixture.review,
}))

beforeEach(async () => {
  await betaI18n.changeLanguage('en')
  fixture.user = true
  fixture.account = {
    user_id: 123,
    status: 'pending',
    balance: 0,
    reserved: 0,
    used: 0,
    version: 7,
    application: '体验聊天',
    review_note: '',
  }
  for (const method of [
    fixture.self,
    fixture.apply,
    fixture.pair,
    fixture.revoke,
    fixture.list,
    fixture.detail,
    fixture.review,
    fixture.error,
  ]) {
    method.mockReset()
  }
  fixture.self.mockImplementation(async () => ({
    account: fixture.account,
    devices: [],
    app_available: true,
  }))
  fixture.detail.mockImplementation(async () => ({
    account: fixture.account,
    ledger: [],
  }))
  fixture.list.mockResolvedValue({ items: [], total: 0, app_available: true })
  fixture.review.mockResolvedValue(null)
})
afterEach(cleanup)
function view(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={betaI18n}>{component}</I18nextProvider>
    </QueryClientProvider>
  )
  return { ...result, client }
}

test.each([
  ['Add', '1', 500000, '2500000 units'],
  ['Subtract', '1', -500000, '1500000 units'],
  ['Override', '6', 1000000, '3000000 units'],
  ['Override', '0', -2000000, '0 units'],
])(
  'beta %s previews and submits an independent versioned delta',
  async (mode, amount, delta, result) => {
    fixture.account.status = 'approved'
    fixture.account.balance = 2000000
    view(<AppBetaManager userId={123} open onOpenChange={vi.fn()} />)
    const click = userEvent.setup()
    await click.click(await screen.findByRole('button', { name: mode }))
    await click.type(screen.getByLabelText('Amount (USD)'), amount)
    expect(screen.getByTestId('beta-quota-preview')).toHaveTextContent(result)
    await click.click(
      screen.getByRole('button', { name: 'Adjust beta allowance' })
    )
    expect(fixture.review).not.toHaveBeenCalled()
    await click.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() =>
      expect(fixture.review).toHaveBeenCalledWith(
        123,
        expect.objectContaining({ action: 'adjust', amount: delta, version: 7 })
      )
    )
  }
)

test('adjustments require nonnegative amounts, prevent overdraft and reject unchanged overrides', async () => {
  fixture.account.status = 'approved'
  fixture.account.balance = 2000000
  view(<AppBetaManager userId={123} open onOpenChange={vi.fn()} />)
  const click = userEvent.setup()
  const input = await screen.findByLabelText('Amount (USD)')
  const submit = screen.getByRole('button', { name: 'Adjust beta allowance' })
  expect(submit).toBeDisabled()
  await click.type(input, '-1')
  expect(submit).toBeDisabled()
  await click.click(screen.getByRole('button', { name: 'Subtract' }))
  expect(input).toHaveValue('')
  await click.type(input, '5')
  expect(submit).toBeDisabled()
  await click.click(screen.getByRole('button', { name: 'Override' }))
  await click.type(input, '4')
  expect(submit).toBeDisabled()
  expect(fixture.review).not.toHaveBeenCalled()
})

test('confirmation keeps the reviewed target and version if account data refreshes', async () => {
  fixture.account.status = 'approved'
  fixture.account.balance = 2000000
  const { client } = view(
    <AppBetaManager userId={123} open onOpenChange={vi.fn()} />
  )
  const click = userEvent.setup()
  await click.click(await screen.findByRole('button', { name: 'Override' }))
  await click.type(screen.getByLabelText('Amount (USD)'), '1')
  await click.click(
    screen.getByRole('button', { name: 'Adjust beta allowance' })
  )
  act(() =>
    client.setQueryData(['admin-app-beta-detail', 123, 'test-session', 123], {
      account: { ...fixture.account, balance: 3000000, version: 8 },
      ledger: [],
    })
  )
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    '2000000 units → 500000 units'
  )
  await click.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() =>
    expect(fixture.review).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ amount: -1500000, version: 7 })
    )
  )
})

test('admin renders an empty pending list when the server returns null items', async () => {
  fixture.list.mockResolvedValue({
    items: null,
    total: 0,
    app_available: false,
  })
  view(<AppBetaManager open onOpenChange={vi.fn()} />)
  expect(await screen.findByRole('table')).toBeInTheDocument()
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  expect(fixture.error).not.toHaveBeenCalled()
})

test('approved accounts render with no bound devices when the server returns null', async () => {
  fixture.self.mockResolvedValue({
    account: { ...fixture.account, status: 'approved' },
    devices: null,
    app_available: false,
  })
  view(<AppBetaCard />)
  expect(await screen.findByText('Beta enabled')).toBeInTheDocument()
})

test('admin renders an account whose ledger is still empty on the server', async () => {
  fixture.detail.mockResolvedValue({ account: fixture.account, ledger: null })
  view(<AppBetaManager userId={123} open onOpenChange={vi.fn()} />)
  expect(await screen.findByLabelText('Allowance (USD)')).toBeInTheDocument()
})
test('visitors see the registration entry and cannot submit anonymous applications', () => {
  fixture.user = false
  view(<AppBetaCard />)
  expect(
    screen.getByRole('link', { name: 'Sign in or register to apply' })
  ).toBeInTheDocument()
  expect(fixture.self).not.toHaveBeenCalled()
  expect(fixture.apply).not.toHaveBeenCalled()
})

test('the community card uses the real Chinese translation namespace', async () => {
  fixture.user = false
  await betaI18n.changeLanguage('zh')
  view(<AppBetaCard />)
  expect(screen.getByText('Skivu App 内测')).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: '登录或注册后申请' })
  ).toBeInTheDocument()
})
test('application sends only a note and pending state never offers gifted credit', async () => {
  fixture.account.status = 'none'
  fixture.apply.mockImplementation(async () => {
    fixture.account.status = 'pending'
  })
  view(<AppBetaCard />)
  const click = userEvent.setup()
  await click.type(
    await screen.findByLabelText('Application note (optional)'),
    '测试手机交互'
  )
  await click.click(
    screen.getByRole('button', { name: 'Apply for beta access' })
  )
  await screen.findByText('Awaiting review')
  expect(fixture.apply).toHaveBeenCalledExactlyOnceWith('测试手机交互')
  expect(
    screen.queryByLabelText('Pairing code shown in the App')
  ).not.toBeInTheDocument()
})
test('approved accounts require device pairing confirmation before spending access is granted', async () => {
  fixture.account.status = 'approved'
  view(<AppBetaCard />)
  const click = userEvent.setup()
  await click.type(
    await screen.findByLabelText('Pairing code shown in the App'),
    'ABCD-EF01-2345-6789'
  )
  await click.click(screen.getByRole('button', { name: 'Connect my App' }))
  expect(fixture.pair).not.toHaveBeenCalled()
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    'Only enter a code from the Skivu App on your own phone.'
  )
  await click.click(screen.getByRole('button', { name: /^Connect$/ }))
  await waitFor(() =>
    expect(fixture.pair).toHaveBeenCalledExactlyOnceWith('ABCD-EF01-2345-6789')
  )
})
test('admin approval requires explicit manual credit and sends versioned independent quota command', async () => {
  view(<AppBetaManager userId={123} open onOpenChange={vi.fn()} />)
  const click = userEvent.setup()
  const amount = await screen.findByLabelText('Allowance (USD)')
  const approve = screen.getByRole('button', {
    name: 'Approve and assign allowance',
  })
  expect(approve).toBeDisabled()
  await click.type(amount, 'NaN')
  expect(approve).toBeDisabled()
  await click.clear(amount)
  await click.type(amount, '2')
  await click.click(approve)
  expect(fixture.review).not.toHaveBeenCalled()
  await click.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(fixture.review).toHaveBeenCalledOnce())
  expect(fixture.review).toHaveBeenCalledWith(123, {
    action: 'approve',
    amount: 1000000,
    version: 7,
    note: '',
    operation_id: expect.any(String),
  })
})
test('admin can explicitly approve with zero credit and invalid requests do not show a successful status', async () => {
  fixture.review.mockRejectedValue(new Error('stale review'))
  view(<AppBetaManager userId={123} open onOpenChange={vi.fn()} />)
  const click = userEvent.setup()
  await click.type(await screen.findByLabelText('Allowance (USD)'), '0')
  await click.click(
    screen.getByRole('button', { name: 'Approve and assign allowance' })
  )
  await click.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(fixture.error).toHaveBeenCalledOnce())
  expect(fixture.review).toHaveBeenCalledWith(
    123,
    expect.objectContaining({ amount: 0 })
  )
  expect(screen.getByText('#123 · Awaiting review')).toBeInTheDocument()
})

test('native account entry explains App login without suggesting the disabled legacy pairing flow', async () => {
  fixture.self.mockResolvedValue({
    account: { ...fixture.account, status: 'approved' },
    devices: null,
    app_available: false,
  })
  view(<AppBetaCard nativeAppLogin />)
  expect(
    await screen.findByText(/使用同一社区账号登录 Skivu/)
  ).toBeInTheDocument()
  expect(
    screen.queryByLabelText('Pairing code shown in the App')
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText(
      'App connection is not open yet. Your approved allowance is reserved for the App.'
    )
  ).not.toBeInTheDocument()
  expect(fixture.pair).not.toHaveBeenCalled()
  expect(fixture.apply).not.toHaveBeenCalled()
})
