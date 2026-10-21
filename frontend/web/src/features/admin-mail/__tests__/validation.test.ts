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
import { expect, test } from 'vitest'

import { mailFormSchema, parseRecipientEmails } from '../lib/schema'

const valid = {
  subject: 'Notice',
  content: 'Hello',
  format: 'text',
  audience: 'all_users',
  user_ids: [],
  recipient_emails: '',
}

test('a subject containing header separators is rejected', () => {
  expect(
    mailFormSchema.safeParse({
      ...valid,
      subject: 'Notice\r\nBcc: other@example.invalid',
    }).success
  ).toBe(false)
})

test('the content limit counts UTF-8 bytes rather than characters', () => {
  expect(
    mailFormSchema.safeParse({ ...valid, content: '文'.repeat(22000) }).success
  ).toBe(false)
  expect(
    mailFormSchema.safeParse({ ...valid, content: '文'.repeat(21000) }).success
  ).toBe(true)
})

test('selected-user mailings require positive recipient IDs', () => {
  expect(
    mailFormSchema.safeParse({ ...valid, audience: 'users' }).success
  ).toBe(false)
  expect(
    mailFormSchema.safeParse({ ...valid, audience: 'users', user_ids: [5, 6] })
      .success
  ).toBe(true)
})

test('direct addresses are validated and duplicate addresses are merged', () => {
  expect(
    mailFormSchema.safeParse({ ...valid, audience: 'emails' }).success
  ).toBe(false)
  expect(
    mailFormSchema.safeParse({
      ...valid,
      audience: 'emails',
      recipient_emails: 'not-an-email',
    }).success
  ).toBe(false)
  expect(
    mailFormSchema.safeParse({
      ...valid,
      audience: 'emails',
      recipient_emails: '2924128981@qq.com',
    }).success
  ).toBe(true)
  expect(
    parseRecipientEmails(
      ' Alice@example.invalid;alice@example.invalid\nbob@example.invalid, '
    )
  ).toEqual(['alice@example.invalid', 'bob@example.invalid'])
})
