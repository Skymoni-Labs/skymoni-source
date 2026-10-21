/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
} from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/context/theme-provider'
import { HomePreview } from '@/features/home-preview'
import { homePreviewChinese } from '@/features/home-preview/copy'
import { shopChinese } from '@/features/shop-preview/copy'
import { PublicStorePreview } from '@/features/shop-public-preview'
import { publicStoreChinese } from '@/features/shop-public-preview/copy'
import i18n from '@/i18n/config'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useSystemConfigStore } from '@/stores/system-config-store'

import '@/styles/index.css'
import '@/styles/home-preview.css'
import '@/styles/home-services.css'

// The original header uses router and query context; keep its preview data local.
const queryClient = new QueryClient({
  defaultOptions: { queries: { enabled: false } },
})
queryClient.setQueryData(STATUS_QUERY_KEY, {})
queryClient.setQueryData(['notice'], { success: true, data: '' })
useSystemConfigStore.getState().setConfig({
  systemName: 'skymoni',
  logo: '/skymoni.png',
})
useSystemConfigStore.getState().setLoading(false)

const previewRootRoute = createRootRoute({ component: Outlet })
const previewHomeRoute = createRoute({
  getParentRoute: () => previewRootRoute,
  path: '/',
  component: HomePreview,
})
const previewDestinationRoute = createRoute({
  getParentRoute: () => previewRootRoute,
  path: '$',
  beforeLoad: ({ location }) => {
    throw redirect({ href: `https://skymoni.com${location.href}` })
  },
})
const previewStoreRoute = createRoute({
  getParentRoute: () => previewRootRoute,
  path: '/shop',
  component: PublicStorePreview,
})
const previewStoreAliasRoute = createRoute({
  getParentRoute: () => previewRootRoute,
  path: '/store',
  beforeLoad: () => {
    throw redirect({ href: '/shop' })
  },
})
const previewRouter = createRouter({
  routeTree: previewRootRoute.addChildren([
    previewHomeRoute,
    previewStoreRoute,
    previewStoreAliasRoute,
    previewDestinationRoute,
  ]),
})

i18n.addResourceBundle('zhCN', 'translation', homePreviewChinese, true, true)
i18n.addResourceBundle('zhCN', 'translation', shopChinese, true, true)
i18n.addResourceBundle('zhCN', 'translation', publicStoreChinese, true, true)
i18n.addResourceBundle(
  'en',
  'translation',
  Object.fromEntries(Object.keys(homePreviewChinese).map((key) => [key, key])),
  true,
  false
)
void i18n.changeLanguage('zhCN')
document.title = 'skymoni · 服务门户首页预览 | New API'
document.documentElement.lang = 'zh-CN'
const root = document.querySelector('#root')
if (!root) throw new Error('Root element not found')
createRoot(root).render(
  <StrictMode>
    <ThemeProvider defaultTheme='light' storageKey='skymoni-home-preview-theme'>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={previewRouter} />
      </QueryClientProvider>
      <Toaster />
    </ThemeProvider>
  </StrictMode>
)
