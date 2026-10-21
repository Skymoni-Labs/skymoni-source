import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import { MailRecipientPicker } from '../components/recipient-picker'

const mocks = vi.hoisted(() => ({ search: vi.fn(), error: vi.fn() }))
vi.mock('@/features/users/api', () => ({ searchUsers: mocks.search }))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: mocks.error }))
vi.mock('@/hooks/use-debounce', () => ({
  useDebounce: (value: string) => value,
}))
const user = (id: number, overrides = {}) => ({
  id,
  username: `user${id}`,
  display_name: `User ${id}`,
  email: `u${id}@example.invalid`,
  status: 1,
  ...overrides,
})
const result = (
  items: ReturnType<typeof user>[],
  total = items.length,
  pageSize = 50
) => ({ success: true, data: { items, total, page_size: pageSize, page: 1 } })
function Fixture({ initial = [] }: { initial?: number[] }) {
  const [value, onChange] = useState(initial)
  return (
    <>
      <MailRecipientPicker value={value} onChange={onChange} />
      <output data-testid='ids'>{JSON.stringify(value)}</output>
    </>
  )
}
function setup(initial: number[] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <Fixture initial={initial} />
    </QueryClientProvider>
  )
  return { client, ...view }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.search.mockResolvedValue(
    result([user(1), user(2), user(3, { email: '' }), user(4, { status: 2 })])
  )
})

