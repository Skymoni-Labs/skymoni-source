import { describe, expect, it } from 'vitest'
import { defaultPolicy, type Sale } from './api'
import {
  saleTemplateInput,
  templateModelCount,
  updatedSaleConfig,
  saleConfigForSave,
} from './template'

const now = 1791770400
function sale(name: string, multiplier: number): Sale {
  return {
    id: name,
    title: '七天优惠',
    revision: 5,
    status: 'active',
    announcement_enabled: true,
    announcement_at: now,
    start_at: now - 86400,
    end_at: now + 6 * 86400,
    message: '已经生效',
    config: {
      models: [name],
      pricing_basis: 'official',
      model_multipliers: { [name]: multiplier },
      discount_percent: 0,
      policy: { ...defaultPolicy, minimum_margin_percent: 15 },
      countdown_mode: 'end',
    },
  }
}
describe('reusable model-sale settings', () => {
  it('keeps a hidden API alias during edits and gives it the same target as its canonical name', () => {
    const flash = sale('deepseek-v4.1-flash', 0.14)
    flash.config.models.push('deepseek-flash')
    flash.config.model_multipliers!['deepseek-flash'] = 0.14
    const updated = updatedSaleConfig(flash.config, {
      model_multipliers: {
        ...flash.config.model_multipliers,
        'deepseek-v4.1-flash': 0.13,
      },
    })
    const saved = saleConfigForSave(updated, [])
    expect(saved.model_multipliers).toEqual({
      'deepseek-v4.1-flash': 0.13,
      'deepseek-flash': 0.13,
    })
    expect(updatedSaleConfig(updated, { models: [] }).models).toEqual([])
    expect(flash.config.model_multipliers!['deepseek-flash']).toBe(0.14)
  })
  it('creates a fresh input without copying publication, revision or live price plans', () => {
    const source = sale('gpt-token', 0.14)
    const before = structuredClone(source)
    const next = saleTemplateInput([source], now)
    expect(next).toMatchObject({
      revision: 0,
      start_at: now + 300,
      end_at: now + 300 + 7 * 86400,
      config: source.config,
    })
    expect(next).not.toHaveProperty('id')
    expect(next).not.toHaveProperty('status')
    expect(next).not.toHaveProperty('announcement_enabled')
    expect(next).not.toHaveProperty('plan')
    next.config.policy.minimum_margin_percent = 99
    next.config.models.push('another')
    expect(source).toEqual(before)
  })
  it('combines different target multipliers and preserves a legacy API alias', () => {
    const flash = sale('deepseek-v4.1-flash', 0.14)
    flash.config.models.push('deepseek-flash')
    flash.config.model_multipliers!['deepseek-flash'] = 0.14
    const sources = [
      sale('gpt-token', 0.14),
      sale('deepseek-v4-pro', 0.1),
      sale('deepseek-v4.1-flash-low', 0.09),
      flash,
    ]
    const next = saleTemplateInput(sources, now, '组合模板')
    expect(next.config.model_multipliers).toEqual({
      'gpt-token': 0.14,
      'deepseek-v4-pro': 0.1,
      'deepseek-v4.1-flash-low': 0.09,
      'deepseek-v4.1-flash': 0.14,
      'deepseek-flash': 0.14,
    })
    expect(templateModelCount({ ...flash, config: next.config })).toBe(4)
  })
  it('keeps per-request prices and refuses incompatible policies or competing targets', () => {
    const call = sale('per-call', 0.1)
    call.config.model_multipliers = {}
    call.config.request_prices_cny = { 'per-call': 0.05 }
    expect(saleTemplateInput([call], now).config.request_prices_cny).toEqual({
      'per-call': 0.05,
    })
    const other = sale('other', 0.14)
    other.config.policy.minimum_margin_percent = 20
    expect(() => saleTemplateInput([call, other], now)).toThrow('成本保护')
    expect(() =>
      saleTemplateInput([sale('same', 0.14), sale('same', 0.13)], now)
    ).toThrow('价格不同')
  })
  it('supports old templates without reinterpreting omitted factor maps', () => {
    const legacy = sale('legacy', 0.9)
    delete legacy.config.pricing_basis
    delete legacy.config.model_multipliers
    legacy.config.discount_percent = 5
    const next = saleTemplateInput([legacy], now)
    expect(next.config.model_multipliers).toBeUndefined()
    expect(next.config.discount_percent).toBe(5)
  })
})
