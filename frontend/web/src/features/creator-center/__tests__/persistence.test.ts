import { beforeEach, expect, test, vi } from 'vitest'

import { useCreatorStore } from '@/stores/creator-store'

import { creatorRequest } from '../api'
import { publicShowcaseWorks, randomRelatedWorks } from '../lib/showcase'
import { defaultSettings, emptyWork } from '../types'

vi.mock('../api', () => ({ creatorRequest: vi.fn() }))
beforeEach(() => {
  vi.mocked(creatorRequest).mockReset()
  useCreatorStore.setState({ works: [], published: [] })
})
test('a failed server save leaves the work unsaved for retry', async () => {
  vi.mocked(creatorRequest).mockRejectedValueOnce(new Error('offline'))
  await expect(useCreatorStore.getState().save(emptyWork())).rejects.toThrow(
    'offline'
  )
  expect(useCreatorStore.getState().works).toEqual([])
})
test('save keeps the server revision and authoritative author for subsequent edits', async () => {
  const input = emptyWork()
  vi.mocked(creatorRequest).mockResolvedValueOnce({
    ...input,
    revision: 'server-revision',
    author: 'Server author',
  })
  await useCreatorStore.getState().save(input)
  expect(useCreatorStore.getState().works[0]).toMatchObject({
    revision: 'server-revision',
    author: 'Server author',
  })
})
test('public collection includes approved projects while excluding drafts and review submissions', () => {
  const work = emptyWork()
  expect(
    publicShowcaseWorks([
      { ...work, id: 'published', status: 'published' },
      { ...work, id: 'review', status: 'review' },
      { ...work, id: 'draft', status: 'draft' },
      { ...work, id: 'sample', status: 'published', sample: true },
      {
        ...work,
        id: 'unlisted',
        status: 'published',
        settings: { ...defaultSettings(), listed: false },
      },
    ]).map((w) => w.id)
  ).toEqual(['published'])
})

test('related projects draw only unique real public works and exclude the current project', () => {
  const work = { ...emptyWork(), status: 'published' as const }
  const eligible = ['a', 'b', 'c', 'd'].map((id) => ({ ...work, id }))
  const input = [
    ...eligible,
    eligible[0],
    { ...work, id: 'current' },
    { ...work, id: 'sample', sample: true },
    { ...work, id: 'draft', status: 'draft' as const },
    { ...work, id: 'review', status: 'review' as const },
    {
      ...work,
      id: 'hidden',
      settings: { ...defaultSettings(), listed: false },
    },
  ]
  const original = input.map((item) => item.id)
  const random = vi.spyOn(Math, 'random').mockReturnValue(0)
  try {
    const first = randomRelatedWorks(input, 'current').map((item) => item.id)
    random.mockReturnValue(0.99)
    const next = randomRelatedWorks(input, 'current').map((item) => item.id)
    expect(first).toHaveLength(3)
    expect(new Set(first).size).toBe(3)
    expect(first.every((id) => ['a', 'b', 'c', 'd'].includes(id))).toBe(true)
    expect(next).not.toEqual(first)
    expect(input.map((item) => item.id)).toEqual(original)
    expect(randomRelatedWorks([work], work.id)).toEqual([])
    expect(randomRelatedWorks([{ ...work, sample: true }], 'current')).toEqual(
      []
    )
    expect(randomRelatedWorks([eligible[0], eligible[0]], 'current')).toEqual([
      eligible[0],
    ])
  } finally {
    random.mockRestore()
  }
})
