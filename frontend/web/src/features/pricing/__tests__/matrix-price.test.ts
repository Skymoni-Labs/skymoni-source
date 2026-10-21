import { describe, expect, it } from 'vitest'

import domesticPolicy from '../../../../moni/domestic-official-pricing.json'
import { matrixRows } from '../lib/matrix-price'
import type { PricingModel } from '../types'

it('compares Gemini 3.8 Flash with current standard prices at the approved 0.24x quote', () => {
  const rows = matrixRows(
    {
      id: 44,
      model_name: 'gemini-3.8-flash-token',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 5,
      enable_groups: ['default'],
      group_ratio: { default: 1 },
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("standard", p * 13.14 + c * 65.7 + cr * 1.314)',
    },
    0.1 / 7.3
  )
  expect(rows).toHaveLength(1)
  expect(rows[0].official).toMatchObject({
    input: 0.75,
    output: 3.75,
    read: 0.075,
  })
  expect(rows[0].input).toBeCloseTo(0.18, 10)
  expect(rows[0].output).toBeCloseTo(0.9, 10)
  expect(rows[0].read).toBeCloseTo(0.018, 10)
})

const model: PricingModel = {
  id: 1,
  model_name: 'gpt-6-astra-token',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 5,
  enable_groups: ['default', 'metered'],
  group_ratio: { default: 1, metered: 2 },
  billing_mode: 'tiered_expr',
  billing_expr:
    'len <= 272000 ? tier("short", p * 79.316105 + c * 396.580524) : tier("long", p * 158.632210 + c * 594.870785)',
}
it('shows Gemini 3.8 Flash as a fixed request despite its legacy token alias', () => {
  const flash = {
    ...model,
    model_name: 'gemini-3.8-flash-token',
    billing_expr: 'tier("request", fixed(0.5))',
  }
  const rows = matrixRows(flash, 0.1 / 7.3)
  expect(rows).toHaveLength(1)
  expect(rows[0].unit).toBe('request')
  expect((rows[0].input ?? Number.NaN) * 7.3).toBeCloseTo(0.05, 10)
  expect(rows[0].output).toBeUndefined()
  expect(rows[0].read).toBeUndefined()
  expect(matrixRows(flash, 0.1 / 7.3, 'metered')[0].input).toBeCloseTo(
    (rows[0].input ?? Number.NaN) * 2,
    10
  )
})

