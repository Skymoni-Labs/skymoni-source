import type { SoftwareEntry } from './types'

export type CatalogFilters = {
  kind: 'all' | SoftwareEntry['kind']
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

export function softwareTopic(entry: SoftwareEntry): string {
  return `category:${entry.details?.category?.trim() || ''}`
}
