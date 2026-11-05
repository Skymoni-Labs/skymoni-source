import type { PublicCatalogEntry } from './skivu-plugins'

export type CatalogFilters = {
  kind: 'all' | PublicCatalogEntry['kind']
  platform: string
  topic: string
  search: string
}

export const defaultCatalogFilters: CatalogFilters = {
  kind: 'all',
  platform: 'all',
  topic: 'all',
  search: '',
}

export function softwareTopic(entry: PublicCatalogEntry): string {
  return `category:${entry.details?.category?.trim() || ''}`
}
