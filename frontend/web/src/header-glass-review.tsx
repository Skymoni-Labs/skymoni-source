// Local review only: render the existing home and header, without account bootstrap.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { AxiosHeaders } from 'axios'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { DirectionProvider } from '@/context/direction-provider'
import { FontProvider } from '@/context/font-provider'
import { ThemeProvider } from '@/context/theme-provider'
import { HomeDiscovery } from '@/features/home-discovery'
import { SiteVoidBackdrop } from '@/features/home-discovery/void-backdrop'
import catalog from '@/features/software-center/preview-catalog.json'
import i18n from '@/i18n/config'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useSystemConfigStore } from '@/stores/system-config-store'

import '@/styles/index.css'
import '@/styles/site-void.css'
import '@/styles/site-glass.css'

api.defaults.adapter = async (config) => ({
  config,
  headers: new AxiosHeaders(),
  status: config.method === 'get' ? 200 : 405,
  statusText: 'Review fixture',
  data: {
    success: config.method === 'get',
    data: config.url === '/api/software/public' ? structuredClone(catalog) : {},
  },
})
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false } },
})
client.setQueryData(STATUS_QUERY_KEY, {
  HeaderNavModules: JSON.stringify({
    pricing: { enabled: true, requireAuth: false },
    rankings: { enabled: true, requireAuth: false },
  }),
})
client.setQueryData(['software-public'], catalog)
client.setQueryData(['notice'], { success: true, data: '' })
client.setQueryData(['home-creator-public'], {
  config: { galleryEnabled: false, marqueeEnabled: false },
  works: [],
  authors: [],
})
useSystemConfigStore
  .getState()
  .setConfig({ systemName: 'skymoni', logo: '/skymoni.png' })
useSystemConfigStore.getState().setLoading(false)
const router = createRouter({
  routeTree: createRootRoute({ component: HomeDiscovery }),
})
void i18n.changeLanguage('zhCN')
document.documentElement.lang = 'zh-CN'
document.title = 'skymoni · 导航玻璃本地预览'
document.addEventListener('click', (event) => {
  const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]')
  if (
    !anchor ||
    event.defaultPrevented ||
    anchor.target === '_blank' ||
    anchor.hasAttribute('download')
  ) {
    return
  }
  const href = anchor.getAttribute('href') || ''
  if (href.startsWith('/') && !href.startsWith('//')) {
    event.preventDefault()
    window.open(`https://skymoni.com${href}`, '_blank', 'noopener,noreferrer')
  }
})
const root = document.querySelector('#root')
if (!root) throw new Error('Missing review root')
createRoot(root).render(
  <StrictMode>
    <ThemeProvider
      defaultTheme='light'
      storageKey='skymoni-header-glass-review-theme'
    >
      <FontProvider>
        <DirectionProvider>
          <SiteVoidBackdrop />
          <QueryClientProvider client={client}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </DirectionProvider>
      </FontProvider>
    </ThemeProvider>
  </StrictMode>
)
