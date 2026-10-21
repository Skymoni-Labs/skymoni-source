import type { TFunction } from 'i18next'
import { describe, expect, test } from 'vitest'

import {
  getRedemptionFormSchema,
  transformFormDataToPayload,
} from '../redemption-form'
import { isRedemptionExhausted } from '../utils'

const t = ((key: string) => key) as TFunction

describe('shared welfare code form', () => {
  test('creates one shared code regardless of a previous batch quantity', () => {
    expect(
      transformFormDataToPayload({
        name: 'welfare',
        quota_dollars: 5,
        count: 20,
        reusable: true,
        max_claims: 100,
      })
    ).toMatchObject({ count: 1, reusable: true, max_claims: 100 })
  })
  test('switching back to single use clears the shared limit', () => {
    expect(
      transformFormDataToPayload({
        name: 'gift',
        quota_dollars: 5,
        count: 20,
        reusable: false,
        max_claims: 100,
      })
    ).toMatchObject({ count: 20, reusable: false, max_claims: 0 })
  })
  test.each([-1, 1.5, 1_000_000_001])(
    'rejects invalid claim limit %s',
    (limit) => {
      expect(
        getRedemptionFormSchema(t).safeParse({
          name: 'gift',
          quota_dollars: 5,
          reusable: true,
          max_claims: limit,
        }).success
      ).toBe(false)
    }
  )
  test('zero is unlimited and a full shared code has its own display state', () => {
    const base = {
      id: 1,
      user_id: 1,
      name: 'gift',
      key: 'key',
      status: 1,
      quota: 100,
      created_time: 1,
      expired_time: 0,
      redeemed_time: 0,
      used_user_id: 0,
      reusable: true,
      claimed_count: 100,
    }
    expect(isRedemptionExhausted({ ...base, max_claims: 0 })).toBe(false)
    expect(isRedemptionExhausted({ ...base, max_claims: 100 })).toBe(true)
    expect(isRedemptionExhausted({ ...base, max_claims: 101 })).toBe(false)
  })
})
