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

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { ProductDialog } from '../components/checkout'
import { ProductDescription } from '../components/product-description'
import { ProductEditor } from '../components/product-editor'
import { StockDialog } from '../components/stock-dialog'
import { Store } from '../components/store'
import { createShopData } from '../lib/data'

describe('configurable digital products', () => {
  test('sold-out products still expose details while purchase stays disabled', async () => {
    const user = userEvent.setup()
    const data = createShopData()
    data.inventory = []
    data.products = [data.products[0]]
    const select = vi.fn()
    render(<Store live data={data} onSelect={select} onOrders={() => {}} />)
    expect(
      screen.getByRole('button', { name: 'Temporarily sold out' })
    ).toBeDisabled()
    const details = screen.getByRole('button', { name: 'Details' })
    expect(details).toBeEnabled()
    await user.click(details)
    expect(select).toHaveBeenCalledWith(data.products[0])
  })

  test('Markdown details render headings and attributes without running embedded scripts', () => {
    const data = createShopData()
    render(
      <ProductDialog
        live
        product={{
          ...data.products[0],
          contentFormat: 'markdown',
          content:
            '## Creative toolkit\n\n**Includes** a guide.\n<script>window.shopDetailUnsafe = true</script>',
          attributes: [{ label: 'Support', value: 'Administrator assistance' }],
        }}
        data={data}
        onClose={() => {}}
        onBuy={() => {}}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Creative toolkit' })
    ).toBeInTheDocument()
    expect(screen.getByText('Includes').tagName).toBe('STRONG')
    expect(screen.getByText('Administrator assistance')).toBeInTheDocument()
    expect(screen.getByRole('dialog').querySelector('script')).toBeNull()
    expect(screen.queryByText('DEMO-only-1')).not.toBeInTheDocument()
  })

  test('an empty description falls back to the public product summary', () => {
    const data = createShopData()
    render(
      <ProductDialog
        product={{ ...data.products[0], content: '', contentFormat: 'text' }}
        data={data}
        onClose={() => {}}
        onBuy={() => {}}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Product details' })
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(data.products[0].benefit.summary).length
    ).toBeGreaterThan(0)
  })

  test('admin can save a custom category, HTML detail and an additional priced package', async () => {
    const user = userEvent.setup()
    const save = vi.fn()
    render(
      <ProductEditor
        product={createShopData().products[0]}
        onClose={() => {}}
        onSave={save}
      />
    )
    await user.clear(screen.getByLabelText('Custom category name'))
    await user.type(
      screen.getByLabelText('Custom category name'),
      'Creative services'
    )
    await user.click(screen.getByRole('tab', { name: 'Display content' }))
    await user.selectOptions(screen.getByLabelText('Content format'), 'html')
    await user.clear(screen.getByLabelText('Public product details'))
    await user.type(
      screen.getByLabelText('Public product details'),
      '<h2>Custom offer</h2><p>Includes onboarding</p>'
    )
    expect(
      screen.getByRole('heading', { name: 'Custom offer' })
    ).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Packages and prices' }))
    await user.click(screen.getByRole('button', { name: 'Add package' }))
    const names = screen.getAllByLabelText('Package name')
    const lastName = names.at(-1)
    if (!lastName) throw new Error('Missing added package name')
    await user.type(lastName, 'Annual')
    const prices = screen.getAllByLabelText('Price in site credit')
    const lastPrice = prices.at(-1)
    if (!lastPrice) throw new Error('Missing added package price')
    await user.type(lastPrice, '299.50')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryLabel: 'Creative services',
        contentFormat: 'html',
        content: '<h2>Custom offer</h2><p>Includes onboarding</p>',
        packages: expect.arrayContaining([
          expect.objectContaining({ name: 'Annual', priceCents: 29950 }),
        ]),
      })
    )
  })

  test('plain text product content stays literal and does not expose inventory fields', () => {
    const data = createShopData()
    const product = {
      ...data.products[0],
      contentFormat: 'text' as const,
      content: '<h2>Literal instructions</h2>',
    }
    render(
      <ProductDialog
        product={product}
        data={data}
        onClose={() => {}}
        onBuy={() => {}}
      />
    )
    expect(
      screen.getByText('<h2>Literal instructions</h2>')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Literal instructions' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('DEMO-only-1')).not.toBeInTheDocument()
  })

  test('stock generation submits the selected package and number of items', async () => {
    const user = userEvent.setup()
    const add = vi.fn()
    const data = createShopData()
    render(
      <StockDialog
        product={data.products[0]}
        data={data}
        onClose={() => {}}
        onAdd={add}
      />
    )
    await user.selectOptions(
      screen.getByLabelText('Choose package'),
      'extended'
    )
    await user.clear(screen.getByLabelText('Sample inventory count'))
    expect(
      screen.getByRole('button', { name: 'Generate sample stock' })
    ).toBeDisabled()
    await user.type(screen.getByLabelText('Sample inventory count'), '3')
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Generate sample stock',
      })
    )
    expect(add).toHaveBeenCalledWith('extended', 3)
  })
})

test('product descriptions keep compact sections and allow wide tables to scroll inside the content', () => {
  render(
    <ProductDescription
      mode='html'
      content='<section><p>Overview</p></section><section><h3>How to redeem</h3><ol><li>Open My warehouse</li><li>Use the code</li></ol><table><tbody><tr><td>Package details</td></tr></tbody></table></section>'
    />
  )
  const content = screen.getByText('Overview').parentElement?.parentElement
  expect(content).toHaveClass(
    '[&_section+section]:mt-4',
    '[&_table]:overflow-x-auto',
    'break-words'
  )
  expect(
    screen.getByRole('heading', { name: 'How to redeem' })
  ).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
})

test('generated Drip editor submits independent quota, duration and revision', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  const product = {
    ...createShopData().products[0],
    generatedSales: true,
    quotaGiB: 100,
    revision: 7,
    packages: [],
  }
  render(
    <ProductEditor live product={product} onClose={() => {}} onSave={save} />
  )
  await user.click(screen.getByRole('tab', { name: 'Packages and prices' }))
  await user.clear(screen.getByLabelText('套餐流量（GiB）'))
  await user.type(screen.getByLabelText('套餐流量（GiB）'), '47')
  await user.clear(screen.getByLabelText('Validity in days'))
  await user.type(screen.getByLabelText('Validity in days'), '21')
  await user.clear(screen.getByLabelText('Price in site credit'))
  await user.type(screen.getByLabelText('Price in site credit'), '123.45')
  expect(screen.getByLabelText('Delivery mode')).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Save product' }))
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      quotaGiB: 47,
      revision: 7,
      priceCents: 12345,
      delivery: 'instant',
      benefit: expect.objectContaining({ validityDays: 21 }),
    })
  )
})