describe('price matrix', () => {
  it('compares all reviewed domestic aliases against current official prices in the same currency', () => {
    const fx = 7.3
    for (const [name, spec] of Object.entries(domesticPolicy.models)) {
      const factor =
        (spec.multiplier * (spec.currency === 'USD' ? fx : 1)) / 0.1
      const leaves = Object.entries(spec.tiers).map(
        ([label, prices]) =>
          `tier("${label}", ${Object.entries(prices)
            .map(([key, value]) => `${key} * ${value * factor}`)
            .join(' + ')})`
      )
      let expr = leaves[0]
      if (spec.kind === 'peak') {
        expr = `hour("UTC") < 4 ? ${leaves[0]} : ${leaves[1]}`
      }
      if (spec.kind === 'context') {
        expr = `len <= 512000 ? ${leaves[0]} : ${leaves[1]}`
      }
      const rows = matrixRows(
        { ...model, model_name: name, billing_expr: expr },
        0.1 / fx
      )
      expect(rows).toHaveLength(leaves.length)
      for (const row of rows) {
        for (const field of [
          'input',
          'output',
          'read',
          'write',
          'write1h',
        ] as const) {
          if (row[field] !== undefined) {
            expect(row.official?.[field], `${name}: ${field}`).toBeGreaterThan(
              0
            )
            expect(
              (row[field] ?? Number.NaN) / (row.official?.[field] ?? Number.NaN)
            ).toBeCloseTo(spec.multiplier, 10)
          }
        }
      }
      if (name === 'minimax-m3') {
        expect(rows.map((row) => row.label)).toEqual(['≤512K', '>512K'])
      }
    }
  })
  it('compares Flash peak and off-peak input, output and cache reads against the corresponding official prices', () => {
    const flash = {
      ...model,
      model_name: 'deepseek-flash',
      billing_expr:
        'weekday("UTC") >= 1 && weekday("UTC") <= 5 && hour("UTC") >= 1 && hour("UTC") < 4 ? tier("peak", p * 2.19 + c * 8.76 + cr * 0.0438) : tier("off_peak", p * 1.095 + c * 4.38 + cr * 0.0219)',
    }
    const rows = matrixRows(flash, 0.1 / 7.3)
    expect(rows[0].official).toMatchObject({
      input: 0.3,
      output: 1.2,
      read: 0.006,
    })
    expect(rows[1].official).toMatchObject({
      input: 0.15,
      output: 0.6,
      read: 0.003,
    })
    for (const row of rows) {
      expect(
        (row.input ?? Number.NaN) / (row.official?.input ?? Number.NaN)
      ).toBeCloseTo(0.1, 10)
      expect(
        (row.output ?? Number.NaN) / (row.official?.output ?? Number.NaN)
      ).toBeCloseTo(0.1, 10)
      expect(
        (row.read ?? Number.NaN) / (row.official?.read ?? Number.NaN)
      ).toBeCloseTo(0.1, 10)
      expect(row.official?.write).toBeUndefined()
    }
    expect(
      matrixRows({ ...flash, model_name: 'deepseek-unknown' }, 0.1 / 7.3)[0]
        .official
    ).toBeUndefined()
    expect(
      matrixRows(
        { ...flash, billing_expr: 'tier("custom", p * 1)' },
        0.1 / 7.3
      )[0].official
    ).toBeUndefined()
  })
  it('converts Jev usage units to official input pricing with free output', () => {
    const rows = matrixRows(
      {
        ...model,
        model_name: 'jev-latest',
        billing_expr:
          'tier("base", u("input_tokens") * 3.066 / 1000000 + u("output_tokens") * 0 / 1000000)',
        billing_usage_schema: {
          input_tokens: { type: 'number', unit: 'token' },
          output_tokens: { type: 'number', unit: 'token' },
        },
      },
      1 / 73
    )
    expect(rows[0].input).toBeCloseTo(0.042, 8)
    expect(rows[0].output).toBe(0)
    expect(rows[0].official).toMatchObject({ input: 0.042, output: 0 })
  })
  it('converts credits to real USD and matches both context tiers', () => {
    const rows = matrixRows(model, 0.1 / 7.3)
    expect(rows).toHaveLength(2)
    expect(rows[0].input).toBeCloseTo(1.086522, 5)
    expect(rows[0].official?.input).toBe(10)
    expect(rows[1].official?.input).toBe(20)
    expect(rows[1].official?.output).toBe(75)
    expect(rows[1].input).toBeCloseTo((rows[0].input ?? Number.NaN) * 2)
    expect(matrixRows(model, 0.1 / 7.3, 'metered')[0].input).toBeCloseTo(
      (rows[0].input ?? Number.NaN) * 2
    )
  })
  it('includes the different Claude cache pricing without confusing pro route aliases', () => {
    const rows = matrixRows(
      {
        ...model,
        model_name: 'claude-opus-5-5-token-pro',
        billing_expr:
          'tier("flat", p * 126.9 + c * 634.5 + cr * 6.345 + cc * 158.6 + cc1h * 253.8)',
      },
      0.01
    )
    expect(rows[0].official).toMatchObject({
      input: 4,
      output: 20,
      read: 0.2,
      write: 5,
      write1h: 8,
    })
    expect(rows[0].read).toBeCloseTo(0.06345)
  })
  it('keeps per request units separate from the official token reference', () => {
    const rows = matrixRows(
      { ...model, billing_expr: 'tier("request", fixed(0.5))' },
      0.01
    )
    expect(rows[0]).toMatchObject({ unit: 'request', input: 0.005 })
    expect(rows[0].official).toMatchObject({ input: 10, output: 50 })
  })
  it('shows same-name official token rates for per-request GPT without comparing units', () => {
    const rows = matrixRows(
      {
        ...model,
        model_name: 'gpt-5.6',
        billing_expr: 'tier("request", fixed(0.5))',
      },
      0.01
    )
    expect(rows[0]).toMatchObject({
      unit: 'request',
      input: 0.005,
      official: { input: 4, output: 20 },
    })
    expect(
      matrixRows(
        {
          ...model,
          model_name: 'gpt-5.6-luna',
          billing_expr: 'tier("request", fixed(0.5))',
        },
        0.01
      )[0].official
    ).toMatchObject({ input: 0.2, output: 1.2, read: 0.02 })
  })
  it('does not invent real prices without an exchange rate', () => {
    expect(matrixRows(model, Number.NaN)[0].input).toBeUndefined()
  })
})

