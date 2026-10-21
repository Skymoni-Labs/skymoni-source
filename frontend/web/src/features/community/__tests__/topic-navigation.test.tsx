import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { communityRequest, loadCommunityMeta, loadTopics } from '../api'
import {
  CommunityNavigationManagement,
  TopicNavigationButton,
} from '../topic-navigation'
import type { Topic, TopicNavigationCatalog } from '../types'

vi.mock('../api', () => ({
  communityRequest: vi.fn(),
  loadCommunityMeta: vi.fn(),
  loadTopics: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: () => null,
  useRouterState: () => '/creators',
}))
const clients: QueryClient[] = []
const topic = {
  id: 'a'.repeat(32),
  title: '原始完整话题标题',
  category: 'development',
  hidden: false,
  deleted: false,
} as Topic
const other = {
  ...topic,
  id: 'b'.repeat(32),
  title: '另一个话题',
  category: 'help',
}
let catalog: TopicNavigationCatalog
function show(button = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      {button ? (
        <>
          <h1>{topic.title}</h1>
          <TopicNavigationButton topic={topic} />
        </>
      ) : (
        <CommunityNavigationManagement />
      )}
    </QueryClientProvider>
  )
  return client
}
beforeEach(() => {
  catalog = { revision: 'v1', items: [] }
  vi.mocked(communityRequest).mockReset()
  vi.mocked(communityRequest).mockImplementation(async () => catalog)
  vi.mocked(loadCommunityMeta).mockResolvedValue({
    categories: [
      { id: 'development', name: '开发调优', topics: 0 },
      { id: 'help', name: '求助问答', topics: 0 },
    ],
  } as never)
  vi.mocked(loadTopics).mockResolvedValue({
    topics: [topic, other],
    total: 2,
    page: 1,
    pageSize: 30,
  } as never)
  useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role: 100 })
})
afterEach(() => {
  useAuthStore.getState().auth.reset()
  for (const client of clients.splice(0)) client.clear()
})
test('ordinary members cannot load navigation configuration', () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'member', role: 1 })
  show()
  expect(screen.queryByText('顶部分类导航')).not.toBeInTheDocument()
  expect(communityRequest).not.toHaveBeenCalled()
})
test('topic shortcut sends independent label and never edits original topic', async () => {
  const client = show(true),
    invalidate = vi.spyOn(client, 'invalidateQueries'),
    user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: '将此分类加入导航' })
  )
  await user.clear(screen.getByLabelText('导航显示名'))
  await user.type(screen.getByLabelText('导航显示名'), '使用指南')
  await user.click(screen.getByRole('button', { name: '保存导航入口' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/admin/navigation',
      expect.objectContaining({
        method: 'post',
        data: { categoryId: topic.category, label: '使用指南', revision: 'v1' },
      })
    )
  )
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(screen.getByRole('heading', { name: topic.title })).toBeVisible()
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['community-meta'] })
  expect(
    vi
      .mocked(communityRequest)
      .mock.calls.every(([path]) => path.startsWith('/admin/navigation'))
  ).toBe(true)
})
test('empty category can be added without loading or choosing a topic', async () => {
  show()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '添加分类入口' }))
  await user.selectOptions(screen.getByLabelText('话题分类'), 'development')
  expect(screen.getByLabelText('导航显示名')).toHaveValue('开发调优')
  expect(screen.queryByLabelText('选择话题')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('搜索已发布话题')).not.toBeInTheDocument()
  expect(loadTopics).not.toHaveBeenCalled()
  await user.selectOptions(screen.getByLabelText('话题分类'), 'help')
  expect(screen.getByLabelText('导航显示名')).toHaveValue('求助问答')
  await user.clear(screen.getByLabelText('导航显示名'))
  await user.type(screen.getByLabelText('导航显示名'), '自定义名称')
  await user.selectOptions(screen.getByLabelText('话题分类'), 'development')
  expect(screen.getByLabelText('导航显示名')).toHaveValue('自定义名称')
  await user.click(screen.getByRole('button', { name: '保存导航入口' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/admin/navigation',
      expect.objectContaining({
        data: {
          categoryId: 'development',
          label: '自定义名称',
          revision: 'v1',
        },
      })
    )
  )
})

test('stale configuration preserves draft and explicit refresh uses new revision', async () => {
  show(true)
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: '将此分类加入导航' })
  )
  await user.clear(screen.getByLabelText('导航显示名'))
  await user.type(screen.getByLabelText('导航显示名'), '保留草稿')
  vi.mocked(communityRequest).mockImplementation(async (_path, options) => {
    if (options?.method) throw new Error('配置已变化')
    return { ...catalog, revision: 'v2' }
  })
  await user.click(screen.getByRole('button', { name: '保存导航入口' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('导航显示名')).toHaveValue('保留草稿')
  await user.click(screen.getByRole('button', { name: '刷新配置，保留填写' }))
  vi.mocked(communityRequest).mockImplementation(async () => catalog)
  await user.click(screen.getByRole('button', { name: '保存导航入口' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/admin/navigation',
      expect.objectContaining({
        data: { categoryId: topic.category, label: '保留草稿', revision: 'v2' },
        method: 'post',
      })
    )
  )
})
test('manager renames, orders and unlinks without deleting topics', async () => {
  catalog.items = [
    {
      id: '1'.repeat(32),
      categoryId: topic.category,
      label: '指南',
      title: topic.title,
      available: true,
    },
    {
      id: '2'.repeat(32),
      categoryId: other.category,
      label: '资源',
      title: other.title,
      available: true,
    },
  ]
  show()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '上移 资源' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/admin/navigation/order',
      expect.objectContaining({
        data: {
          ids: [catalog.items[1].id, catalog.items[0].id],
          revision: 'v1',
        },
      })
    )
  )
  await user.click(screen.getAllByRole('button', { name: '编辑显示名' })[0])
  await user.clear(screen.getByLabelText('导航显示名'))
  await user.type(screen.getByLabelText('导航显示名'), '新指南')
  await user.click(screen.getByRole('button', { name: '保存导航入口' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(communityRequest).toHaveBeenCalledWith(
    `/admin/navigation/${catalog.items[0].id}`,
    expect.objectContaining({
      method: 'put',
      data: expect.objectContaining({ label: '新指南' }),
    })
  )
  await user.click(screen.getAllByRole('button', { name: '移除入口' })[0])
  const confirm = await screen.findByRole('alertdialog')
  expect(within(confirm).getByText(/分类、话题和回复都会保留/)).toBeVisible()
  await user.click(within(confirm).getByRole('button', { name: '移除入口' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      `/admin/navigation/${catalog.items[0].id}`,
      expect.objectContaining({
        method: 'put',
        data: { remove: true, revision: 'v1' },
      })
    )
  )
  expect(
    vi
      .mocked(communityRequest)
      .mock.calls.every(([path]) => path.startsWith('/admin/navigation'))
  ).toBe(true)
})
