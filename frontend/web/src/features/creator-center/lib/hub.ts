import { z } from 'zod'

import type { Work } from '../types'
import { isSafeProjectUrl } from './schema'

const optionalUrl = z
  .string()
  .max(2000)
  .refine((value) => !value || isSafeProjectUrl(value))
export const creatorProfileSchema = z.object({
  name: z.string().trim().min(1).max(20),
  handle: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/),
  bio: z.string().max(180),
  website: optionalUrl,
  introduction: z.string().max(4000),
  avatar: z
    .string()
    .max(180000)
    .regex(/^(?:|data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+)$/)
    .optional(),
})
export type CreatorProfile = z.infer<typeof creatorProfileSchema>
export const defaultCreatorProfile: CreatorProfile = {
  name: '',
  handle: 'my-creative-space',
  bio: '',
  website: '',
  introduction: '',
}
export const releaseSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    version: z.string().trim().min(1).max(40),
    platform: z.enum(['Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Web']),
    downloadUrl: optionalUrl,
    package: z
      .object({ id: z.string(), name: z.string(), size: z.number().positive() })
      .optional(),
    notes: z.string().trim().min(8).max(4000),
    provenance: z.enum(['original', 'authorized', 'open-source']),
    license: z.string().max(120),
    sourceUrl: optionalUrl,
    storeUrl: optionalUrl,
    revision: z.string().optional(),
    reviewNote: z.string().optional(),
    status: z.enum(['draft', 'review', 'published']),
    updatedAt: z.number(),
  })
  .refine((value) => Boolean(value.downloadUrl || value.package), {
    path: ['downloadUrl'],
  })
export type CreatorRelease = z.infer<typeof releaseSchema>
export function emptyRelease(): CreatorRelease {
  return {
    id: crypto.randomUUID(),
    projectId: '',
    version: '',
    platform: 'Windows',
    downloadUrl: '',
    notes: '',
    provenance: 'original',
    license: '',
    sourceUrl: '',
    storeUrl: '',
    status: 'draft',
    updatedAt: Date.now(),
  }
}
export function validateOwnRelease(
  release: CreatorRelease,
  ownWorks: Work[],
  existing: CreatorRelease[]
): CreatorRelease {
  const parsed = releaseSchema.parse(release)
  if (
    !ownWorks.some(
      (work) =>
        work.id === parsed.projectId &&
        work.category === 'software' &&
        !work.sample
    )
  ) {
    throw new Error('Choose one of your own software projects')
  }
  if (
    existing.some(
      (item) =>
        item.id !== parsed.id &&
        item.projectId === parsed.projectId &&
        item.version === parsed.version &&
        item.platform === parsed.platform
    )
  ) {
    throw new Error('This version and platform already have a submission')
  }
  return parsed
}

export type ProjectFilter = {
  search: string
  category: string
  source: string
  linked: boolean
  attached: boolean
  sort: string
}
export function filterProjects(
  works: Work[],
  filter: ProjectFilter,
  translate: (key: string) => string
): Work[] {
  const term = filter.search.trim().toLocaleLowerCase()
  const result = works.filter((work) => {
    const text = [
      work.title,
      work.summary,
      work.tags,
      work.author,
      work.settings?.categoryName ?? '',
    ]
    if (work.sample) text.push(translate(work.title), translate(work.summary))
    return (
      work.settings?.listed !== false &&
      (filter.category === 'all' || work.category === filter.category) &&
      (filter.source !== 'local' || !work.sample) &&
      (filter.source !== 'examples' || work.sample) &&
      (!filter.linked || isSafeProjectUrl(work.url)) &&
      (!filter.attached || Boolean(work.attachment)) &&
      (!term || text.some((value) => value.toLocaleLowerCase().includes(term)))
    )
  })
  if (filter.sort === 'recent') result.sort((a, b) => b.updatedAt - a.updatedAt)
  if (filter.sort === 'title') {
    result.sort((a, b) =>
      (a.sample ? translate(a.title) : a.title).localeCompare(
        b.sample ? translate(b.title) : b.title
      )
    )
  }
  return result
}
