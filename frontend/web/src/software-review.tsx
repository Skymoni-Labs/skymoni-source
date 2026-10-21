// Local review only. The production router never imports this entry or catalog.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
} from '@tanstack/react-router'
import { AxiosHeaders } from 'axios'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { PublicHeader } from '@/components/layout/components/public-header'
import { ThemeProvider } from '@/context/theme-provider'
import { SiteVoidBackdrop } from '@/features/home-discovery/void-backdrop'
import { SoftwareCenter } from '@/features/software-center'
import { SoftwareDetailsPage } from '@/features/software-center/details-page'
import catalog from '@/features/software-center/preview-catalog.json'
import i18n from '@/i18n/config'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useSystemConfigStore } from '@/stores/system-config-store'

import '@/styles/index.css'
import '@/styles/home-preview.css'
import '@/styles/site-void.css'
import '@/styles/site-glass.css'

api.defaults.adapter = async (config) => ({
  config,
  headers: new AxiosHeaders(),
  status: config.method === 'get' ? 200 : 405,
  statusText: config.method === 'get' ? 'OK' : 'Method Not Allowed',
  data: {
    success: config.method === 'get',
    data: config.url === '/api/software/public' ? structuredClone(catalog) : {},
  },
})
const queryClient = new QueryClient({
  defaultOptions: { queries: { enabled: false } },
})
queryClient.setQueryData(['software', 'public'], catalog)
queryClient.setQueryData(STATUS_QUERY_KEY, {})
queryClient.setQueryData(['notice'], { success: true, data: '' })
useSystemConfigStore
  .getState()
  .setConfig({ systemName: 'skymoni', logo: '/skymoni.png' })
useSystemConfigStore.getState().setLoading(false)

export function Layout() {
  return (
    <>
      <PublicHeader />
      <div className='pt-20'>
        <Outlet />
      </div>
    </>
  )
}
const rootRoute = createRootRoute({
  component: Layout,
  notFoundComponent: () => (
    <div className='p-20'>
      <a href='/software'>返回本地软件中心</a>
    </div>
  ),
})
const home = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ href: '/software' })
  },
})
const software = createRoute({
  getParentRoute: () => rootRoute,
  path: '/software',
  component: SoftwareCenter,
})
const details = createRoute({
  getParentRoute: () => rootRoute,
  path: '/software/$softwareId',
  component: Detail,
})
export function Detail() {
  return <SoftwareDetailsPage softwareId={details.useParams().softwareId} />
}
const router = createRouter({
  routeTree: rootRoute.addChildren([home, software, details]),
})
void i18n.changeLanguage('zhCN')
document.title = 'skymoni · 软件中心本地预览'
document.documentElement.lang = 'zh-CN'
const root = document.querySelector('#root')
if (!root) throw new Error('Root element not found')
createRoot(root).render(
  <StrictMode>
    <ThemeProvider
      defaultTheme='dark'
      storageKey='skymoni-software-review-theme'
    >
      <SiteVoidBackdrop />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)
