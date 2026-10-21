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
import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import {
  createPlaygroundConversation,
  getPlaygroundConversation,
  listPlaygroundConversations,
  savePlaygroundConversation,
} from '../../conversations-api'
import type { Message, PlaygroundConfig } from '../../types'
import { usePlaygroundHistory } from '../use-playground-history'

vi.mock('../../conversations-api', () => ({
  createPlaygroundConversation: vi.fn(),
  deletePlaygroundConversation: vi.fn(),
  getPlaygroundConversation: vi.fn(),
  listPlaygroundConversations: vi.fn(),
  renamePlaygroundConversation: vi.fn(),
  savePlaygroundConversation: vi.fn(),
}))

const firstMessage: Message = {
  key: 'first',
  from: 'user',
  versions: [{ id: 'v1', content: 'First question' }],
}
const changedMessage: Message = {
  key: 'first',
  from: 'user',
  versions: [{ id: 'v1', content: 'Changed question' }],
}
const secondMessage: Message = {
  key: 'second',
  from: 'user',
  versions: [{ id: 'v2', content: 'Second question' }],
}

function conversation(id: number, messages: Message[], revision = 1) {
  return {
    id,
    title: id === 1 ? 'First' : 'Second',
    model: 'test-model',
    group: 'default',
    messages,
    revision,
    created_at: id,
    updated_at: id,
  }
}

function useHistoryHarness() {
  const [messages, replaceMessages] = useState<Message[]>([])
  const [loading, setIsLoadingMessages] = useState(true)
  const [config, setConfig] = useState<PlaygroundConfig>({
    model: 'test-model',
    group: 'default',
    temperature: 1,
    top_p: 1,
    max_tokens: 1024,
    frequency_penalty: 0,
    presence_penalty: 0,
    seed: null,
    stream: true,
  })
  const updateConfig = <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => setConfig((current) => ({ ...current, [key]: value }))
  const history = usePlaygroundHistory({
    messages,
    replaceMessages,
    setIsLoadingMessages,
    config,
    updateConfig,
    isGenerating: false,
  })
  return { history, messages, loading, replaceMessages }
}

afterEach(() => {
  useAuthStore.getState().auth.setUser(null)
  localStorage.clear()
  vi.clearAllMocks()
})

it('saves an edited conversation before opening another one', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'owner', role: 1 })
  vi.mocked(listPlaygroundConversations).mockResolvedValue([
    conversation(2, [secondMessage]),
    conversation(1, [firstMessage]),
  ])
  vi.mocked(getPlaygroundConversation).mockImplementation(async (id) =>
    id === 2
      ? conversation(2, [secondMessage])
      : conversation(1, [firstMessage])
  )
  vi.mocked(savePlaygroundConversation).mockResolvedValue(
    conversation(2, [changedMessage], 2)
  )

  const { result } = renderHook(useHistoryHarness)
  await waitFor(() => expect(result.current.history.activeID).toBe(2))
  act(() => result.current.replaceMessages([changedMessage]))
  await act(async () => result.current.history.selectConversation(1))

  expect(savePlaygroundConversation).toHaveBeenCalledWith(2, {
    revision: 1,
    model: 'test-model',
    group: 'default',
    messages: [changedMessage],
  })
  expect(result.current.history.activeID).toBe(1)
  expect(result.current.messages).toEqual([firstMessage])
})

it('clears the previous account conversation when the signed-in user changes', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'owner', role: 1 })
  vi.mocked(listPlaygroundConversations)
    .mockResolvedValueOnce([conversation(1, [firstMessage])])
    .mockResolvedValueOnce([])
  vi.mocked(getPlaygroundConversation).mockResolvedValue(
    conversation(1, [firstMessage])
  )

  const { result } = renderHook(useHistoryHarness)
  await waitFor(() => expect(result.current.history.activeID).toBe(1))
  act(() => {
    useAuthStore.getState().auth.setUser({ id: 2, username: 'other', role: 1 })
  })
  await waitFor(() => expect(result.current.loading).toBe(false))

  expect(result.current.history.activeID).toBeNull()
  expect(result.current.messages).toEqual([])
  expect(result.current.history.conversations).toEqual([])
})

it('ignores a conversation created for an account that has signed out', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'owner', role: 1 })
  vi.mocked(listPlaygroundConversations).mockResolvedValue([])
  let completeCreate!: (value: ReturnType<typeof conversation>) => void
  vi.mocked(createPlaygroundConversation).mockReturnValue(
    new Promise((resolve) => {
      completeCreate = resolve
    })
  )

  const { result } = renderHook(useHistoryHarness)
  await waitFor(() => expect(result.current.loading).toBe(false))
  let created!: Promise<boolean>
  act(() => {
    created = result.current.history.ensureConversation([firstMessage])
  })
  act(() => {
    useAuthStore.getState().auth.setUser({ id: 2, username: 'other', role: 1 })
  })
  await act(async () => {
    completeCreate(conversation(1, [firstMessage]))
    expect(await created).toBe(false)
  })
  expect(result.current.history.activeID).toBeNull()
  expect(result.current.messages).toEqual([])
})
