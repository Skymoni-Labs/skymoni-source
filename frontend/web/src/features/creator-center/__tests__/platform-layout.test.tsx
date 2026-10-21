import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'
import { useCreatorAccessStore } from '@/stores/creator-access-store'

import { CreatorPlatformLayout } from '../platform-layout'

const clients: QueryClient[] = []
function renderPlatform(path = '/creators') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  clients.push(client)
  client.setQueryData(['status'], {})
  client.setQueryData(['community-meta'], {
    categories: [],
    stats: { topics: 0, replies: 0, members: 0 },
  })
  const current = useAuthStore.getState().auth
  client.setQueryData(
    ['community-notifications', current.user?.id, current.session?.sid],
    []
  )
  const root = createRootRoute({
    component: () => (
      <CreatorPlatformLayout>
        <Outlet />
      </CreatorPlatformLayout>
    ),
  })
  const paths = [
    '/creators',
    '/creators/explore',
    '/creators/workspace',
    '/creators/profile',
    '/creators/manage',
    '/creators/join',
    '/creators/projects',
    '/creators/moderation',
    '/sign-in',
  ]
  const routes = paths.map((path) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => (
        <main>
          <h1>Page {path}</h1>
        </main>
      ),
    })
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

afterEach(() => {
  useAuthStore.getState().auth.reset()
  useCreatorAccessStore.getState().hydrate(null)
  for (const client of clients.splice(0)) client.clear()
})

test('community keeps every existing creator module available in the sidebar', async () => {
  renderPlatform()
  const nav = await screen.findByRole('navigation', { name: '社区导航' })
  for (const label of [
    '作品广场',
    '工作台总览',
    '发布 / 编辑作品',
    'GitHub 导入',
    '软件版本与附件',
    '首页展示卡片',
    '我的创作主页',
    '高级作品筛选',
  ]) {
    expect(within(nav).getByRole('link', { name: label })).toBeVisible()
  }
  expect(within(nav).getByRole('link', { name: 'API 中转站' })).toHaveAttribute(
    'href',
    '/'
  )
  expect(screen.getByRole('link', { name: 'skymoni 社区' })).toHaveAttribute(
    'href',
    '/creators'
  )
})

test('community login keeps the current creator URL as its return destination', async () => {
  renderPlatform('/creators/explore')
  const header = await screen.findByRole('banner')
  const href = within(header)
    .getByRole('button', { name: /^登录$/ })
    .getAttribute('href')
  expect(
    new URL(href ?? '', 'https://skymoni.com').searchParams.get('redirect')
  ).toBe('/creators/explore')
  const signup = within(header)
    .getByRole('button', { name: '免费注册' })
    .getAttribute('href')
  expect(new URL(signup ?? '', 'https://skymoni.com').pathname).toBe('/sign-up')
  expect(
    new URL(signup ?? '', 'https://skymoni.com').searchParams.get('redirect')
  ).toBe('/creators/explore')
})

test('workspace navigation retains one independent community header', async () => {
  useAuthStore.getState().auth.setUser({ id: 4, username: 'maker', role: 1 })
  const user = userEvent.setup()
  renderPlatform()
  const nav = await screen.findByRole('navigation', { name: '社区导航' })
  await user.click(within(nav).getByRole('link', { name: '工作台总览' }))
  await screen.findByRole('heading', { name: 'Page /creators/workspace' })
  expect(screen.getAllByRole('banner')).toHaveLength(1)
})

test('administrator can reach forum moderation and original creator management', async () => {
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'operator', role: 100 })
  renderPlatform()
  const nav = await screen.findByRole('navigation', { name: '社区导航' })
  expect(
    within(nav).getByRole('link', { name: '论坛与举报管理' })
  ).toHaveAttribute('href', '/creators/moderation')
  expect(
    within(nav).getByRole('link', { name: '作品审核与展示管理' })
  ).toHaveAttribute('href', '/creators/manage')
})

test.each(['/creators/projects', '/creators/workspace'])(
  'module navigation selects only the current module: %s',
  async (path) => {
    renderPlatform(path)
    const nav = await screen.findByRole('navigation', { name: '社区模块' })
    const active = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
    expect(active).toHaveLength(1)
    expect(
      within(nav).getByRole('link', { name: '论坛交流' })
    ).not.toHaveAttribute('aria-current')
  }
)
