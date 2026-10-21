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
import { z } from 'zod'

export const pricingGroupNameSchema = z
  .string()
  .max(80, 'Group names must be at most 80 characters')
  .refine(
    (value) =>
      ![...value].some((char) => {
        const code = char.codePointAt(0) ?? 0
        return code < 32 || (code >= 127 && code <= 159)
      }),
    'Group names must be single-line text'
  )

export function parsePricingGroupLabels(
  value: unknown
): Record<string, string> {
  if (typeof value !== 'string' || !value) return {}
  try {
    const parsed = z
      .record(z.string(), pricingGroupNameSchema)
      .safeParse(JSON.parse(value))
    if (!parsed.success) return {}
    return Object.fromEntries(
      Object.entries(parsed.data).filter(
        ([key]) =>
          key.trim() &&
          key.length <= 128 &&
          !['__proto__', 'constructor', 'prototype'].includes(key)
      )
    )
  } catch {
    return {}
  }
}
