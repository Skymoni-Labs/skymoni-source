import type { Work } from '../types'

export type ShowcaseLayout = {
  enabled: boolean
  dailyRandom?: boolean
  rotationDate?: string
  spotlightIds: [string, string, string]
  orderedIds: string[]
  revision?: string
}
export type ShowcaseAdminData = {
  config: ShowcaseLayout
  dailyPreview?: ShowcaseLayout
  works: Work[]
}
export const defaultShowcaseLayout = (): ShowcaseLayout => ({
  enabled: true,
  spotlightIds: ['', '', ''],
  orderedIds: [],
})

export function orderedShowcaseWorks(works: Work[], ids: string[]): Work[] {
  const remaining = new Map(works.map((work) => [work.id, work]))
  const result: Work[] = []
  for (const id of ids) {
    const work = remaining.get(id)
    if (work) {
      result.push(work)
      remaining.delete(id)
    }
  }
  return [...result, ...remaining.values()]
}

export function showcaseSlots(works: Work[], layout: ShowcaseLayout) {
  const ordered = orderedShowcaseWorks(works, layout.orderedIds)
  const available = new Map(ordered.map((work) => [work.id, work]))
  const used = new Set<string>()
  const slots = layout.spotlightIds.map((id) => {
    const work = available.get(id)
    if (!work || used.has(id)) return undefined
    used.add(id)
    return work
  })
  const filled = slots.map((work) => {
    if (work) return work
    const next = ordered.find((candidate) => !used.has(candidate.id))
    if (next) used.add(next.id)
    return next
  })
  if (!filled[0]) {
    const first = filled.findIndex(Boolean)
    if (first > 0) {
      filled[0] = filled[first]
      filled[first] = undefined
    }
  }
  return filled
}

export function cleanShowcaseLayout(layout: ShowcaseLayout, works: Work[]) {
  const available = new Set(works.map((work) => work.id))
  return {
    ...layout,
    spotlightIds: layout.spotlightIds.map((id) =>
      available.has(id) ? id : ''
    ) as ShowcaseLayout['spotlightIds'],
    orderedIds: layout.orderedIds.filter((id) => available.has(id)),
  }
}
