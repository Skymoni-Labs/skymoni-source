import type { Work } from '../types'
import type { CreatorProfile, CreatorRelease } from './hub'

export type ReviewCatalog = {
  reviewPolicy?: { autoApproveWorks: boolean; revision: string }
  works: Work[]
  releases: CreatorRelease[]
  members?: Record<string, { profile: CreatorProfile }>
}
export type ReviewStatus = 'review' | 'published' | 'returned'
export type ReviewItem = {
  key: string
  kind: 'work' | 'release'
  id: string
  revision?: string
  title: string
  author: string
  handle: string
  ownerId?: number
  status: ReviewStatus
  updatedAt: number
  summary: string
  reviewNote?: string
  work?: Work
  release?: CreatorRelease
}
export type ReviewDecision = 'approve' | 'reject' | 'unpublish'

export function reviewItems(catalog: ReviewCatalog): ReviewItem[] {
  const projects = new Map(catalog.works.map((work) => [work.id, work]))
  const items: ReviewItem[] = []
  for (const content of [...catalog.works, ...catalog.releases]) {
    if (content.status === 'draft' && !content.reviewNote) continue
    const work =
      'projectId' in content ? projects.get(content.projectId) : content
    const release = 'projectId' in content ? content : undefined
    const kind = release ? 'release' : 'work'
    const ownerId = work?.ownerId
    const profile = catalog.members?.[String(ownerId)]?.profile
    items.push({
      key: `${kind}-${content.id}`,
      kind,
      id: content.id,
      revision: content.revision,
      title: release
        ? `${work?.title ?? release.projectId} · ${release.version} · ${release.platform}`
        : (work?.title ?? content.id),
      author: profile?.name || work?.author || '',
      handle: profile?.handle || '',
      ownerId,
      status: content.status === 'draft' ? 'returned' : content.status,
      updatedAt: content.updatedAt,
      summary: release?.notes ?? work?.summary ?? '',
      reviewNote: content.reviewNote,
      work,
      release,
    })
  }
  return items
}

export function filterReviewItems(
  items: ReviewItem[],
  filter: { status: string; kind: string; search: string }
): ReviewItem[] {
  const search = filter.search.trim().toLocaleLowerCase()
  return items.filter(
    (item) =>
      (filter.status === 'all' || item.status === filter.status) &&
      (filter.kind === 'all' || item.kind === filter.kind) &&
      (!search ||
        [
          item.title,
          item.author,
          item.handle,
          item.ownerId,
          item.id,
          item.summary,
          item.reviewNote,
          item.work?.tags,
        ].some((value) =>
          String(value ?? '')
            .toLocaleLowerCase()
            .includes(search)
        ))
  )
}

export function canReview(item: ReviewItem, decision: ReviewDecision): boolean {
  if (decision === 'unpublish') return item.status === 'published'
  return item.status === 'review'
}
