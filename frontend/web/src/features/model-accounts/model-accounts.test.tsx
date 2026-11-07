import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getChannel } from '@/features/channels/api'
import type { Channel } from '@/features/channels/types'

import {
  affectedModels,
  balanceLabel,
  getModelAccounts,
  parsePriority,
  orderedAccounts,
  priorityLabel,
  saveAccountPriority,
  type AccountModel,
} from './api'
import { ModelAccountsContent } from './index'
import { getProviderCatalog } from './providers'

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  getModelAccounts: vi.fn(),
  saveAccountPriority: vi.fn(),
}))
vi.mock('./providers', async (original) => ({
  ...(await original<typeof import('./providers')>()),
  getProviderCatalog: vi.fn(),
}))
vi.mock('@/features/channels/components/drawers/channel-mutate-drawer', () => ({
  ChannelMutateDrawer: ({
    open,
    currentRow,
  }: {
    open: boolean
    currentRow: Channel | null
  }) =>
    open && (
      <div data-testid='channel-settings'>编辑渠道 #{currentRow?.id}</div>
    ),
}))
vi.mock('@/features/channels/api', () => ({ getChannel: vi.fn() }))
vi.mock(
  '@/features/dashboard/components/overview/upstream-wallet-credential',
  () => ({
    UpstreamWalletCredential: ({
      walletID,
      title,
    }: {
      walletID: number
      title?: string
    }) => (
      <div data-testid='account-credential' data-wallet-id={walletID}>
        {title}
      </div>
    ),
  })
)
vi.mock('@/components/layout', () => {
  const Container = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )
  return {
    SectionPageLayout: Object.assign(Container, {
      Title: Container,
      Actions: Container,
      Content: Container,
    }),
  }
})

const fixture: AccountModel[] = [
  {
    model: 'deepseek-v4.1-flash-s',
    channels: 2,
    enabled: 1,
    accounts: [
      {
        id: 134,
        name: 'Oranexa 1357374054',
        provider: 'oranexa',
        remaining: 42.5,
        unit: 'CNY',
        pending: 0,
        enabled: 1,
        version: 'a'.repeat(64),
        channels: [
          {
            id: 1818,
            name: 'Sol 01',
            status: 1,
            priority: 400,
            weight: 1,
            groups: ['deepseek'],
            models: ['deepseek-v4.1-flash-s', 'shared-alias'],
            upstream_model: 'gpt-6.1-sol',
          },
          {
            id: 1819,
            name: 'Sol 02',
            status: 2,
            priority: 250,
            weight: 1,
            groups: ['deepseek'],
            models: ['deepseek-v4.1-flash-s'],
            upstream_model: 'gpt-6.1-sol',
          },
        ],
      },
    ],
  },
]

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <ModelAccountsContent />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.mocked(getProviderCatalog).mockResolvedValue({
    models: [{ model_name: fixture[0].model, name_rule: 0, vendor_id: 1 }],
    vendors: [{ id: 1, name: 'DeepSeek', icon: 'DeepSeek.Color' }],
  })
  vi.mocked(getModelAccounts).mockResolvedValue(structuredClone(fixture))
  vi.mocked(saveAccountPriority).mockReset()
  vi.mocked(getChannel).mockReset()
})

