import type { SoftwareEntry, SoftwareFeaturedConfig } from './types'

export function resolveSoftwareFeatured(
  entries: SoftwareEntry[],
  config?: SoftwareFeaturedConfig
) {
  const published = entries.filter((entry) => entry.published)
  const defaults = {
    carousel: published.slice(0, 5).map((entry) => entry.id),
    tiles: published.slice(1, 4).map((entry) => entry.id),
  }
  const selection = config ?? defaults
  const byId = new Map(published.map((entry) => [entry.id, entry]))
  return {
    carousel: [...new Set(selection.carousel)]
      .slice(0, 5)
      .flatMap((id) => byId.get(id) ?? []),
    tiles: [...new Set(selection.tiles)]
      .slice(0, 3)
      .flatMap((id) => byId.get(id) ?? []),
  }
}
