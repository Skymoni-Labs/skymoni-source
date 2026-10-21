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
import { expect, test, vi } from 'vitest'

import { getMailDraftInput, getMailTemplateInput } from '../api'
import { mailFormSchema } from '../lib/schema'

const boundary = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get: boundary.get } }))

test.each([
  { audience: 'emails', user_ids: null, emails: ['reader@example.invalid'] },
  { audience: 'users', user_ids: [5], emails: null },
  { audience: 'all_users', user_ids: null, emails: null },
])(
  'a $audience draft with null recipient slices can pass form validation',
  async (recipients) => {
    boundary.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          subject: 'Notice',
          content: 'Hello',
          format: 'text',
          ...recipients,
        },
      },
    })
    const input = await getMailDraftInput(12)
    expect(boundary.get).toHaveBeenCalledWith('/api/admin-mail/12/edit')
    expect(input.user_ids).toEqual(recipients.user_ids ?? [])
    expect(input.emails).toEqual(recipients.emails ?? [])
    expect(
      mailFormSchema.safeParse({
        ...input,
        recipient_emails: input.emails.join('\n'),
      }).success
    ).toBe(true)
  }
)

test('a sent direct-email template copies recipients from every page', async () => {
  const emails = Array.from(
    { length: 51 },
    (_, index) => `reader${index}@example.invalid`
  )
  boundary.get
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          subject: 'Sent notice',
          content: 'Original body',
          format: 'markdown',
          audience: 'emails',
          status: 'completed',
          recipient_count: 51,
        },
      },
    })
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: emails.slice(0, 50).map((email) => ({ email, user_id: 0 })),
      },
    })
    .mockResolvedValueOnce({
      data: { success: true, data: [{ email: emails[50], user_id: 0 }] },
    })
  const input = await getMailTemplateInput(18)
  expect(input).toMatchObject({
    subject: 'Sent notice',
    content: 'Original body',
    format: 'markdown',
    audience: 'emails',
    emails,
    user_ids: [],
  })
  expect(boundary.get.mock.calls.map(([path]) => path)).toEqual([
    '/api/admin-mail/18',
    '/api/admin-mail/18/recipients',
    '/api/admin-mail/18/recipients',
  ])
  expect(boundary.get.mock.calls[2][1]).toEqual({ params: { page: 2 } })
})

test.each([
  { audience: 'users', ids: [5, 6] },
  { audience: 'all_users', ids: [] },
])(
  'a sent $audience template preserves its recipient mode',
  async ({ audience, ids }) => {
    boundary.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          subject: 'Sent notice',
          content: 'Body',
          format: 'text',
          audience,
          status: 'completed',
          recipient_count: 2,
        },
      },
    })
    if (audience === 'users') {
      boundary.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: [
            { user_id: 5, email: 'alice@example.invalid' },
            { user_id: 6, email: 'bob@example.invalid' },
          ],
        },
      })
    }
    const input = await getMailTemplateInput(18)
    expect(input).toMatchObject({ audience, user_ids: ids, emails: [] })
    expect(boundary.get).toHaveBeenCalledTimes(audience === 'users' ? 2 : 1)
  }
)

test('a failed recipient page does not load an incomplete reusable template', async () => {
  boundary.get
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          subject: 'Sent notice',
          content: 'Body',
          format: 'text',
          audience: 'emails',
          status: 'completed',
          recipient_count: 51,
        },
      },
    })
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: Array.from({ length: 50 }, (_, id) => ({
          user_id: 0,
          email: `reader${id}@example.invalid`,
        })),
      },
    })
    .mockRejectedValueOnce(new Error('Recipient page unavailable'))
  await expect(getMailTemplateInput(18)).rejects.toThrow(
    'Recipient page unavailable'
  )
})
