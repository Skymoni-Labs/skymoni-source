import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Button } from '@/components/ui/button'
import { ThemeProvider } from '@/context/theme-provider'
import { DripSubscriptionPanel } from '@/features/benefits/components/drip-subscription-panel'
import type { WarehouseItem } from '@/features/benefits/types'
import { SiteVoidBackdrop } from '@/features/home-discovery/void-backdrop'
import i18n from '@/i18n/config'

import '@/styles/index.css'
import '@/styles/site-void.css'
import '@/styles/site-glass.css'

// Local visual review uses fixture data and is not imported by the app/router.
void i18n.changeLanguage('zhCN')
const item: WarehouseItem = {
  id: 'preview',
  benefit: {
    id: 'drip',
    name: 'Drip 浏览器套餐',
    summary: 'skymoni 线路套餐',
    category: 'resource',
    tone: 'sky',
    format: 'markdown',
    instructions: '',
    fields: [],
    stockMode: 'individual',
    validityDays: 100,
    enabled: true,
  },
  fields: [
    {
      id: 'code',
      label: 'Drip 兑换码',
      kind: 'secret',
      value: 'DRIP-DEMO-PREVIEW',
    },
  ],
  received: '2026-10-10',
  expires: '2027-01-18',
  status: 'active',
  sourceCode: 'preview',
}
export function Preview() {
  const [open, setOpen] = useState(true)
  return (
    <ThemeProvider defaultTheme='dark' storageKey='skymoni-drip-style-preview'>
      <SiteVoidBackdrop />
      <main className='mx-auto max-w-5xl p-10'>
        <div className='text-muted-foreground mb-12 flex items-center justify-between border-b pb-5 text-sm'>
          <strong className='text-foreground text-xl'>skymoni</strong>
          <span>我的仓库</span>
        </div>
        <h1 className='mb-5 text-3xl font-semibold'>我的仓库</h1>
        <div className='grid gap-4 sm:grid-cols-3'>
          {['全部资源', '可用资源', '过期资源'].map((label, index) => (
            <div
              key={label}
              className='site-glass-surface rounded-2xl border p-5'
            >
              <div className='text-muted-foreground text-sm'>{label}</div>
              <div className='mt-2 text-3xl'>{index === 2 ? 0 : 1}</div>
            </div>
          ))}
        </div>
        <div className='site-glass-surface mt-6 rounded-2xl border p-6'>
          <h2 className='mb-4 text-lg'>Drip 浏览器套餐</h2>
          <Button onClick={() => setOpen(true)}>查看订阅</Button>
        </div>
      </main>
      {open && (
        <DripSubscriptionPanel
          item={item}
          clashUrl='https://skymoni.com/api/drip/sub/clash/skymoni-demo'
          universalUrl='https://skymoni.com/api/drip/sub/sub/skymoni-demo'
          onClose={() => setOpen(false)}
        />
      )}
    </ThemeProvider>
  )
}
const root = document.querySelector('#root')
if (!root) throw new Error('Root element not found')
createRoot(root).render(<Preview />)
