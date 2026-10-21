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
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/context/theme-provider'
import { BenefitsPreview } from '@/features/benefits-preview'
import { previewChinese } from '@/features/benefits-preview/copy'
import i18n from '@/i18n/config'

import '@/styles/index.css'

// Separate local-only entry point; not imported by the production app/router.
i18n.addResourceBundle('zhCN', 'translation', previewChinese, true, true)
i18n.addResourceBundle(
  'en',
  'translation',
  Object.fromEntries(Object.keys(previewChinese).map((key) => [key, key])),
  true,
  false
)
document.title = 'skymoni · 福利与仓库预览'
const root = document.querySelector('#root')
if (!root) throw new Error('Root element not found')
createRoot(root).render(
  <StrictMode>
    <ThemeProvider
      defaultTheme='light'
      storageKey='skymoni-benefits-preview-theme'
    >
      <BenefitsPreview />
      <Toaster />
    </ThemeProvider>
  </StrictMode>
)
