import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { communityRequest } from '../api'
import { CommunityCategoryManagement } from '../category-management'

vi.mock('../api', () => ({ communityRequest: vi.fn() }))
const clients: QueryClient[] = []
const original = {
  revision: 'catalog-v1',
  categories: [
    {
      id: 'general',
      name: '社区交流',
      description: '普通交流',
      color: '#123abc',
      topics: 0,
    },
    {
      id: 'announcements',
      name: '社区公告',
      description: '官方消息',
      color: '#aabbcc',
      topics: 0,
      adminOnly: true,
    },
  ],
}
let catalog = structuredClone(original)
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <CommunityCategoryManagement />
    </QueryClientProvider>
  )
  return client
}
beforeEach(() => {
  catalog = structuredClone(original)
  vi.mocked(communityRequest).mockReset()
  vi.mocked(communityRequest).mockImplementation(async () => catalog)
  useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role: 100 })
})
afterEach(() => {
  useAuthStore.getState().auth.reset()
  for (const client of clients.splice(0)) client.clear()
})

test('ordinary members cannot load or modify category management', () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'member', role: 1 })
  show()
  expect(screen.queryByText('社区分类管理')).not.toBeInTheDocument()
  expect(communityRequest).not.toHaveBeenCalled()
})

test('adding a category saves the entered values and refreshes public metadata', async () => {
  const client = show()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const user = userEvent.setup()
  await screen.findByText('普通交流')
  await user.click(screen.getByRole('button', { name: '添加分类' }))
  await user.type(screen.getByLabelText('分类名称'), '开源项目')
  await user.type(screen.getByLabelText('分类说明'), '分享开源项目与实践')
  vi.mocked(communityRequest).mockImplementation(async () => ({
    revision: 'catalog-v2',
    categories: [
      ...catalog.categories,
      {
        id: 'new-category',
        name: '开源项目',
        color: '#4a9ed7',
        description: '分享开源项目与实践',
      },
    ],
  }))
  await user.click(screen.getByRole('button', { name: '保存分类' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/admin/categories',
      expect.objectContaining({
        method: 'post',
        data: {
          name: '开源项目',
          description: '分享开源项目与实践',
          color: '#4a9ed7',
          revision: 'catalog-v1',
        },
      })
    )
  )
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(screen.getByText('开源项目')).toBeVisible()
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['community-meta'] })
})

test('editing preserves the category identity and sends its original revision', async () => {
  show()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '编辑 社区交流' }))
  await user.clear(screen.getByLabelText('分类名称'))
  await user.type(screen.getByLabelText('分类名称'), '新的交流区')
  await user.click(screen.getByRole('button', { name: '保存分类' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/admin/categories/general',
      expect.objectContaining({
        method: 'put',
        data: expect.objectContaining({
          name: '新的交流区',
          revision: 'catalog-v1',
        }),
      })
    )
  )
})

test('reorder sends every category in the selected order', async () => {
  show()
  const user = userEvent.setup()
  const up = await screen.findByRole('button', { name: '上移 社区交流' })
  expect(up).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '上移 社区公告' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/admin/categories/order',
      expect.objectContaining({
        method: 'put',
        data: { ids: ['announcements', 'general'], revision: 'catalog-v1' },
      })
    )
  )
})

test('failed saves keep the draft available for correction', async () => {
  show()
  const user = userEvent.setup()
  await screen.findByText('普通交流')
  await user.click(screen.getByRole('button', { name: '添加分类' }))
  await user.type(screen.getByLabelText('分类名称'), '社区交流')
  vi.mocked(communityRequest).mockImplementation(async (_path, options) => {
    if (options?.method) throw new Error('Duplicate category')
    return catalog
  })
  await user.click(screen.getByRole('button', { name: '保存分类' }))
  const dialog = screen.getByRole('dialog')
  await within(dialog).findByRole('alert')
  expect(screen.getByLabelText('分类名称')).toHaveValue('社区交流')
})
