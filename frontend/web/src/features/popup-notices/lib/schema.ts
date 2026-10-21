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

import type { PopupNotice } from '../types'

export const popupTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Template name is required')
    .max(100, 'Template name is too long'),
  title: z
    .string()
    .trim()
    .min(1, 'Popup title is required')
    .max(200, 'Popup title is too long'),
  content: z
    .string()
    .refine((value) => value.trim().length > 0, 'Popup content is required')
    .refine(
      (value) => new TextEncoder().encode(value).byteLength <= 262144,
      'Popup content is too long'
    ),
  format: z.enum(['auto', 'text', 'markdown', 'html']),
})

export type PopupTemplateForm = z.infer<typeof popupTemplateSchema>

export const popupFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Popup title is required')
      .max(200, 'Popup title is too long'),
    content: z
      .string()
      .refine((value) => value.trim().length > 0, 'Popup content is required')
      .refine(
        (value) => new TextEncoder().encode(value).byteLength <= 262144,
        'Popup content is too long'
      ),
    format: z.enum(['auto', 'text', 'markdown', 'html']),
    audience: z.enum(['all_users', 'user', 'guest']),
    target_user_id: z.number().int().nonnegative(),
    frequency: z.enum(['once', 'daily', 'visit']),
    duration_days: z
      .string()
      .refine(
        (value) =>
          value === '' ||
          (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 3650),
        'Enter a whole number of days from 1 to 3650, or leave blank for unlimited display.'
      ),
    benefit_code_id: z.number().int().nonnegative().optional(),
    priority: z.number().int().min(0).max(100),
  })
  .superRefine((values, context) => {
    if (values.audience === 'user' && values.target_user_id < 1) {
      context.addIssue({
        code: 'custom',
        path: ['target_user_id'],
        message: 'Select a recipient',
      })
    }
  })

export type PopupFormValues = z.infer<typeof popupFormSchema>

export function getPopupDurationDays(notice: PopupNotice): number {
  if (notice.duration_days > 0) return notice.duration_days
  if (notice.end_at <= 0) return 0
  // Preserve finite legacy windows when their first edit adopts duration days.
  const start =
    notice.start_at || notice.published_at || notice.created_at || notice.end_at
  return Math.max(1, Math.ceil((notice.end_at - start) / 86400))
}
