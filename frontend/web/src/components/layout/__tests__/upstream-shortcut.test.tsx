import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { afterEach, describe, expect, it } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import { useSidebarView } from '@/hooks/use-sidebar-view'
import chineseLocale from '@/i18n/locales/zh.json'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { NavGroup } from '../components/nav-group'

function AdminNavigation() {
  const sidebar = useSidebarView()
  return (
    <SidebarProvider>
      <p>Navigation ready</p>
      {sidebar.navGroups
        .filter((group) => group.id === 'admin')
        .map((group) => (
          <NavGroup key={group.id} {...group} />
        ))}
    </SidebarProvider>
  )
}

function renderNavigation(role: number) {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'operator', role })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(['status'], { SidebarModulesAdmin: '' })
  const rootRoute = createRootRoute({ component: AdminNavigation })
  const route = createRoute({ getParentRoute: () => rootRoute, path: '/keys' })
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/keys'] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

afterEach(() => useAuthStore.getState().auth.reset())

describe('upstream management shortcut', () => {
  it('Chinese interface translates the new administrator entry', async () => {
    const i18n = createInstance()
    await i18n.init({ lng: 'zhCN', resources: { zhCN: chineseLocale } })
    expect(i18n.t('Upstream subscription management')).toBe('上游订阅管理')
  })
  it('super administrator can open the configured upstream panel in a separate tab', async () => {
    renderNavigation(ROLE.SUPER_ADMIN)
    const link = await screen.findByRole('link', {
      name: 'Upstream subscription management',
    })
    expect(link).toHaveAttribute(
      'href',
      'https://210.126.232.60:6508/EEc6aRuYyHvmv3aaNe/panel/upstreams'
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('ordinary user does not see the administrator shortcut', async () => {
    renderNavigation(ROLE.USER)
    await screen.findByText('Navigation ready')
    expect(
      screen.queryByRole('link', { name: 'Upstream subscription management' })
    ).not.toBeInTheDocument()
  })

  it('existing administrator navigation remains in the same tab', async () => {
    renderNavigation(ROLE.SUPER_ADMIN)
    const link = await screen.findByRole('link', { name: 'Product management' })
    expect(link).toHaveAttribute('href', '/store/admin')
    expect(link).not.toHaveAttribute('target', '_blank')
  })
})
