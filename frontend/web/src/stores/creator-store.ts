import { create } from 'zustand'

import { creatorRequest, type CreatorMe } from '@/features/creator-center/api'
import type { ShowcaseLayout } from '@/features/creator-center/lib/showcase-layout'
import type { Work } from '@/features/creator-center/types'

type CreatorStore = {
  works: Work[]
  published: Work[]
  showcase: ShowcaseLayout | null
  saved: string[]
  files: { id: string; name: string; size: number }[]
  hydrate: (me: CreatorMe | null) => void
  save: (work: Work) => Promise<Work>
  remove: (id: string) => Promise<void>
  toggleSaved: (id: string) => void
}
function restoreSaved(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem('skymoni-creator-bookmarks-v1') ?? '[]'
    )
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 500)
    }
  } catch {
    /* Optional local bookmarks. */
  }
  return []
}
export const useCreatorStore = create<CreatorStore>((set, get) => ({
  works: [],
  published: [],
  showcase: null,
  files: [],
  saved: restoreSaved(),
  hydrate: (me) => set({ works: me?.works ?? [], files: me?.files ?? [] }),
  save: async (work) => {
    const saved = await creatorRequest<Work>(
      `/me/works/${encodeURIComponent(work.id)}`,
      { method: 'put', data: work }
    )
    set({
      works: [saved, ...get().works.filter((item) => item.id !== saved.id)],
      published:
        saved.status === 'published' && saved.settings?.listed !== false
          ? [saved, ...get().published.filter((item) => item.id !== saved.id)]
          : get().published.filter((item) => item.id !== saved.id),
    })
    return saved
  },
  remove: async (id) => {
    const work = get().works.find((item) => item.id === id)
    await creatorRequest(`/me/works/${encodeURIComponent(id)}`, {
      method: 'delete',
      data: { revision: work?.revision },
    })
    set({ works: get().works.filter((item) => item.id !== id) })
  },
  toggleSaved: (id) => {
    const saved = get().saved.includes(id)
      ? get().saved.filter((item) => item !== id)
      : [...get().saved, id].slice(-500)
    localStorage.setItem('skymoni-creator-bookmarks-v1', JSON.stringify(saved))
    set({ saved })
  },
}))
