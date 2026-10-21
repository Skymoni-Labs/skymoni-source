import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../constants'
import type { Message } from '../../types'
import { buildChatCompletionPayload } from './payload-builder'

describe('playground without system prompts', () => {
  for (const stream of [true, false]) {
    it(`omits saved system instructions and preserves conversation (stream=${stream})`, () => {
      const messages: Message[] = [
        { key: 'system', from: 'system', versions: [{ id: '1', content: 'Old saved instructions' }] },
        { key: 'user', from: 'user', versions: [{ id: '2', content: 'First question' }] },
        { key: 'assistant', from: 'assistant', versions: [{ id: '3', content: 'First answer' }] },
        { key: 'system2', from: 'system', versions: [{ id: '4', content: 'Another old instruction' }] },
        { key: 'user2', from: 'user', versions: [{ id: '5', content: 'Next question' }] },
      ]
      const payload = buildChatCompletionPayload(messages, { ...DEFAULT_CONFIG, stream }, DEFAULT_PARAMETER_ENABLED)
      expect(payload.messages).toEqual([
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Next question' },
      ])
      expect(payload.stream).toBe(stream)
      expect(buildChatCompletionPayload(messages, { ...DEFAULT_CONFIG, model: 'deepseek-v4.1-flash-low' }, DEFAULT_PARAMETER_ENABLED).model).toBe('deepseek-v4.1-flash-low')
      expect(messages).toHaveLength(5)
      expect(messages[0].versions[0].content).toBe('Old saved instructions')
    })
  }
})
