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

export const mailFormSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(1, 'Enter an email subject (up to 200 characters).')
      .max(200, 'Enter an email subject (up to 200 characters).')
      .refine(
        (value) =>
          ![...value].some((character) => {
            const code = character.codePointAt(0) ?? 0
            return code < 32 || code === 127
          }),
        'Email subject cannot contain control characters.'
      ),
    content: z
      .string()
      .refine(
        (value) =>
          value.trim().length > 0 &&
          new TextEncoder().encode(value).length <= 65536,
        'Enter email content (up to 64 KiB).'
      ),
    format: z.enum(['text', 'markdown', 'html']),
    audience: z.enum(['emails', 'users', 'all_users']),
    user_ids: z.array(z.number().int().positive()).max(5000),
    recipient_emails: z.string(),
  })
  .refine((value) => value.audience !== 'users' || value.user_ids.length > 0, {
    path: ['user_ids'],
    message: 'Select at least one user',
  })
  .refine(
    (value) => {
      if (value.audience !== 'emails') return true
      const addresses = parseRecipientEmails(value.recipient_emails)
      return (
        addresses.length > 0 &&
        addresses.length <= 5000 &&
        addresses.every((address) => z.email().safeParse(address).success)
      )
    },
    {
      path: ['recipient_emails'],
      message: 'Enter valid recipient email addresses (one per line).',
    }
  )

export function parseRecipientEmails(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((address) => address.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
}

export type MailFormValues = z.infer<typeof mailFormSchema>
