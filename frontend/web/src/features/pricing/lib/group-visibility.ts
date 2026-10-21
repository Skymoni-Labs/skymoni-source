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

export const pricingGroupSelectionSchema = z.object({
  groups: z.array(z.string().min(1)).max(256),
})
export type PricingGroupSelection = z.infer<typeof pricingGroupSelectionSchema>

/** null preserves the current catalog until the administrator saves a selection. */
export function parsePricingVisibleGroups(value: unknown): string[] | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const result = pricingGroupSelectionSchema.shape.groups.safeParse(
      JSON.parse(value)
    )
    return result.success
      ? [...new Set(result.data)].filter((group) => group !== 'auto')
      : null
  } catch {
    return null
  }
}
