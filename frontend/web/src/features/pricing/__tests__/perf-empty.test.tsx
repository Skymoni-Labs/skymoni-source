import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ModelPerfBadge } from '../components/model-perf-badge'

describe('model performance availability', () => {
  it('hides missing metrics while keeping details accessible', () => {
    render(<ModelPerfBadge perf={undefined}>Details</ModelPerfBadge>)
    expect(
      screen.queryByLabelText('Performance metrics for the last 24 hours')
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByText('—s')).not.toBeInTheDocument()
    expect(screen.getByText('Details')).toBeVisible()
  })
  it('keeps a measured zero success rate visible', () => {
    render(
      <ModelPerfBadge
        perf={{ success_rate: 0, avg_latency_ms: 1200, avg_tps: 0 }}
      />
    )
    expect(screen.getByText('0.00%')).toBeVisible()
    expect(screen.getByText('1.20s')).toBeVisible()
    expect(screen.queryByText('Throughput short')).not.toBeInTheDocument()
    expect(
      screen.queryByText('No performance samples in the last 24 hours')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('—t/s')).not.toBeInTheDocument()
  })
  it.each(['loading', 'error'] as const)(
    'shows no metrics placeholder while the request is %s',
    (state) => {
      const { container } = render(
        <ModelPerfBadge perf={undefined} state={state} />
      )
      expect(container).toBeEmptyDOMElement()
    }
  )
  it('hides invalid values instead of displaying unknown units', () => {
    const { container } = render(
      <ModelPerfBadge
        perf={{
          success_rate: Number.NaN,
          avg_latency_ms: -1,
          avg_tps: Infinity,
        }}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
  it('shows all measured metrics when data is available', () => {
    render(
      <ModelPerfBadge
        perf={{ success_rate: 91.2, avg_latency_ms: 48770, avg_tps: 25.3 }}
      />
    )
    expect(screen.getByText('91.20%')).toBeVisible()
    expect(screen.getByText('48.77s')).toBeVisible()
    expect(screen.getByText('25.3t/s')).toBeVisible()
  })
})
