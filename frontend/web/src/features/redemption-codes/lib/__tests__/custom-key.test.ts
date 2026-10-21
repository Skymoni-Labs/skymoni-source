import type { TFunction } from 'i18next'
import { describe, expect, test } from 'vitest'

import {
  getRedemptionFormSchema,
  transformFormDataToPayload,
} from '../redemption-form'
import { maskRedemptionKey } from '../utils'

const t = ((key: string) => key) as TFunction
const base = { name: 'gift', quota_dollars: 5, count: 20 }
describe('custom redemption keys', () => {
  test('preserves the exact trimmed key and creates one code', () => {
    expect(
      transformFormDataToPayload({ ...base, key: '  彩蛋-SKY  ' })
    ).toMatchObject({ key: '彩蛋-SKY', count: 1 })
    expect(
      transformFormDataToPayload({
        ...base,
        key: '彩蛋',
        reusable: true,
        max_claims: 100,
      })
    ).toMatchObject({ key: '彩蛋', count: 1, reusable: true, max_claims: 100 })
  })
  test('omits blank keys and preserves random batch creation', () => {
    const payload = transformFormDataToPayload({ ...base, key: '   ' })
    expect(payload).not.toHaveProperty('key')
    expect(payload.count).toBe(20)
  })
  test.each(['has space', 'a\nb', 'a\u200bb', 'x'.repeat(33)])(
    'rejects invalid key %s',
    (key) => {
      expect(
        getRedemptionFormSchema(t).safeParse({ ...base, key }).success
      ).toBe(false)
    }
  )
  test.each(['彩蛋', '福'.repeat(32), 'SKY-2026_福利', 'x'.repeat(32), ''])(
    'accepts key %s',
    (key) => {
      expect(
        getRedemptionFormSchema(t).safeParse({ ...base, key }).success
      ).toBe(true)
    }
  )
  test('masks short keys without repeating or exposing the entire value', () => {
    expect(maskRedemptionKey('彩蛋')).toBe('**')
    expect(maskRedemptionKey('ABCDE')).toBe('A***E')
    expect(maskRedemptionKey('12345678901234567890123456789012')).toBe(
      '12345678****************56789012'
    )
  })
})