test('users can be checked continuously; unavailable accounts are disabled and clear works', async () => {
  setup()
  await userEvent.click(
    await screen.findByRole('checkbox', { name: /user1 \(#1\)/ })
  )
  await userEvent.click(screen.getByRole('checkbox', { name: /user2 \(#2\)/ }))
  expect(screen.getByTestId('ids')).toHaveTextContent('[1,2]')
  expect(
    screen.getByRole('checkbox', { name: /user3 \(#3\)/ })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(
    screen.getByRole('checkbox', { name: /user4 \(#4\)/ })
  ).toHaveAttribute('aria-disabled', 'true')
  await userEvent.click(screen.getByRole('button', { name: '清空已选' }))
  expect(screen.getByTestId('ids')).toHaveTextContent('[]')
})

test('page selection skips invalid recipients, deduplicates and retains choices outside the page', async () => {
  setup([99, 1])
  await screen.findByRole('checkbox', { name: /user1 \(#1\)/ })
  await userEvent.click(screen.getByRole('button', { name: '本页全选' }))
  expect(screen.getByTestId('ids')).toHaveTextContent('[99,1,2]')
  await userEvent.click(screen.getByRole('button', { name: '取消本页选择' }))
  expect(screen.getByTestId('ids')).toHaveTextContent('[99]')
})

test('searching keeps selections from previous results and removing a chip updates the selection', async () => {
  mocks.search.mockImplementation(({ keyword }) =>
    Promise.resolve(result(keyword ? [user(2)] : [user(1)]))
  )
  setup()
  await userEvent.click(
    await screen.findByRole('checkbox', { name: /user1 \(#1\)/ })
  )
  await userEvent.type(
    screen.getByRole('textbox', { name: '搜索邮件收件人' }),
    'user2'
  )
  await userEvent.click(
    await screen.findByRole('checkbox', { name: /user2 \(#2\)/ })
  )
  expect(screen.getByTestId('ids')).toHaveTextContent('[1,2]')
  await userEvent.click(screen.getByRole('button', { name: '移除收件人 1' }))
  expect(screen.getByTestId('ids')).toHaveTextContent('[2]')
})

test('pagination preserves already selected recipients', async () => {
  mocks.search.mockImplementation(({ p }) =>
    Promise.resolve(result([user(p === 2 ? 51 : 1)], 51))
  )
  setup()
  await userEvent.click(
    await screen.findByRole('checkbox', { name: /user1 \(#1\)/ })
  )
  await userEvent.click(screen.getByRole('button', { name: '下一页' }))
  await userEvent.click(
    await screen.findByRole('checkbox', { name: /user51 \(#51\)/ })
  )
  expect(screen.getByTestId('ids')).toHaveTextContent('[1,51]')
})

test('selecting all search results fetches later pages and adds only eligible unique users', async () => {
  mocks.search.mockImplementation(({ p, page_size }) =>
    Promise.resolve(
      result(
        page_size === 100
          ? p === 2
            ? [user(101), user(1)]
            : Array.from({ length: 100 }, (_, i) => user(i + 1))
          : [user(1)],
        101,
        page_size
      )
    )
  )
  setup([200])
  await userEvent.click(
    await screen.findByRole('button', { name: '全选搜索结果（101 人）' })
  )
  await waitFor(() =>
    expect(
      JSON.parse(screen.getByTestId('ids').textContent ?? '[]')
    ).toHaveLength(102)
  )
  expect(mocks.search).toHaveBeenCalledWith(
    expect.objectContaining({ p: 2, page_size: 100 })
  )
  const ids = JSON.parse(screen.getByTestId('ids').textContent ?? '[]')
  expect(ids).toContain(200)
  expect(ids).toContain(101)
  expect(new Set(ids).size).toBe(ids.length)
})

test('a failed bulk request preserves all existing selections', async () => {
  mocks.search.mockImplementation(({ p, page_size }) =>
    p === 2 && page_size === 100
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(result([user(1)], 101, page_size))
  )
  setup([200])
  await userEvent.click(
    await screen.findByRole('button', { name: '全选搜索结果（101 人）' })
  )
  await waitFor(() => expect(mocks.error).toHaveBeenCalled())
  expect(screen.getByTestId('ids')).toHaveTextContent('[200]')
})

test('newest users are requested first and refreshing adds a newly registered user without losing selections', async () => {
  let finishRefresh: (response: ReturnType<typeof result>) => void = () => {}
  mocks.search
    .mockResolvedValueOnce(result([user(52), user(1)], 52))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve
        })
    )
  setup([1])
  await screen.findByRole('checkbox', { name: /user52 \(#52\)/ })
  expect(mocks.search).toHaveBeenCalledWith(
    expect.objectContaining({ p: 1, sort_by: 'id', sort_order: 'desc' })
  )
  await userEvent.click(screen.getByRole('button', { name: '刷新用户' }))
  expect(
    screen.getByRole('checkbox', { name: /user1 \(#1\)/ })
  ).toHaveAttribute('aria-checked', 'true')
  expect(screen.queryByText('正在加载用户…')).not.toBeInTheDocument()
  await act(async () => {
    finishRefresh(result([user(53), user(52), user(1)], 53))
  })
  await screen.findByRole('checkbox', { name: /user53 \(#53\)/ })
  expect(screen.getByTestId('ids')).toHaveTextContent('[1]')
  expect(
    screen.getByRole('checkbox', { name: /user1 \(#1\)/ })
  ).toHaveAttribute('aria-checked', 'true')
})

test('refreshing from a later page returns to the newest page and retains all checked IDs', async () => {
  let newest = 52
  mocks.search.mockImplementation(({ p }) =>
    Promise.resolve(result([user(p === 2 ? 1 : newest)], newest, 20))
  )
  setup()
  await userEvent.click(
    await screen.findByRole('checkbox', { name: /user52 \(#52\)/ })
  )
  expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '下一页' }))
  await userEvent.click(
    await screen.findByRole('checkbox', { name: /user1 \(#1\)/ })
  )
  newest = 53
  await userEvent.click(screen.getByRole('button', { name: '刷新用户' }))
  await screen.findByRole('checkbox', { name: /user53 \(#53\)/ })
  expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument()
  expect(screen.getByTestId('ids')).toHaveTextContent('[52,1]')
})

test('reopening the picker refreshes cached results even within the application cache window', async () => {
  mocks.search
    .mockResolvedValueOnce(result([user(1)]))
    .mockResolvedValueOnce(result([user(53), user(1)]))
  const { client, unmount } = setup([1])
  await screen.findByRole('checkbox', { name: /user1 \(#1\)/ })
  unmount()
  render(
    <QueryClientProvider client={client}>
      <Fixture initial={[1]} />
    </QueryClientProvider>
  )
  await screen.findByRole('checkbox', { name: /user53 \(#53\)/ })
  expect(mocks.search).toHaveBeenCalledTimes(2)
  expect(screen.getByTestId('ids')).toHaveTextContent('[1]')
})

test('an open picker automatically discovers new users after thirty seconds', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  let client: QueryClient | undefined
  try {
    mocks.search
      .mockResolvedValueOnce(result([user(1)]))
      .mockResolvedValueOnce(result([user(53), user(1)]))
    client = setup([1]).client
    await screen.findByRole('checkbox', { name: /user1 \(#1\)/ })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    await screen.findByRole('checkbox', { name: /user53 \(#53\)/ })
    expect(screen.getByTestId('ids')).toHaveTextContent('[1]')
  } finally {
    client?.clear()
    vi.useRealTimers()
  }
})

test('failed background updates retain the visible users and selection until a successful retry', async () => {
  mocks.search
    .mockResolvedValueOnce(result([user(1)]))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(result([user(53), user(1)]))
  setup([1])
  await screen.findByRole('checkbox', { name: /user1 \(#1\)/ })
  await userEvent.click(screen.getByRole('button', { name: '刷新用户' }))
  await screen.findByRole('alert')
  expect(
    screen.getByRole('checkbox', { name: /user1 \(#1\)/ })
  ).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(screen.getByRole('button', { name: '刷新用户' }))
  await screen.findByRole('checkbox', { name: /user53 \(#53\)/ })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByTestId('ids')).toHaveTextContent('[1]')
})
