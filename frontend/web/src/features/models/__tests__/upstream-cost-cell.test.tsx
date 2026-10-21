import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { UpstreamCostCell } from '../components/upstream-cost-cell'

it('keeps free output, current source and missing internal ratios distinct', () => {
  const costs = [
    {
      provider: 'TypeSafe',
      source: 'https://typesafe.ai',
      group_ratio: 1,
      input_usd_per_million: 0.042,
      output_usd_per_million: 0,
      note: 'Official published price',
    },
  ]
  const { rerender } = render(<UpstreamCostCell kind='price' costs={costs} />)
  expect(screen.getByText(/0\.042 USD/)).toBeTruthy()
  expect(screen.getByText(/0 USD/)).toBeTruthy()
  expect(screen.getByRole('link').getAttribute('href')).toBe(
    'https://typesafe.ai'
  )
  rerender(<UpstreamCostCell kind='ratio' costs={costs} />)
  expect(screen.getAllByText(/Not published by upstream/)).toHaveLength(2)
  expect(screen.getByText('Official published price')).toBeTruthy()
})
