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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { MailCampaign, MailInput, MailList, MailRecipient } from './types'

interface Response<T> {
  success: boolean
  message?: string
  data: T
}
interface MailDraftResponse extends Omit<MailInput, 'user_ids' | 'emails'> {
  user_ids: number[] | null
  emails: string[] | null
}
const path = '/api/admin-mail'

export async function listMail(page: number): Promise<MailList> {
  const response = await api.get<Response<MailList>>(path, { params: { page } })
  return requireServerSuccess(response.data).data
}
export async function getMail(id: number): Promise<MailCampaign> {
  const response = await api.get<Response<MailCampaign>>(`${path}/${id}`)
  return requireServerSuccess(response.data).data
}
export async function getMailDraftInput(id: number): Promise<MailInput> {
  const response = await api.get<Response<MailDraftResponse>>(
    `${path}/${id}/edit`
  )
  const input = requireServerSuccess(response.data).data
  // Go encodes unused recipient slices as null; the form requires arrays.
  return {
    ...input,
    user_ids: input.user_ids ?? [],
    emails: input.emails ?? [],
  }
}
export async function getMailTemplateInput(id: number): Promise<MailInput> {
  const campaign = await getMail(id)
  const recipients: MailRecipient[] = []
  if (campaign.audience !== 'all_users') {
    const pages = Math.ceil(campaign.recipient_count / 50)
    for (let page = 1; page <= pages; page++) {
      recipients.push(...(await mailRecipients(id, page)))
    }
  }
  return {
    request_key: crypto.randomUUID(),
    subject: campaign.subject,
    content: campaign.content,
    format: campaign.format,
    audience: campaign.audience,
    user_ids:
      campaign.audience === 'users'
        ? [
            ...new Set(
              recipients
                .map((recipient) => recipient.user_id)
                .filter((id) => id > 0)
            ),
          ]
        : [],
    emails:
      campaign.audience === 'emails'
        ? [...new Set(recipients.map((recipient) => recipient.email))]
        : [],
  }
}
export async function mailRecipients(
  id: number,
  page: number
): Promise<MailRecipient[]> {
  const response = await api.get<Response<MailRecipient[]>>(
    `${path}/${id}/recipients`,
    { params: { page } }
  )
  return requireServerSuccess(response.data).data
}
export async function previewMail(input: MailInput): Promise<string> {
  const response = await api.post<Response<{ html: string }>>(
    `${path}/preview`,
    input
  )
  return requireServerSuccess(response.data).data.html
}
export async function createMailDraft(input: MailInput): Promise<MailCampaign> {
  const response = await api.post<Response<MailCampaign>>(path, input)
  return requireServerSuccess(response.data).data
}
export async function updateMailDraft(
  id: number,
  input: MailInput
): Promise<MailCampaign> {
  const response = await api.put<Response<MailCampaign>>(`${path}/${id}`, input)
  return requireServerSuccess(response.data).data
}
export async function changeMailState(
  id: number,
  action: 'send' | 'cancel'
): Promise<void> {
  const response = await api.post<Response<unknown>>(`${path}/${id}/${action}`)
  requireServerSuccess(response.data)
}

export async function scheduleMail(id: number, sendAt: number): Promise<void> {
  const response = await api.post<Response<unknown>>(`${path}/${id}/schedule`, {
    send_at: sendAt,
  })
  requireServerSuccess(response.data)
}

export async function uploadMailImage(
  file: File
): Promise<{ name: string; html: string; url: string }> {
  const data = new FormData()
  data.append('file', file)
  const response = await api.post<
    Response<{ name: string; html: string; url: string }>
  >(`${path}/images`, data)
  return requireServerSuccess(response.data).data
}
