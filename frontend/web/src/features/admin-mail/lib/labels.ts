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
import type { TFunction } from 'i18next'

export function mailStatusLabel(status: string, t: TFunction): string {
  switch (status) {
    case 'draft':
      return t('Draft')
    case 'scheduled':
      return t('定时待发送')
    case 'schedule_failed':
      return t('定时发送已拦截')
    case 'queued':
      return t('Mail queued')
    case 'completed':
      return t('Mail completed')
    case 'cancelled':
      return t('Cancelled')
    case 'pending':
      return t('Waiting to send')
    case 'sending':
      return t('Sending')
    case 'sent':
      return t('SMTP accepted')
    case 'failed':
      return t('Send failed')
    case 'uncertain':
      return t('Delivery unconfirmed')
    case 'skipped':
      return t('Skipped')
    default:
      return status
  }
}
export function mailResultLabel(result: string, t: TFunction): string {
  switch (result) {
    case 'smtp_accepted':
      return t(
        'SMTP accepted; inbox delivery depends on the recipient mail service.'
      )
    case 'smtp_failed':
      return t(
        'SMTP rejected or unavailable. Check email settings before creating another mailing.'
      )
    case 'delivery_unknown':
      return t(
        'Delivery may have succeeded. Check with the recipient before sending again.'
      )
    case 'recipient_changed':
      return t(
        'Account disabled, removed or bound email changed after the draft was saved.'
      )
    case 'cancelled':
      return t('Cancelled')
    default:
      return ''
  }
}