// The exact production plan must yield 0.17 against official prices, not upstream prices.
it('keeps all six standard routes at 0.17 for both inputs and outputs in both tiers', async () => {
  const { default: plan } =
    await import('../../../../../moni/official-017-pricing.json')
  for (const [name, expr] of Object.entries(plan.expressions)) {
    const rows = matrixRows(
      { ...model, model_name: name, billing_expr: expr },
      0.1 / 7.3
    )
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(
        (row.input ?? Number.NaN) / (row.official?.input ?? Number.NaN)
      ).toBeCloseTo(0.17, 10)
      expect(
        (row.output ?? Number.NaN) / (row.official?.output ?? Number.NaN)
      ).toBeCloseTo(0.17, 10)
      // A long input and short output still total 17% of the same official usage.
      const total =
        (row.input ?? Number.NaN) * 0.2 + (row.output ?? Number.NaN) * 0.01
      const officialTotal =
        (row.official?.input ?? Number.NaN) * 0.2 +
        (row.official?.output ?? Number.NaN) * 0.01
      expect(total / officialTotal).toBeCloseTo(0.17, 10)
    }
  }
})

it('uses the new GPT-6.1 Sol cached-input price in both context tiers', async () => {
  const { default: plan } =
    await import('../../../../../moni/official-017-pricing.json')
  const rows = matrixRows(
    {
      ...model,
      model_name: 'gpt-6.1-sol-token',
      billing_expr: plan.expressions['gpt-6.1-sol-token'],
    },
    0.1 / 7.3
  )
  expect(rows[0].official?.read).toBe(0.1)
  expect(rows[1].official?.read).toBe(0.2)
  expect((rows[0].read ?? Number.NaN) / 0.1).toBeCloseTo(0.17, 10)
  expect((rows[1].read ?? Number.NaN) / 0.2).toBeCloseTo(0.17, 10)
})

it.each([
  ['grok-4.5-token', 0.3, 3.285],
  ['grok-4.6-token', 0.5, 5.475],
  ['grok-4.7-token', 0.5, 5.475],
] as const)(
  'matches %s official prices at the 200K boundary',
  (name, read, cached) => {
    const grok = {
      ...model,
      model_name: name,
      billing_expr: `len <= 199999 ? tier("short", p * 21.9 + c * 65.7 + cr * ${cached}) : tier("long", p * 43.8 + c * 131.4 + cr * ${cached * 2})`,
    }
    const rows = matrixRows(grok, 1 / 73)
    expect(rows[0].official).toMatchObject({ input: 2, output: 6, read })
    expect(rows[1].official).toMatchObject({
      input: 4,
      output: 12,
      read: read * 2,
    })
    expect(rows.map((row) => row.label)).toEqual(['<200K', '≥200K'])
    for (const row of rows) {
      expect(
        (row.input ?? Number.NaN) / (row.official?.input ?? Number.NaN)
      ).toBeCloseTo(0.15, 10)
      expect(
        (row.output ?? Number.NaN) / (row.official?.output ?? Number.NaN)
      ).toBeCloseTo(0.15, 10)
      expect(
        (row.read ?? Number.NaN) / (row.official?.read ?? Number.NaN)
      ).toBeCloseTo(0.15, 10)
    }
    expect(
      matrixRows(
        {
          ...grok,
          billing_expr: grok.billing_expr.replace('199999', '272000'),
        },
        1 / 73
      )[0].official
    ).toBeUndefined()
  }
)

it.each([
  ['claude-sonnet-5-5-token', 2, 10, 0.2, 2.5, 4],
  ['claude-sonnet-5-5-token-pro', 2, 10, 0.2, 2.5, 4],
  ['claude-opus-5-5-token', 4, 20, 0.2, 5, 8],
  ['claude-opus-5-5-token-pro', 4, 20, 0.2, 5, 8],
] as const)(
  'shows all five official standard prices for %s without treating pro as another model',
  (name, input, output, read, write, write1h) => {
    const rows = matrixRows(
      {
        ...model,
        model_name: name,
        billing_expr:
          'tier("standard", p * 1 + c * 1 + cr * 1 + cc * 1 + cc1h * 1)',
      },
      0.1 / 6.704587807258851
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].official).toMatchObject({
      input,
      output,
      read,
      write,
      write1h,
    })
  }
)
