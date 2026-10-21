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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { describe, expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

import catalog from '../../../../public/recharge-packages.json'
import { RechargePackagesCard } from '../components/recharge-packages-card'
import { rechargeCatalogSchema } from '../lib/recharge-catalog'

function renderCatalog(enabled = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  })
  render(
    <QueryClientProvider client={client}>
      <RechargePackagesCard redemptionEnabled={enabled} />
    </QueryClientProvider>
  )
  return client
}

describe('recharge package purchase flow', () => {
  it('uses the production Chinese translation bundle for package names and review status', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: catalog })
    i18n.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
    await i18n.changeLanguage('zhCN')
    try {
      renderCatalog()
      expect(await screen.findByText('skymoni 充值套餐')).toBeInTheDocument()
      expect(await screen.findAllByText('可购买')).toHaveLength(7)
      expect(screen.getByText('11,000 美元额度')).toBeInTheDocument()
      expect(
        screen.getByText(/不能兑换美元现金或上游厂商额度/)
      ).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('shows all seven approved price and credit pairs with purchase links', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: catalog })
    renderCatalog()
    expect(await screen.findAllByText('Available to purchase')).toHaveLength(7)
    expect(
      screen.getByRole('region', {
        name: /Model price conversion guide|How model prices convert/,
      })
    ).toBeVisible()
    // 验证新渲染格式：基准额度 + X% 加赠（同一行）+ 到账额度
    expect(screen.getByText('490 USD credit')).toBeInTheDocument()
    expect(screen.getByText(/\+ 2% bonus credit/)).toBeInTheDocument()
    expect(screen.getByText(/\+ 7% bonus credit/)).toBeInTheDocument()
    expect(screen.getByText('500 USD credit')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Buy package/ })).toHaveLength(7)
    expect(catalog.plans.map((p) => [p.price_cny, p.credit_usd])).toEqual([
      [9.9, 99],
      [49, 500],
      [99, 1020],
      [199, 2100],
      [299, 3200],
      [599, 6480],
      [999, 11000],
    ])
  })

  it('only links available packages and keeps sold out packages disabled', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        plans: [
          { ...catalog.plans[0], status: 'available' },
          { ...catalog.plans[1], status: 'sold_out' },
        ],
      },
    })
    renderCatalog()
    const link = await screen.findByRole('link', {
      name: 'Buy package 01 on Catfk',
    })
    expect(link).toHaveAttribute('href', 'https://catfk.com/item/pcalzx')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('button', { name: 'Sold out' })).toBeDisabled()
  })

  it('prevents buying even available packages when redemption is disabled', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { plans: [{ ...catalog.plans[0], status: 'available' }] },
    })
    renderCatalog(false)
    expect(
      await screen.findByRole('button', { name: 'Purchases unavailable' })
    ).toBeDisabled()
    expect(
      screen.queryByRole('link', { name: /Buy package/ })
    ).not.toBeInTheDocument()
  })

  it('removes stale purchase links after a refresh failure and recovers on retry', async () => {
    const request = vi.spyOn(api, 'get').mockResolvedValue({
      data: { plans: [{ ...catalog.plans[0], status: 'available' }] },
    })
    const client = renderCatalog()
    await screen.findByRole('link', { name: 'Buy package 01 on Catfk' })
    request.mockRejectedValue(new Error('offline'))
    await client.invalidateQueries({ queryKey: ['recharge-packages'] })
    await screen.findByText('Recharge packages are temporarily unavailable')
    expect(
      screen.queryByRole('link', { name: /Buy package/ })
    ).not.toBeInTheDocument()
    request.mockResolvedValue({ data: { plans: [] } })
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('No recharge packages available')
  })

  it('rejects an unexpected payment destination and unknown sale status', () => {
    expect(
      rechargeCatalogSchema.safeParse({
        plans: [
          { ...catalog.plans[0], url: 'https://catfk.com.evil.test/item/abc' },
        ],
      }).success
    ).toBe(false)
    expect(
      rechargeCatalogSchema.safeParse({
        plans: [{ ...catalog.plans[0], status: 'unknown' }],
      }).success
    ).toBe(false)
  })

  it('moves keyboard focus to the existing redemption input', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: catalog })
    renderCatalog()
    const input = document.createElement('input')
    input.id = 'redemption-code'
    document.body.append(input)
    await userEvent.click(
      screen.getByRole('button', { name: 'I have a code — redeem now' })
    )
    await waitFor(() => expect(input).toHaveFocus())
    input.remove()
  })
})
