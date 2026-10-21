import type { HomeShowcase, PublicCreatorHome } from '../home-api'
import type { Work } from '../types'
import { publicShowcaseWorks } from './showcase'

export function selectedHomepageWorks(works: Work[], selection?: HomeShowcase): Work[] {
  const available = publicShowcaseWorks(works)
  if (!selection) return available
  const choices = new Map(selection.works.map((item) => [item.workId, item]))
  return available
    .filter((work) => choices.get(work.id)?.enabled ?? selection.autoAddWorks)
    .sort((a, b) => (choices.get(a.id)?.position ?? 100001) - (choices.get(b.id)?.position ?? 100001))
}
export function homepageWorks(data?: PublicCreatorHome, catalogue: Work[] = []): Work[] {
  if (!data || !data.config.galleryEnabled) return []
  const placements = selectedHomepageWorks(data.works, data.showcase)
  if (placements.length) return placements
  return selectedHomepageWorks(catalogue, data.showcase)
}
