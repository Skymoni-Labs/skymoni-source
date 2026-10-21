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

// Public display data only. Redemption codes and stock files never belong here.
export const rechargeCatalogSchema = z.object({
  plans: z
    .array(
      z.object({
        id: z.string().regex(/^\d{2}$/),
        price_cny: z.number().positive().max(99999),
        credit_usd: z.number().positive(),
        base_credit: z.number().positive().optional(),
        url: z.string().regex(/^https:\/\/catfk\.com\/item\/[a-zA-Z0-9]+$/),
        status: z.enum(['pending', 'available', 'sold_out', 'paused']),
      })
    )
    .max(50)
    .refine(
      (plans) => new Set(plans.map((plan) => plan.id)).size === plans.length
    ),
})
