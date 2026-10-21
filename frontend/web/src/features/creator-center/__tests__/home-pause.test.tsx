import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { CreatorHomeState, HomeRequest } from '../home-api'
import { CreatorHomepagePanel } from '../home-panel'
import { emptyWork } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
afterEach(cleanup)

function state(): CreatorHomeState {
  return {
    config: {
      galleryEnabled: true,
      marqueeEnabled: true,
      autoAddCreators: true,
      revision: 'config',
    },
    works: [
      {
        ...emptyWork(),
        id: 'horizon',
        title: 'Published project',
        status: 'published',
      },
    ],
    cards: [
      {
        workId: 'horizon',
        ownerId: 1,
        image: 'data:image/jpeg;base64,abc',
        approvedImage: 'data:image/jpeg;base64,abc',
        status: 'approved',
        note: '',
        revision: 'r1',
        expiresAt: Date.now() / 1000 + 86400,
        permanent: false,
        hidden: false,
        ownerPaused: false,
        position: 0,
        updatedAt: 1,
      },
    ],
    authors: [],
    orders: [],
    balance: 123,
  }
}
function mount(data: CreatorHomeState, fail = false) {
  const request = vi.fn(async (path: string, options?: { data?: unknown }) => {
    if (path.endsWith('/display')) {
      if (fail) throw new Error('展示状态已更新，请刷新后重试')
      const input = options?.data as { paused: boolean; revision: string }
      data = {
        ...data,
        cards: [
          {
            ...data.cards[0],
            ownerPaused: input.paused,
            revision: input.paused ? 'r2' : 'r3',
          },
        ],
      }
    }
    return data
  })
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <CreatorHomepagePanel
        preview
        request={request as unknown as HomeRequest}
      />
    </QueryClientProvider>
  )
  return request
}
test('owner can pause and resume an existing paid placement without another purchase', async () => {
  const data = state()
  const request = mount(data)
  fireEvent.click(await screen.findByRole('button', { name: '暂停展示' }))
  await screen.findByText('你已暂停首页展示')
  expect(request).toHaveBeenCalledWith(
    '/me/home/cards/horizon/display',
    expect.objectContaining({
      method: 'put',
      data: { paused: true, revision: 'r1' },
    })
  )
  fireEvent.click(screen.getByRole('button', { name: '恢复展示' }))
  await screen.findByText('正在首页展示')
  expect(request).toHaveBeenCalledWith(
    '/me/home/cards/horizon/display',
    expect.objectContaining({ data: { paused: false, revision: 'r2' } })
  )
  expect(request.mock.calls.some(([path]) => path.endsWith('/purchase'))).toBe(
    false
  )
  expect(screen.getByText('123 额度')).toBeInTheDocument()
  expect(screen.getByText(/暂停不退款、不延长有效期/)).toBeInTheDocument()
})
test.each(['hidden', 'expired', 'module'] as const)(
  'restore is disabled when %s prevents display',
  async (reason) => {
    const data = state()
    data.cards[0].ownerPaused = true
    if (reason === 'hidden') data.cards[0].hidden = true
    if (reason === 'expired') data.cards[0].expiresAt = 1
    if (reason === 'module') data.config.galleryEnabled = false
    mount(data)
    expect(
      await screen.findByRole('button', { name: '恢复展示' })
    ).toBeDisabled()
  }
)
test('unpaid creators see the control and instructions but cannot activate it', async () => {
  const data = state()
  data.cards = []
  mount(data)
  expect(await screen.findByRole('button', { name: '暂停展示' })).toBeDisabled()
  expect(
    screen.getByText('卡片审核通过并支付后，即可自行暂停或恢复。')
  ).toBeInTheDocument()
})
test('a failed pause keeps the current display state and shows an error', async () => {
  mount(state(), true)
  fireEvent.click(await screen.findByRole('button', { name: '暂停展示' }))
  await screen.findByRole('alert')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '暂停展示' })).toBeEnabled()
  )
  expect(screen.getByText('正在首页展示')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: '恢复展示' })
  ).not.toBeInTheDocument()
})
