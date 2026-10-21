import { expect, test } from 'vitest'

import { refreshRetryDelay } from './refresh-retry'

test('Retry-After seconds and dates are bounded and invalid values have a safe delay', () => {
  expect(refreshRetryDelay('42')).toBe(42000)
  expect(
    refreshRetryDelay('Thu, 01 Jan 2026 00:01:00 GMT', Date.UTC(2026, 0, 1))
  ).toBe(60000)
  expect(refreshRetryDelay(undefined)).toBe(60000)
  expect(refreshRetryDelay('invalid')).toBe(60000)
  expect(refreshRetryDelay('-1')).toBe(1000)
  expect(refreshRetryDelay('99999999')).toBe(1200000)
})
