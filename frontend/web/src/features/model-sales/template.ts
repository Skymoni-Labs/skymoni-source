import type { Sale, SaleConfig, SaleInput, SaleQuote } from './api'

export function updatedSaleConfig(
  config: SaleConfig,
  patch: Partial<SaleConfig>
): SaleConfig {
  const next = { ...config, ...patch }
  if (
    config.models.includes('deepseek-flash') &&
    config.models.includes('deepseek-v4.1-flash')
  ) {
    if (!next.models.includes('deepseek-v4.1-flash'))
      next.models = next.models.filter((n) => n !== 'deepseek-flash')
    else if (patch.model_multipliers?.['deepseek-v4.1-flash'] !== undefined)
      next.model_multipliers = {
        ...patch.model_multipliers,
        'deepseek-flash': patch.model_multipliers['deepseek-v4.1-flash'],
      }
  }
  return next
}

export function saleConfigForSave(
  config: SaleConfig,
  quotes: SaleQuote[]
): SaleConfig {
  const factors: Record<string, number> = {}
  const requests: Record<string, number> = {}
  for (const name of config.models) {
    const quote = quotes.find((q) => q.model === name)
    if (quote?.pricing_basis === 'official')
      factors[name] =
        config.model_multipliers?.[name] ?? quote.target_multiplier
    else if (quote?.pricing_basis === 'request')
      requests[name] =
        config.request_prices_cny?.[name] ?? quote.target_request_cny ?? 0
    else {
      // Compatibility aliases can be absent from the public quote list. Keep
      // their explicit target; the enable API still validates every alias.
      if (config.model_multipliers?.[name] !== undefined)
        factors[name] = config.model_multipliers[name]
      if (config.request_prices_cny?.[name] !== undefined)
        requests[name] = config.request_prices_cny[name]
    }
  }
  return { ...config, model_multipliers: factors, request_prices_cny: requests }
}

// Reuse settings only. The create API supplies a new ID, empty price plan,
// unpublished announcement and draft status; no captured original price survives.
export function saleTemplateInput(
  sales: Sale[],
  serverTime: number,
  title?: string
): SaleInput {
  if (!sales.length) throw new Error('请选择要复用的活动')
  const first = sales[0]
  const config = structuredClone(first.config)
  const policyKey = (sale: Sale) =>
    JSON.stringify(
      Object.entries(sale.config.policy).sort(([a], [b]) => a.localeCompare(b))
    )
  if (
    sales.length > 1 &&
    sales.some(
      (sale) =>
        sale.config.pricing_basis !== 'official' ||
        policyKey(sale) !== policyKey(first) ||
        sale.config.countdown_mode !== first.config.countdown_mode
    )
  )
    throw new Error('价格基准、成本保护参数或倒计时模式不同，请分别复用')

  config.models = []
  config.model_multipliers = {}
  config.request_prices_cny = {}
  for (const sale of sales) {
    for (const name of sale.config.models) {
      const factor = sale.config.model_multipliers?.[name]
      const price = sale.config.request_prices_cny?.[name]
      if (config.models.includes(name)) {
        if (
          config.model_multipliers[name] !== factor ||
          config.request_prices_cny[name] !== price
        )
          throw new Error(`${name} 在活动中的价格不同，请分别复用`)
        continue
      }
      config.models.push(name)
      if (factor !== undefined) config.model_multipliers[name] = factor
      if (price !== undefined) config.request_prices_cny[name] = price
    }
  }
  // Preserve omitted maps in old percentage templates, rather than interpreting
  // an empty map as explicit per-model factors.
  if (first.config.model_multipliers === undefined && sales.length === 1)
    delete config.model_multipliers
  if (first.config.request_prices_cny === undefined && sales.length === 1)
    delete config.request_prices_cny

  const nextStart = Math.ceil((serverTime + 300) / 60) * 60
  const duration = Math.min(
    7 * 86400,
    Math.max(600, ...sales.map((s) => s.end_at - s.start_at))
  )
  const templateTitle =
    title ?? `${first.title.replace(/ · 复用模板$/, '')} · 复用模板`
  return {
    title: Array.from(templateTitle).slice(0, 100).join(''),
    start_at: nextStart,
    end_at: nextStart + duration,
    revision: 0,
    config,
  }
}

export function templateModelCount(sale: Sale): number {
  return new Set(
    sale.config.models.map((name) =>
      name === 'deepseek-flash' ? 'deepseek-v4.1-flash' : name
    )
  ).size
}
