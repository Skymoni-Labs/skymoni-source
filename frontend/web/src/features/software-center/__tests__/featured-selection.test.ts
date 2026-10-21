import { expect, test } from 'vitest'

import { resolveSoftwareFeatured } from '../featured-selection'
import { softwareFeaturedSchema } from '../lib/schema'
import type { SoftwareEntry } from '../types'

const entries = ['browser', 'mail', 'coding', 'draft'].map(
  (id, index): SoftwareEntry => ({
    id,
    name: id,
    kind: index > 1 ? 'tool' : 'software',
    description: '',
    platform: '',
    version: '',
    downloadUrl: '',
    filename: '',
    detailUrl: 'https://example.com',
    imageUrl: '',
    appearance: 'generic',
    sortOrder: index,
    published: id !== 'draft',
  })
)

test('unconfigured catalogs keep the existing automatic recommendations and skip drafts', () => {
  const result = resolveSoftwareFeatured(entries)
  expect(result.carousel.map((entry) => entry.id)).toEqual([
    'browser',
    'mail',
    'coding',
  ])
  expect(result.tiles.map((entry) => entry.id)).toEqual(['mail', 'coding'])
})

test('manual slots follow their own order and omit unpublished or removed items without replacements', () => {
  const result = resolveSoftwareFeatured(entries, {
    carousel: ['coding', 'draft', 'missing', 'browser'],
    tiles: ['browser', 'coding'],
  })
  expect(result.carousel.map((entry) => entry.id)).toEqual([
    'coding',
    'browser',
  ])
  expect(result.tiles.map((entry) => entry.id)).toEqual(['browser', 'coding'])
})

test('empty configured areas remain empty instead of silently picking other products', () => {
  expect(resolveSoftwareFeatured(entries, { carousel: [], tiles: [] })).toEqual(
    { carousel: [], tiles: [] }
  )
})

test('configuration validation accepts empty slots and rejects duplicate selections within one area', () => {
  expect(
    softwareFeaturedSchema.parse({
      carousel: ['', 'coding', 'browser'],
      tiles: ['browser'],
    })
  ).toEqual({ carousel: ['coding', 'browser'], tiles: ['browser'] })
  expect(
    softwareFeaturedSchema.safeParse({
      carousel: ['browser', 'browser'],
      tiles: [],
    }).success
  ).toBe(false)
  expect(
    softwareFeaturedSchema.safeParse({
      carousel: [],
      tiles: ['a', 'b', 'c', 'd'],
    }).success
  ).toBe(false)
})
