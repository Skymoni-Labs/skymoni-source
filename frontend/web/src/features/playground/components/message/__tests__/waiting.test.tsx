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
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { PlaygroundMessageContent } from '../playground-message-content'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, args?: { seconds?: number }) =>
      key.replace('{{seconds}}', String(args?.seconds ?? '')),
  }),
}))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('playground waiting feedback', () => {
  test('an empty reply shows elapsed waiting time and a slow-response hint', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    render(
      <PlaygroundMessageContent
        actions={null}
        alignment='left'
        versionContent=''
        message={{
          key: 'reply',
          from: 'assistant',
          versions: [{ id: 'v1', content: '' }],
          startedAt: 1000,
          status: 'loading',
        }}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent('Waited 0s')
    act(() => vi.advanceTimersByTime(16000))
    expect(screen.getByRole('status')).toHaveTextContent('Waited 16s')
    expect(
      screen.getByText(
        'The response is taking longer. You can keep waiting or stop generation.'
      )
    ).toBeInTheDocument()
  })
})
