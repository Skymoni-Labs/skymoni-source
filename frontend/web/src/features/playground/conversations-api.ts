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

import { sanitizeMessagesOnLoad } from './lib'
import { messagesSchema } from './lib/storage/storage-schema'
import type { Message } from './types'

export interface PlaygroundConversationSummary {
  id: number
  title: string
  model: string
  group: string
  revision: number
  created_at: number
  updated_at: number
}

export interface PlaygroundConversation extends PlaygroundConversationSummary {
  messages: Message[]
}

const path = '/api/user/self/playground-conversations'

export async function listPlaygroundConversations(): Promise<
  PlaygroundConversationSummary[]
> {
  const response = await api.get<{
    success: boolean
    data: PlaygroundConversationSummary[]
  }>(path)
  return requireServerSuccess(response.data).data
}

export async function getPlaygroundConversation(
  id: number
): Promise<PlaygroundConversation> {
  const response = await api.get<{
    success: boolean
    data: PlaygroundConversation
  }>(`${path}/${id}`)
  const conversation = requireServerSuccess(response.data).data
  return {
    ...conversation,
    messages: sanitizeMessagesOnLoad(
      messagesSchema.parse(conversation.messages)
    ),
  }
}

export async function createPlaygroundConversation(input: {
  title: string
  model: string
  group: string
  messages: Message[]
}): Promise<PlaygroundConversation> {
  const response = await api.post<{
    success: boolean
    data: PlaygroundConversation
  }>(path, input)
  return requireServerSuccess(response.data).data
}

export async function savePlaygroundConversation(
  id: number,
  input: {
    revision: number
    model: string
    group: string
    messages: Message[]
  }
): Promise<PlaygroundConversation> {
  const response = await api.put<{
    success: boolean
    data: PlaygroundConversation
  }>(`${path}/${id}`, input)
  return requireServerSuccess(response.data).data
}

export async function renamePlaygroundConversation(
  id: number,
  title: string
): Promise<PlaygroundConversation> {
  const response = await api.patch<{
    success: boolean
    data: PlaygroundConversation
  }>(`${path}/${id}`, { title })
  return requireServerSuccess(response.data).data
}

export async function deletePlaygroundConversation(id: number): Promise<void> {
  const response = await api.delete<{ success: boolean }>(`${path}/${id}`)
  requireServerSuccess(response.data)
}
