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
import { previewChinese } from '@/features/benefits-preview/copy'
import { ShopPreview } from '@/features/shop-preview'
import { shopChinese } from '@/features/shop-preview/copy'
import i18n from '@/i18n/config'

import '@/styles/index.css'

// Standalone localhost preview: no production router or management API imports.
const copy = { ...previewChinese, ...shopChinese }
i18n.addResourceBundle('zhCN', 'translation', copy, true, true)
i18n.addResourceBundle(
  'en',
  'translation',
  Object.fromEntries(Object.keys(copy).map((key) => [key, key])),
  true,
  false
)
void i18n.changeLanguage('zhCN')
document.title = 'skymoni · 商城预览 | New API'
const root = document.querySelector('#root')
if (!root) throw new Error('Root element not found')
createRoot(root).render(
  <StrictMode>
    <ThemeProvider defaultTheme='light' storageKey='skymoni-shop-preview-theme'>
      <ShopPreview />
      <Toaster />
    </ThemeProvider>
  </StrictMode>
)
