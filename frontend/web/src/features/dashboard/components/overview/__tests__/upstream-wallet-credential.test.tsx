import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UpstreamWalletCredential } from '../upstream-wallet-credential'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  encrypt: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, put: mocks.put },
}))
vi.mock('@/features/auth/lib/password-encryption', () => ({
  encryptPassword: mocks.encrypt,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const login = {
  username: 'provider-user',
  password: 'test-provider-pass',
  login_url: 'https://provider.example/login',
  note: 'saved record',
}
function mount(walletID = 1) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <UpstreamWalletCredential walletID={walletID} />
      </QueryClientProvider>
    ),
  }
}
async function unlock() {
  await screen.findByRole('button', { name: '查看密码' })
  fireEvent.change(screen.getByLabelText('统一查看密钥'), {
    target: { value: 'test-view-key' },
  })
  fireEvent.click(screen.getByRole('button', { name: '查看密码' }))
  await screen.findByTestId('revealed-wallet-password')
}
beforeEach(() => {
  mocks.get.mockResolvedValue({
    data: {
      success: true,
      data: { configured: true, exists: true, updated_at: 1 },
    },
  })
  mocks.post.mockResolvedValue({ data: { success: true, data: login } })
  mocks.put.mockResolvedValue({ data: { success: true } })
  mocks.encrypt.mockResolvedValue({
    password_encrypted: 'encrypted-proof',
    encryption_key_id: 'test-kid',
  })
})
describe('wallet password access', () => {
  it('does not fetch plaintext until unlocked and does not cache returned passwords', async () => {
    const { client } = mount()
    await screen.findByRole('button', { name: '查看密码' })
    expect(mocks.post).not.toHaveBeenCalled()
    expect(screen.queryByText(login.password)).toBeNull()
    await unlock()
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/upstream-wallet/1/credential/reveal',
      {
        unlock_key_encrypted: 'encrypted-proof',
        encryption_key_id: 'test-kid',
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data)
      )
    ).not.toContain(login.password)
    expect(localStorage.getItem('upstream-wallet-password')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '隐藏密码' }))
    expect(screen.queryByTestId('revealed-wallet-password')).toBeNull()
    expect(screen.getByLabelText('统一查看密钥')).toHaveValue('')
  })
  it('shows a rejected unlock without showing a password', async () => {
    mocks.post.mockRejectedValue({
      response: { data: { message: '查看密钥不正确' } },
    })
    mount()
    await screen.findByRole('button', { name: '查看密码' })
    fireEvent.change(screen.getByLabelText('统一查看密钥'), {
      target: { value: 'wrong-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: '查看密码' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('查看密钥不正确')
    expect(screen.queryByText(login.password)).toBeNull()
  })
  it('hides secrets when the page goes into the background', async () => {
    mount()
    await unlock()
    const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden')
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    })
    fireEvent(document, new Event('visibilitychange'))
    expect(screen.queryByTestId('revealed-wallet-password')).toBeNull()
    expect(screen.getByLabelText('统一查看密钥')).toHaveValue('')
    if (descriptor) Object.defineProperty(document, 'hidden', descriptor)
    else delete (document as unknown as { hidden?: boolean }).hidden
  })
  it('ignores a late reveal response after the component is closed', async () => {
    let resolve: (value: unknown) => void = () => {}
    mocks.post.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r
        })
    )
    const view = mount()
    await screen.findByRole('button', { name: '查看密码' })
    fireEvent.change(screen.getByLabelText('统一查看密钥'), {
      target: { value: 'test-view-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: '查看密码' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalled())
    view.unmount()
    await act(async () => {
      resolve({ data: { success: true, data: login } })
    })
    expect(screen.queryByText(login.password)).toBeNull()
  })
  it('encrypts edited credentials before saving and clears secrets after success', async () => {
    mount()
    await unlock()
    fireEvent.click(screen.getByRole('button', { name: '修改记录' }))
    fireEvent.change(screen.getByLabelText('登录密码'), {
      target: { value: 'new-test-provider-pass' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存凭据' }))
    await waitFor(() => expect(mocks.put).toHaveBeenCalled())
    const payload = mocks.put.mock.calls[0][1]
    expect(JSON.stringify(payload)).not.toContain('new-test-provider-pass')
    expect(JSON.stringify(payload)).not.toContain('test-view-key')
    await waitFor(() =>
      expect(screen.getByLabelText('统一查看密钥')).toHaveValue('')
    )
    expect(screen.queryByTestId('revealed-wallet-password')).toBeNull()
  })
})
