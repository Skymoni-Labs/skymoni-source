import type { Work } from '../types'

// Public recommendations use approved, listed projects only, never demo data.
export function publicShowcaseWorks(works: Work[]): Work[] {
  return works.filter(
    (work) =>
      !work.sample &&
      work.status === 'published' &&
      work.settings?.listed !== false
  )
}

export function randomRelatedWorks(works: Work[], currentId: string): Work[] {
  const seen = new Set([currentId])
  const eligible = publicShowcaseWorks(works).filter((work) => {
    if (seen.has(work.id)) return false
    seen.add(work.id)
    return true
  })
  for (let index = eligible.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[eligible[index], eligible[other]] = [eligible[other], eligible[index]]
  }
  return eligible.slice(0, 3)
}

export const showcaseTopics = [
  {
    label: 'Make a corner of the web',
    note: 'Personal websites and small web apps',
    category: 'website',
    icon: 'Globe',
  },
  {
    label: 'Make everyday work easier',
    note: 'Useful software and practical tools',
    category: 'software',
    icon: 'AppWindow',
  },
  {
    label: 'Collect a little beauty',
    note: 'Interfaces, illustrations and resources',
    category: 'design',
    icon: 'Palette',
  },
  {
    label: 'Try a different approach',
    note: 'AI experiments and reusable workflows',
    category: 'workflow',
    icon: 'Workflow',
  },
] as const
