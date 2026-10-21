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
export interface MailInput {
  request_key: string
  subject: string
  content: string
  format: 'text' | 'markdown' | 'html'
  audience: 'emails' | 'users' | 'all_users'
  user_ids: number[]
  emails: string[]
}

export interface MailCampaign {
  id: number
  subject: string
  content: string
  html: string
  format: MailInput['format']
  audience: MailInput['audience']
  status:
    | 'draft'
    | 'scheduled'
    | 'schedule_failed'
    | 'queued'
    | 'completed'
    | 'cancelled'
  send_at: number
  schedule_error: string
  recipient_count: number
  skipped_count: number
  created_at: number
  counts: Record<string, number>
}

export interface MailRecipient {
  id: number
  user_id: number
  username: string
  email: string
  status: string
  result: string
}

export interface MailList {
  items: MailCampaign[]
  total: number
  smtp_ready: boolean
  sender: string
}
