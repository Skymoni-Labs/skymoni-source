import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { PublicSale } from './api'
import { HomeSaleSpotlightView } from './home-spotlight'

afterEach(cleanup)
const sale: PublicSale = {
  id: 'a'.repeat(32),
  title: '七天模型降价',
  status: 'scheduled',
  start_at: 200,
  end_at: 800,
  countdown_mode: 'start',
  models: ['model'],
  discount_percent: 0,
  server_time: 100,
}

it('keeps drafts and expired offers off the public homepage', () => {
  const { container } = render(
    <HomeSaleSpotlightView
      serverTime={100}
      items={[
        { ...sale, status: 'draft' },
        { ...sale, status: 'active', end_at: 99 },
      ]}
    />
  )
  expect(container).toBeEmptyDOMElement()
})
it('links a scheduled offer to its detail and uses its start countdown', () => {
  render(<HomeSaleSpotlightView serverTime={100} items={[sale]} />)
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    `/model-offers/${sale.id}`
  )
  expect(screen.getByText('距开始')).toBeVisible()
  expect(screen.getByRole('timer')).toBeVisible()
})

it('labels an independently published announcement without claiming live discounts', () => {
  render(
    <HomeSaleSpotlightView
      serverTime={100}
      items={[{ ...sale, status: 'announced', announcement_only: true }]}
    />
  )
  expect(screen.getByText(/降价预告，实际价格待启用/)).toBeVisible()
})
