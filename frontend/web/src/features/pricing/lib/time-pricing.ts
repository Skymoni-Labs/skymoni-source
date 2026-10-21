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
import {
  getCurrentTimePricingTiers,
  splitBillingExprAndRequestRules,
} from './billing-expr'
import { flattenBinary } from './billing-expression/display'
import { compileBillingExpression } from './billing-expression/parser'
import { expressionDependencies } from './billing-expression/types'

/** Describe the actual settlement condition; never infer a schedule from a model name. */
export function timePricingInfo(
  expression: string | undefined,
  now = new Date()
) {
  if (!expression) return null
  const { billingExpr, requestRuleExpr } =
    splitBillingExprAndRequestRules(expression)
  if (requestRuleExpr) return null
  const compiled = compileBillingExpression(billingExpr)
  const current = getCurrentTimePricingTiers(billingExpr, now)
  if (
    compiled.status !== 'ready' ||
    compiled.ast.kind !== 'conditional' ||
    !current
  )
    return null
  const { condition, yes, no } = compiled.ast
  const tierLabel = (node: typeof yes) =>
    node.kind === 'call' &&
    node.name === 'tier' &&
    node.args[0]?.kind === 'literal'
      ? node.args[0].value
      : undefined
  if (tierLabel(yes) !== 'peak' || tierLabel(no) !== 'off_peak') return null
  const exclusions: string[] = []
  const schedule: string[] = []
  for (const node of flattenBinary(condition, '&&')) {
    const deps = expressionDependencies(node)
    if (
      node.kind === 'unary' &&
      node.operator === '!' &&
      deps.variables.size === 0 &&
      deps.functions.size > 0 &&
      [...deps.functions].every((name) => name === 'month' || name === 'day')
    ) {
      exclusions.push(billingExpr.slice(node.operand.start, node.operand.end))
    } else {
      schedule.push(`(${billingExpr.slice(node.start, node.end)})`)
    }
  }
  return {
    condition: schedule.join(' && '),
    exclusions,
    currentLabel: current.length === 1 ? current[0].label : undefined,
  }
}

export function timeTierLabel(label: string) {
  return label === 'peak'
    ? 'Peak price'
    : label === 'off_peak'
      ? 'Off-peak price'
      : label
}
