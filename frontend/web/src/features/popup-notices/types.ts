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
export type PopupFormat = 'auto' | 'text' | 'markdown' | 'html'
export type PopupAudience = 'all_users' | 'user' | 'guest'
export type PopupFrequency = 'once' | 'daily' | 'visit'
export type PopupStatus = 'draft' | 'published' | 'disabled'

export type PopupTemplateContent = {
  title: string
  content: string
  format: PopupFormat
}

export interface PopupTemplate extends PopupTemplateContent {
  id: number
  name: string
  revision: number
  created_at: number
  updated_at: number
  created_by: number
}

export type PopupTemplateInput = PopupTemplateContent & {
  name: string
  revision?: number
}

export interface PopupTemplateList {
  items: PopupTemplate[]
  total: number
}

export interface PopupNotice {
  benefit_code_id?: number
  id: number
  title: string
  content: string
  format: PopupFormat
  audience: PopupAudience
  target_user_id: number
  status: PopupStatus
  frequency: PopupFrequency
  duration_days: number
  start_at: number
  end_at: number
  priority: number
  revision: number
  created_at: number
  updated_at: number
  published_at: number
  created_by: number
  read_count?: number
}

export type PopupNoticeInput = Pick<
  PopupNotice,
  | 'benefit_code_id'
  | 'title'
  | 'content'
  | 'format'
  | 'audience'
  | 'target_user_id'
  | 'frequency'
  | 'duration_days'
  | 'start_at'
  | 'end_at'
  | 'priority'
> & { revision?: number; status: 'draft' }

export type PopupNoticeDelivery = Pick<
  PopupNotice,
  | 'id'
  | 'benefit_code_id'
  | 'title'
  | 'content'
  | 'format'
  | 'frequency'
  | 'start_at'
  | 'end_at'
  | 'priority'
  | 'revision'
  | 'published_at'
>

export interface PopupNoticeList {
  items: PopupNotice[]
  total: number
}

export interface PopupHistoryItem {
  benefit_code_id?: number
  id: number
  notice_id: number
  revision: number
  title: string
  format: PopupFormat
  published_at: number
  read_at: number
}

export interface PopupHistoryDetail extends PopupHistoryItem {
  content: string
}
