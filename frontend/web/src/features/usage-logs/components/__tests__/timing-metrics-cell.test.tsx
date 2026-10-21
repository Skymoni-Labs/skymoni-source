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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { TimingMetricsCell } from '../timing-metrics-cell'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
afterEach(cleanup)

describe('stream timing explanations', () => {
  test('a negative first-response sentinel says no first token was received', () => {
    render(
      <TimingMetricsCell
        useTimeSec={110}
        completionTokens={0}
        frtMs={-1000}
        isStream
      />
    )
    expect(screen.getByText('No first token received')).toBeInTheDocument()
    expect(screen.queryByText('N/A')).not.toBeInTheDocument()
  })

  test('missing historical timing says it was not recorded', () => {
    render(<TimingMetricsCell useTimeSec={2} completionTokens={10} isStream />)
    expect(screen.getByText('Not recorded')).toBeInTheDocument()
  })

  test('zero millisecond timing is valid rather than missing', () => {
    render(
      <TimingMetricsCell
        useTimeSec={2}
        completionTokens={10}
        frtMs={0}
        isStream
      />
    )
    expect(
      screen.queryByText('No first token received')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Not recorded')).not.toBeInTheDocument()
  })
})
