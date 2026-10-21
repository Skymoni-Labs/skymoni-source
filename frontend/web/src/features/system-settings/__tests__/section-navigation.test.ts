import type { TFunction } from 'i18next'
import { expect, test } from 'vitest'

import * as navigation from '../section-navigation'

const registries = [
  ['auth', () => import('../auth/section-registry'), 'AUTH', 'Auth'],
  [
    'billing',
    () => import('../billing/section-registry'),
    'BILLING',
    'Billing',
  ],
  [
    'content',
    () => import('../content/section-registry'),
    'CONTENT',
    'Content',
  ],
  ['models', () => import('../models/section-registry'), 'MODELS', 'Models'],
  [
    'operations',
    () => import('../operations/section-registry'),
    'OPERATIONS',
    'Operations',
  ],
  [
    'request-policies',
    () => import('../request-policies/section-registry'),
    'POLICY',
    'Policy',
  ],
  [
    'security',
    () => import('../security/section-registry'),
    'SECURITY',
    'Security',
  ],
  ['site', () => import('../site/section-registry'), 'SITE', 'Site'],
] as const

test.each(registries)(
  '%s lightweight navigation retains every existing settings section and link',
  async (_, load, prefix, name) => {
    const original = (await load()) as unknown as Record<string, unknown>
    const light = navigation as unknown as Record<string, unknown>
    const navKey = `get${name}SectionNavItems`
    const translate = ((key: string) => key) as TFunction
    const originalNav = original[navKey] as (t: TFunction) => unknown[]
    const lightweightNav = light[navKey] as (t: TFunction) => unknown[]
    expect(lightweightNav(translate)).toEqual(originalNav(translate))
    expect(light[`${prefix}_SECTION_IDS`]).toEqual(
      original[`${prefix}_SECTION_IDS`]
    )
    if (original[`${prefix}_DEFAULT_SECTION`]) {
      expect(light[`${prefix}_DEFAULT_SECTION`]).toBe(
        original[`${prefix}_DEFAULT_SECTION`]
      )
    }
  }
)
