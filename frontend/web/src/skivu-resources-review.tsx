// Local review only: no account bootstrap, authentication, or production writes.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ThemeProvider } from '@/context/theme-provider'
import { SkivuResources } from '@/features/skivu-resources'
import i18n from '@/i18n/config'

import '@/styles/index.css'

const queryClient = new QueryClient()
void i18n.changeLanguage('zhCN')
document.documentElement.lang = 'zh-CN'
// Review resources locally; existing destinations still open their real website.
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
  if (['/', '/docs', '/software', '/creators/skivu-beta'].includes(href)) {
    event.preventDefault()
    window.location.assign(`https://skymoni.com${href}`)
  }
})
const root = document.querySelector('#root')
if (!root) throw new Error('Missing review root')
createRoot(root).render(
  <StrictMode>
    <ThemeProvider
      defaultTheme='dark'
      storageKey='skivu-resources-review-theme'
    >
      <QueryClientProvider client={queryClient}>
        <SkivuResources />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)