describe('model account management', () => {
  it('filters models by their registered provider rather than their upstream account', async () => {
    const other = { ...structuredClone(fixture[0]), model: 'gpt-6.1-sol' }
    other.accounts[0].name = 'GPT provider account'
    other.accounts[0].id = 143
    vi.mocked(getModelAccounts).mockResolvedValue([
      ...structuredClone(fixture),
      other,
    ])
    vi.mocked(getProviderCatalog).mockResolvedValue({
      models: [
        { model_name: fixture[0].model, name_rule: 0, vendor_id: 1 },
        { model_name: other.model, name_rule: 0, vendor_id: 2 },
      ],
      vendors: [
        { id: 1, name: 'DeepSeek' },
        { id: 2, name: 'OpenAI' },
      ],
    })
    mount()
    const choices = screen.getByRole('group', { name: '提供商' })
    fireEvent.click(
      await within(choices).findByRole('button', { name: 'OpenAI，1 个模型' })
    )
    expect(
      screen.getByRole('region', { name: 'OpenAI 模型' })
    ).toBeInTheDocument()
    expect(screen.queryByText(fixture[0].model)).toBeNull()
    expect(screen.getByText(other.model)).toBeInTheDocument()
    fireEvent.click(
      within(choices).getByRole('button', { name: 'DeepSeek，1 个模型' })
    )
    expect(screen.getByText(fixture[0].model)).toBeInTheDocument()
    expect(screen.queryByText(other.model)).toBeNull()
  })

  it('keeps account controls available when provider metadata cannot load', async () => {
    vi.mocked(getProviderCatalog).mockRejectedValue(
      new Error('temporary unavailable')
    )
    mount()
    expect(
      await screen.findByText('提供商资料暂时不可用，暂按模型名称归类。')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '调优先级' })).toBeInTheDocument()
  })
  it('lists accounts and opens exact channel details with disabled state', async () => {
    mount()
    await screen.findByText('Oranexa 1357374054')
    expect(screen.getByText('优先级 400 / 250')).toBeInTheDocument()
    expect(screen.getByText('余额 ≈ 42.5 CNY')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Oranexa 1357374054/ }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByTestId('account-credential')).toHaveAttribute(
      'data-wallet-id',
      '134'
    )
    expect(within(sheet).getByText('上游网址与账号密码')).toBeInTheDocument()
    expect(within(sheet).getByText('#1818 · Sol 01')).toBeInTheDocument()
    expect(within(sheet).getByText('已停用')).toBeInTheDocument()
    expect(
      within(sheet).getAllByRole('button', { name: /渠道详情与设置/ })
    ).toHaveLength(2)
  })

  it('previews shared aliases and submits only the confirmed account snapshot', async () => {
    vi.mocked(saveAccountPriority).mockResolvedValue({ updated: 2 })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '调优先级' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('note')).toHaveTextContent('shared-alias')
    expect(within(dialog).getByText(/包含 1 条已停用渠道/)).toBeInTheDocument()
    const save = within(dialog).getByRole('button', {
      name: '确认更新 2 条渠道',
    })
    expect(save).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('新的优先级'), {
      target: { value: '450' },
    })
    fireEvent.click(save)
    await waitFor(() =>
      expect(saveAccountPriority).toHaveBeenCalledWith(
        {
          model: fixture[0].model,
          account_id: 134,
          version: 'a'.repeat(64),
          priority: 450,
        },
        expect.anything()
      )
    )
  })

  it('keeps a failed or stale confirmation open with an actionable error', async () => {
    vi.mocked(saveAccountPriority).mockRejectedValue(
      new Error('渠道或账户配置已变化，请刷新后重新确认')
    )
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '调优先级' }))
    fireEvent.change(screen.getByLabelText('新的优先级'), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByRole('button', { name: '确认更新 2 条渠道' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请刷新后重新确认'
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('filters by actual upstream model and shows empty search results', async () => {
    mount()
    await screen.findByText('Oranexa 1357374054')
    fireEvent.change(screen.getByLabelText('搜索模型或账户'), {
      target: { value: 'gpt-6.1-sol' },
    })
    expect(screen.getByText('Oranexa 1357374054')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('搜索模型或账户'), {
      target: { value: 'missing-account' },
    })
    expect(screen.getByText('没有找到匹配的模型或账户')).toBeInTheDocument()
  })

  it('opens the existing settings drawer for the clicked channel ID', async () => {
    vi.mocked(getChannel).mockResolvedValue({
      success: true,
      data: { id: 1819 } as Channel,
    })
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: /Oranexa 1357374054/ })
    )
    fireEvent.click(
      screen.getAllByRole('button', { name: '渠道详情与设置' })[1]
    )
    expect(await screen.findByTestId('channel-settings')).toHaveTextContent(
      '编辑渠道 #1819'
    )
    expect(getChannel).toHaveBeenCalledWith(1819)
  })
})

describe('priority preview', () => {
  it('shows every tier and other affected aliases', () => {
    expect(priorityLabel(fixture[0].accounts[0])).toBe('400 / 250')
    expect(affectedModels(fixture[0].model, fixture[0].accounts[0])).toEqual([
      'shared-alias',
    ])
    const first = fixture[0].accounts[0]
    const lower = {
      ...first,
      id: 99,
      channels: [{ ...first.channels[0], priority: 100 }],
    }
    expect(orderedAccounts([lower, first]).map((a) => a.id)).toEqual([134, 99])
    expect(balanceLabel({ ...first, remaining: 0 })).toBe('余额 ≈ 0 CNY')
    expect(balanceLabel({ ...first, remaining: null })).toBe('余额待核对')
  })
  it.each(['', '1.5', '1e3', 'NaN', '2147483648', '-2147483649'])(
    'rejects invalid priority %s',
    (value) => {
      expect(parsePriority(value)).toBeNull()
    }
  )
  it.each([0, -900, 400, -2147483648, 2147483647])(
    'accepts integer priority %s',
    (value) => {
      expect(parsePriority(String(value))).toBe(value)
    }
  )
})
