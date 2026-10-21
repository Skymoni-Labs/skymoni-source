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
import { useCallback, useEffect, useRef, useState } from 'react'

import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import { STORAGE_KEYS } from '../constants'
import {
  createPlaygroundConversation,
  deletePlaygroundConversation,
  getPlaygroundConversation,
  listPlaygroundConversations,
  renamePlaygroundConversation,
  savePlaygroundConversation,
  type PlaygroundConversationSummary,
} from '../conversations-api'
import { loadMessages } from '../lib'
import { messagesSchema } from '../lib/storage/storage-schema'
import type { Message, PlaygroundConfig } from '../types'

const SAVE_DELAY_MS = 900

type LocalDraft = {
  id: number
  revision: number
  model: string
  group: string
  messages: Message[]
}

function titleFromMessages(messages: Message[]): string {
  const first = messages.find((message) => message.from === 'user')
  const content = first?.versions.at(-1)?.content.trim().replaceAll(/\s+/g, ' ')
  return content ? content.slice(0, 70) : 'New chat'
}

function conversationSignature(
  messages: Message[],
  model: string,
  group: string
): string {
  return JSON.stringify({ messages, model, group })
}

function draftKey(userID: number): string {
  return `playground_conversation_draft_${userID}`
}

function readDraft(userID: number): LocalDraft | null {
  try {
    const saved = localStorage.getItem(draftKey(userID))
    if (!saved || saved.length > 512 * 1024) return null
    const parsed = JSON.parse(saved) as LocalDraft
    if (
      !parsed ||
      !Number.isInteger(parsed.id) ||
      !Number.isInteger(parsed.revision) ||
      typeof parsed.model !== 'string' ||
      typeof parsed.group !== 'string' ||
      !messagesSchema.safeParse(parsed.messages).success
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

type HistoryOptions = {
  messages: Message[]
  replaceMessages: (messages: Message[]) => void
  setIsLoadingMessages: (loading: boolean) => void
  config: PlaygroundConfig
  updateConfig: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  isGenerating: boolean
}

export function usePlaygroundHistory(options: HistoryOptions) {
  const userID = useAuthStore((state) => state.auth.user?.id)
  const [conversations, setConversations] = useState<
    PlaygroundConversationSummary[]
  >([])
  const [activeID, setActiveID] = useState<number | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [recoverableDraft, setRecoverableDraft] = useState<LocalDraft | null>(
    null
  )
  const [hasLegacyConversation, setHasLegacyConversation] = useState(false)

  const activeIDRef = useRef<number | null>(null)
  const userIDRef = useRef(userID)
  const revisionRef = useRef(0)
  const lastSavedRef = useRef('')
  const latestMessagesRef = useRef(options.messages)
  const latestConfigRef = useRef(options.config)
  const saveTimerRef = useRef<number | null>(null)
  const savingRef = useRef<Promise<void> | null>(null)
  const creatingRef = useRef<Promise<boolean> | null>(null)

  latestMessagesRef.current = options.messages
  latestConfigRef.current = options.config
  userIDRef.current = userID

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  const flushSave = useCallback(async (): Promise<void> => {
    clearSaveTimer()
    if (savingRef.current) {
      await savingRef.current
    }
    const id = activeIDRef.current
    if (!id) return
    const { model, group } = latestConfigRef.current
    const messages = latestMessagesRef.current
    const signature = conversationSignature(messages, model, group)
    if (signature === lastSavedRef.current) return
    const revision = revisionRef.current
    const save = savePlaygroundConversation(id, {
      revision,
      model,
      group,
      messages,
    })
      .then((saved) => {
        if (activeIDRef.current !== id) return
        revisionRef.current = saved.revision
        lastSavedRef.current = signature
        setSaveError(false)
        setConversations((current) =>
          current
            .map((item) => (item.id === id ? saved : item))
            .sort((a, b) => b.updated_at - a.updated_at || b.id - a.id)
        )
        if (
          userID &&
          conversationSignature(
            latestMessagesRef.current,
            latestConfigRef.current.model,
            latestConfigRef.current.group
          ) === signature
        ) {
          localStorage.removeItem(draftKey(userID))
        }
      })
      .catch((error: unknown) => {
        setSaveError(true)
        throw error
      })
      .finally(() => {
        savingRef.current = null
      })
    savingRef.current = save
    await save
    if (
      activeIDRef.current === id &&
      conversationSignature(
        latestMessagesRef.current,
        latestConfigRef.current.model,
        latestConfigRef.current.group
      ) !== lastSavedRef.current
    ) {
      await flushSave()
    }
  }, [clearSaveTimer, userID])

  useEffect(() => {
    let cancelled = false
    activeIDRef.current = null
    revisionRef.current = 0
    lastSavedRef.current = ''
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveID(null)
    setConversations([])
    setRecoverableDraft(null)
    setSaveError(false)
    options.replaceMessages([])
    if (!userID) {
      options.setIsLoadingMessages(false)
      return
    }
    options.setIsLoadingMessages(true)
    void listPlaygroundConversations()
      .then(async (items) => {
        if (cancelled) return
        setConversations(items)
        setHasLegacyConversation((loadMessages()?.length ?? 0) > 0)
        if (items.length === 0) {
          options.replaceMessages([])
          return
        }
        const draft = readDraft(userID)
        const initial = items.find((item) => item.id === draft?.id) ?? items[0]
        const selected = await getPlaygroundConversation(initial.id)
        if (cancelled) return
        activeIDRef.current = selected.id
        revisionRef.current = selected.revision
        lastSavedRef.current = conversationSignature(
          selected.messages,
          selected.model,
          selected.group
        )
        options.replaceMessages(selected.messages)
        options.updateConfig('model', selected.model)
        options.updateConfig('group', selected.group)
        setActiveID(selected.id)
        if (draft?.id === selected.id) {
          const draftSignature = conversationSignature(
            draft.messages,
            draft.model,
            draft.group
          )
          if (draftSignature !== lastSavedRef.current) {
            setRecoverableDraft(draft)
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) handleServerError(error)
      })
      .finally(() => {
        if (!cancelled) options.setIsLoadingMessages(false)
      })
    return () => {
      cancelled = true
      clearSaveTimer()
      if (activeIDRef.current) {
        void flushSave().catch(() => undefined)
      }
    }
    // This initialization runs only when the authenticated account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userID])

  useEffect(() => {
    const id = activeIDRef.current
    if (!userID || !id || isBusy) return
    const signature = conversationSignature(
      options.messages,
      options.config.model,
      options.config.group
    )
    if (signature === lastSavedRef.current) return
    try {
      localStorage.setItem(
        draftKey(userID),
        JSON.stringify({
          id,
          revision: revisionRef.current,
          model: options.config.model,
          group: options.config.group,
          messages: options.messages,
        } satisfies LocalDraft)
      )
    } catch {
      // Server autosave remains authoritative when local storage is full.
    }
    clearSaveTimer()
    saveTimerRef.current = window.setTimeout(() => {
      void flushSave().catch(() => undefined)
    }, SAVE_DELAY_MS)
  }, [
    userID,
    activeID,
    isBusy,
    options.messages,
    options.config.model,
    options.config.group,
    clearSaveTimer,
    flushSave,
  ])

  const ensureConversation = useCallback(
    (nextMessages: Message[]): Promise<boolean> => {
      if (!userID) return Promise.resolve(false)
      if (activeIDRef.current) return Promise.resolve(true)
      if (creatingRef.current) return creatingRef.current
      setIsBusy(true)
      const create = createPlaygroundConversation({
        title: titleFromMessages(nextMessages),
        model: latestConfigRef.current.model,
        group: latestConfigRef.current.group,
        messages: nextMessages,
      })
        .then((created) => {
          if (userIDRef.current !== userID) return false
          activeIDRef.current = created.id
          revisionRef.current = created.revision
          lastSavedRef.current = conversationSignature(
            nextMessages,
            created.model,
            created.group
          )
          setConversations((current) => [created, ...current])
          setActiveID(created.id)
          return true
        })
        .catch((error: unknown) => {
          if (userIDRef.current === userID) handleServerError(error)
          return false
        })
        .finally(() => {
          creatingRef.current = null
          setIsBusy(false)
        })
      creatingRef.current = create
      return create
    },
    [userID]
  )

  const selectConversation = useCallback(
    async (id: number | null): Promise<void> => {
      if (options.isGenerating || isBusy || id === activeIDRef.current) return
      setIsBusy(true)
      try {
        await flushSave()
        if (userIDRef.current !== userID) return
        if (id === null) {
          activeIDRef.current = null
          revisionRef.current = 0
          lastSavedRef.current = ''
          setActiveID(null)
          options.replaceMessages([])
          setRecoverableDraft(null)
          return
        }
        const selected = await getPlaygroundConversation(id)
        if (userIDRef.current !== userID) return
        activeIDRef.current = selected.id
        revisionRef.current = selected.revision
        lastSavedRef.current = conversationSignature(
          selected.messages,
          selected.model,
          selected.group
        )
        options.replaceMessages(selected.messages)
        options.updateConfig('model', selected.model)
        options.updateConfig('group', selected.group)
        setActiveID(selected.id)
        setRecoverableDraft(null)
      } catch (error) {
        handleServerError(error)
      } finally {
        setIsBusy(false)
      }
    },
    [flushSave, isBusy, options, userID]
  )

  const renameConversation = useCallback(
    async (id: number, title: string) => {
      try {
        const renamed = await renamePlaygroundConversation(id, title.trim())
        if (userIDRef.current !== userID) return
        setConversations((current) =>
          current.map((item) => (item.id === id ? renamed : item))
        )
      } catch (error) {
        if (userIDRef.current === userID) handleServerError(error)
      }
    },
    [userID]
  )

  const deleteConversation = useCallback(
    async (id: number) => {
      if (options.isGenerating) return
      setIsBusy(true)
      try {
        if (id === activeIDRef.current) {
          clearSaveTimer()
          if (savingRef.current) await savingRef.current
        } else {
          await flushSave()
        }
        if (userIDRef.current !== userID) return
        await deletePlaygroundConversation(id)
        if (userIDRef.current !== userID) return
        setConversations((current) => current.filter((item) => item.id !== id))
        if (activeIDRef.current === id) {
          activeIDRef.current = null
          revisionRef.current = 0
          lastSavedRef.current = ''
          setActiveID(null)
          options.replaceMessages([])
          if (userID) localStorage.removeItem(draftKey(userID))
        }
      } catch (error) {
        handleServerError(error)
      } finally {
        setIsBusy(false)
      }
    },
    [clearSaveTimer, flushSave, options, userID]
  )

  const importLegacyConversation = useCallback(async () => {
    const messages = loadMessages()
    if (!messages?.length) {
      setHasLegacyConversation(false)
      return
    }
    setIsBusy(true)
    try {
      await flushSave()
      if (userIDRef.current !== userID) return
      const imported = await createPlaygroundConversation({
        title: titleFromMessages(messages),
        model: latestConfigRef.current.model,
        group: latestConfigRef.current.group,
        messages,
      })
      if (userIDRef.current !== userID) return
      activeIDRef.current = imported.id
      revisionRef.current = imported.revision
      lastSavedRef.current = conversationSignature(
        messages,
        imported.model,
        imported.group
      )
      setConversations((current) => [imported, ...current])
      setActiveID(imported.id)
      options.replaceMessages(messages)
      localStorage.removeItem(STORAGE_KEYS.MESSAGES)
      setHasLegacyConversation(false)
    } catch (error) {
      handleServerError(error)
    } finally {
      setIsBusy(false)
    }
  }, [flushSave, options, userID])

  const restoreDraft = useCallback(() => {
    if (!recoverableDraft || recoverableDraft.id !== activeIDRef.current) return
    options.replaceMessages(recoverableDraft.messages)
    options.updateConfig('model', recoverableDraft.model)
    options.updateConfig('group', recoverableDraft.group)
    setRecoverableDraft(null)
  }, [options, recoverableDraft])

  return {
    conversations,
    activeID,
    isBusy,
    saveError,
    recoverableDraft,
    hasLegacyConversation,
    ensureConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    importLegacyConversation,
    restoreDraft,
    retrySave: flushSave,
  }
}
