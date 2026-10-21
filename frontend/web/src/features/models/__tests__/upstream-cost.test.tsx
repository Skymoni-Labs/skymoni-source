import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { UpstreamCostCell } from '../components/upstream-cost-cell'

describe('upstream cost reference', () => {
  it('renders unknown when no upstream quote exists', () => {
    render(<UpstreamCostCell kind='price' />)
    expect(screen.getByText('Unknown')).toBeVisible()
  })
  it('keeps a free output price distinct from an unknown input price', () => {
    render(
      <UpstreamCostCell
        kind='price'
        costs={[{ provider: 'TypeSafe', output_usd_per_million: 0 }]}
      />
    )
    expect(
      screen.getByText('Original input price: Unknown USD / 1M tokens')
    ).toBeVisible()
    expect(
      screen.getByText('Original output price: 0 USD / 1M tokens')
    ).toBeVisible()
  })
  it('shows original request price without applying the upstream multiplier', () => {
    render(
      <UpstreamCostCell
        kind='price'
        costs={[
          {
            provider: '2000.run',
            request_usd: 0.3,
            group_ratio: 1.2,
            observed_at: '2026-09-21',
          },
        ]}
      />
    )
    expect(screen.getByText('Original price: $0.3 / Request')).toBeVisible()
    expect(screen.getByText('Observed at: 2026-09-21')).toBeVisible()
  })
  it('distinguishes group multiplier from missing token model ratios', () => {
    render(
      <UpstreamCostCell
        kind='ratio'
        costs={[{ provider: '2000.run', group_ratio: 1.2 }]}
      />
    )
    expect(screen.getByText('Upstream group multiplier: 1.2')).toBeVisible()
    expect(screen.getByText('Original model multiplier: Not published by upstream')).toBeVisible()
  })
  it('shows a load failure rather than a fabricated zero price', () => {
    render(<UpstreamCostCell kind='price' state='error' />)
    expect(
      screen.getByText('Unknown — cost data could not be loaded')
    ).toBeVisible()
  })
})
