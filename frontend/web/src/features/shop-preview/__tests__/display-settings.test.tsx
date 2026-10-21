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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { test, expect, vi } from 'vitest'

import { ShopAdmin } from '../components/admin'
import { ProductEditor } from '../components/product-editor'
import { Store } from '../components/store'
import { createShopData } from '../lib/data'

test('paginated inventory uses server totals for product and overall stock', () => {
  const data = createShopData()
  data.products = [
    { ...data.products[0], packages: [], stockByPackage: { default: 100 } },
  ]
  data.inventory = []
  render(
    <ShopAdmin
      live
      data={data}
      onEdit={() => {}}
      onAdd={() => {}}
      onStock={() => {}}
      onToggle={() => {}}
      onDeliver={() => {}}
      onRefund={() => {}}
    />
  )
  expect(screen.getByText('100')).toBeInTheDocument()
  expect(screen.getAllByText('100 available', { exact: false })).toHaveLength(2)
})

test('configured size and order apply with more than three products', () => {
  const data = createShopData()
  data.products[0].sortOrder = 20
  data.products[1].sortOrder = 1
  data.products[1].cardSize = 'large'
  data.products[0].cardSize = 'normal'
  data.products.push({
    ...data.products[2],
    id: 'fourth',
    benefit: {
      ...data.products[2].benefit,
      id: 'fourth',
      name: 'Fourth product',
    },
    sortOrder: 30,
  })
  render(<Store live data={data} onSelect={() => {}} onOrders={() => {}} />)
  const articles = screen.getAllByRole('article')
  expect(articles[0]).toHaveTextContent(data.products[2].benefit.name)
  const large = articles.find((x) =>
    x.textContent?.includes(data.products[1].benefit.name)
  )
  expect(large).toHaveClass('md:col-span-2', 'lg:row-span-2')
  const normal = articles.find((x) =>
    x.textContent?.includes(data.products[0].benefit.name)
  )
  expect(normal).not.toHaveClass('md:col-span-2')
  expect(
    screen.queryByText(
      'Prices, benefits, validity and stock are samples for this design preview.'
    )
  ).not.toBeInTheDocument()
})
test('administrator saves chosen card size and display order', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  render(
    <ProductEditor
      live
      product={createShopData().products[0]}
      onClose={() => {}}
      onSave={save}
    />
  )
  await user.selectOptions(screen.getByLabelText('Card size'), 'normal')
  await user.clear(screen.getByLabelText('Display order'))
  await user.type(screen.getByLabelText('Display order'), '15')
  await user.click(screen.getByRole('button', { name: 'Save product' }))
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ cardSize: 'normal', sortOrder: 15 })
  )
})
