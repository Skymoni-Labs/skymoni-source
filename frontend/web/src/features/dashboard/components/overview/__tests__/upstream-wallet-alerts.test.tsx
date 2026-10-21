import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  UpstreamWalletAlerts,
  walletMailThreshold,
} from '../upstream-wallet-alerts'

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: mocks }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const settings = {
  enabled: true,
  recipients: ['2924128981@qq.com'],
  shiba_threshold: 200,
  yylx_threshold: 1,
  oranexa_threshold: 0.3,
  revision: 2,
}
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <UpstreamWalletAlerts wallets={[]} />
    </QueryClientProvider>
  )
}
beforeEach(() => {
  mocks.get.mockResolvedValue({
    data: {
      success: true,
      data: { settings, deliveries: [], smtp_ready: true },
    },
  })
  mocks.put.mockImplementation(async (_, data) => ({
    data: { success: true, data: { ...data, revision: 3 } },
  }))
  mocks.post.mockResolvedValue({ data: { success: true } })
})
async function open() {
  const button = await screen.findByRole('button', { name: /邮件预警/ })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  await screen.findByText('上游余额邮件预警')
}
describe('upstream balance email settings', () => {
  it('adds recipients, saves original-unit thresholds and only tests saved recipients', async () => {
    mount()
    await open()
    fireEvent.change(screen.getByLabelText('新增收件邮箱'), {
      target: { value: 'second@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    fireEvent.change(screen.getByLabelText('柴犬 低于'), {
      target: { value: '250' },
    })
    expect(screen.getByRole('button', { name: '发送测试邮件' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存预警设置' }))
    await waitFor(() =>
      expect(mocks.put).toHaveBeenCalledWith(
        '/api/upstream-wallet/alerts',
        expect.objectContaining({
          recipients: ['2924128981@qq.com', 'second@example.com'],
          shiba_threshold: 250,
          yylx_threshold: 1,
          oranexa_threshold: 0.3,
          revision: 2,
        })
      )
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '发送测试邮件' })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole('button', { name: '发送测试邮件' }))
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        '/api/upstream-wallet/alerts/test',
        {}
      )
    )
  })
  it('removes a recipient without revealing any stored password', async () => {
    mount()
    await open()
    fireEvent.click(
      screen.getByRole('button', { name: '移除 2924128981@qq.com' })
    )
    expect(screen.queryByText('2924128981@qq.com')).toBeNull()
    expect(mocks.post).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('登录密码')).toBeNull()
  })
  it('uses matching provider thresholds including old Shiba accounts', () => {
    expect(
      walletMailThreshold(
        { provider: 'YYLX', name: 'a', threshold: 88 },
        settings
      )
    ).toBe(1)
    expect(
      walletMailThreshold(
        { provider: '2000run', name: 'b', threshold: 88 },
        settings
      )
    ).toBe(200)
    expect(
      walletMailThreshold(
        { provider: 'Moni', name: '柴犬 旧账号', threshold: 88 },
        settings
      )
    ).toBe(200)
    expect(
      walletMailThreshold(
        { provider: 'oranexa', name: 'c', threshold: 88 },
        settings
      )
    ).toBe(0.3)
  })
})
