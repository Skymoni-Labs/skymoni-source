export type SoftwareEntry = {
  downloads?: SoftwareDownload[]
  details?: SoftwareDetails
  id: string
  kind: 'software' | 'tool'
  name: string
  description: string
  platform: string
  version: string
  downloadUrl: string
  filename: string
  detailUrl: string
  imageUrl: string
  appearance: 'generic' | 'drip' | 'mail' | 'cherry' | 'cc'
  sortOrder: number
  published: boolean
}

export type SoftwareDownload = {
  platform: string
  label: string
  url: string
  filename: string
  kind: 'installer' | 'website' | 'cloud'
  version?: string
}

export type SoftwareDetails = {
  overview?: string
  features?: string
  changelog?: string
  requirements?: string
  publisher?: string
  category?: string
  license?: string
  updatedAt?: string
  screenshots?: string[]
  screenshotsEnabled?: boolean
  imageLayout?: 'portrait' | 'landscape'
}

export type SoftwareFeaturedConfig = { carousel: string[]; tiles: string[] }
export type SoftwareCatalog = {
  revision: string
  items: SoftwareEntry[]
  featured?: SoftwareFeaturedConfig
}
export type SoftwareFile = {
  id: string
  url: string
  filename: string
  bytes: number
  sha256: string
}
export type SoftwareFiles = {
  items: SoftwareFile[]
  usedBytes: number
  limitBytes: number
  uploadLimitBytes: number
}
