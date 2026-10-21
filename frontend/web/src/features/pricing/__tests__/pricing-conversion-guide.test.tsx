/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, expect, it } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import catalog from '../../../../public/recharge-packages.json'
import { PricingConversionGuide } from '../components/pricing-conversion-guide'
import {
  STANDARD_PACKAGE_CNY,
  STANDARD_PACKAGE_SITE_CREDITS,
} from '../lib/standard-quote'

afterEach(async () => {
  await i18next.changeLanguage('en')
})

it('keeps the displayed reference rate aligned with the ¥9.90 recharge package', () => {
  const basePackage = catalog.plans.find((plan) => plan.id === '01')
  expect(basePackage?.price_cny).toBe(STANDARD_PACKAGE_CNY)
  expect(basePackage?.credit_usd).toBe(STANDARD_PACKAGE_SITE_CREDITS)
})

it('shows the multiplier-table standard conversion and keeps wallet credit separate from model tokens', async () => {
  i18next.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
  await i18next.changeLanguage('zhCN')
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], {
    reference_usd_cny: 6.713233,
    reference_fx_date: '2026-09-25',
  })
  render(
    <QueryClientProvider client={client}>
      <PricingConversionGuide />
    </QueryClientProvider>
  )

  const guide = screen.getByRole('region', { name: '价格怎么换算' })
  expect(
    within(guide).getByText(/¥9\.90 充值获得 99 站内美元额度/)
  ).toBeVisible()
  expect(within(guide).getByText('1 站内美元额度')).toBeVisible()
  expect(within(guide).getByText('¥0.10')).toBeVisible()
  expect(within(guide).getByText('$0.0149 真实美元等值')).toBeVisible()
  expect(within(guide).getByText(/标价 × ¥0\.10/)).toBeVisible()
  expect(within(guide).getByText(/欧洲央行 2026-09-25/)).toBeVisible()
  expect(within(guide).getByText(/不等于模型 Token/)).toBeVisible()
  expect(
    within(guide).getByText(/其他套餐或支付方式的实际单价可能不同/)
  ).toBeVisible()
  client.clear()
})

it('shows saved custom titles and substitutes current reference values without rendering HTML', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    reference_usd_cny: 6.713233,
    reference_fx_date: '2026-09-25',
    pricing_guide_config: JSON.stringify({
      conversionTitle: 'Our conversion guide',
      conversionContent:
        '¥{{creditPrice}} per credit\n{{exchangeRate}} on {{fxDate}}\n<script>alert(1)</script>',
      suffixTitle: 'Our model routes',
      suffixContent: '-token means usage billing',
    }),
  })
  const { container } = render(
    <QueryClientProvider client={client}>
      <PricingConversionGuide />
    </QueryClientProvider>
  )
  expect(
    screen.getByRole('region', { name: 'Our conversion guide' })
  ).toBeVisible()
  expect(screen.getByText(/¥0.10 per credit/)).toHaveTextContent(
    '6.7132 on 2026-09-25'
  )
  expect(
    screen.getByRole('heading', { name: 'Our model routes' })
  ).toBeVisible()
  expect(screen.getByText('-token means usage billing')).toBeVisible()
  expect(container.querySelector('script')).toBeNull()
  client.clear()
})

it('can hide the conversion independently while keeping model suffix notes visible', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    pricing_guide_config: JSON.stringify({
      showConversion: false,
      suffixTitle: 'Routes only',
    }),
  })
  render(
    <QueryClientProvider client={client}>
      <PricingConversionGuide />
    </QueryClientProvider>
  )
  expect(
    screen.queryByRole('heading', { name: 'Model price conversion guide' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Routes only' })).toBeVisible()
  client.clear()
})

it('hides the complete guide when both sections are disabled', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    pricing_guide_config: JSON.stringify({
      showConversion: false,
      showSuffix: false,
    }),
  })
  render(
    <QueryClientProvider client={client}>
      <PricingConversionGuide />
    </QueryClientProvider>
  )
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  client.clear()
})

it('uses the existing default guide for malformed stored settings', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], { pricing_guide_config: '{not json' })
  render(
    <QueryClientProvider client={client}>
      <PricingConversionGuide />
    </QueryClientProvider>
  )
  expect(
    screen.getByRole('region', { name: 'Model price conversion guide' })
  ).toBeVisible()
  expect(screen.getByText('-token-pro')).toBeVisible()
  client.clear()
})
