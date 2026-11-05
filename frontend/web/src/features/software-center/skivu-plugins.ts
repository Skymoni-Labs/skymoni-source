import type { SoftwareDetails, SoftwareEntry } from './types'

export const skivuPluginPrefix = 'skivu-plugin-'
export const skivuPluginQueryKey = ['software', 'skivu-plugins'] as const
export const skivuPluginSources = [
  '/app-plugins/catalog/index.json',
  '/app-plugins/catalog/extensions.json',
  '/app-plugins/catalog/apps-v3.json',
] as const

export type SkivuPluginEntry = {
  kind: 'plugin'
  id: string
  pluginId: string
  name: string
  description: string
  platform: string
  version: string
  author: string
  license: string
  minHostVersion: string
  format: 'ui-preset' | 'skill' | 'mcp-http' | 'web-plugin'
  sourceUrl: string
  catalogUrl: string
  packageUrl: string
  packageBytes: number
  packageSha256: string
  permissions: string[]
  networkDomains: string[]
  details: SoftwareDetails
}

export type PublicCatalogEntry = SoftwareEntry | SkivuPluginEntry
export type SkivuPluginCatalog = {
  items: SkivuPluginEntry[]
  unavailableSources: string[]
  rejectedItems: number
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Skivu catalog record')
  }
  return value as Record<string, unknown>
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw new Error('Invalid Skivu catalog text')
  }
  return value.trim()
}

function httpsUrl(value: unknown): string {
  const raw = text(value, 2048)
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Invalid Skivu catalog URL')
  }
  return raw
}

function stringList(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 64) {
    throw new Error('Invalid Skivu catalog list')
  }
  return [...new Set(value.map((item) => text(item, 256)))]
}

export function skivuPluginCategory(entry: Pick<SkivuPluginEntry, 'format'>) {
  return {
    'ui-preset': 'Interface packs',
    skill: 'Content skills',
    'mcp-http': 'MCP tools',
    'web-plugin': 'Interactive plugins',
  }[entry.format]
}

function parseEntry(
  value: unknown,
  protocol: string,
  catalogUrl: string
): SkivuPluginEntry {
  const item = record(value)
  const manifest = protocol === '3.0' ? record(item.manifest) : item
  const pluginId = text(manifest.id, 160)
  if (!/^[a-z0-9][a-z0-9._-]+$/i.test(pluginId)) {
    throw new Error('Invalid Skivu plugin identity')
  }
  const format = protocol === '3.0' ? 'web-plugin' : manifest.kind
  if (
    (protocol === '1.0' && format !== 'ui-preset') ||
    (protocol === '2.0' && format !== 'skill' && format !== 'mcp-http')
  ) {
    throw new Error('Unsupported Skivu plugin format')
  }
  const minHostVersion = text(manifest.minHostVersion, 64)
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(minHostVersion)) {
    throw new Error('Invalid Skivu host version')
  }
  const pack = protocol === '3.0' ? item : record(item.package)
  const packageSource = new URL(httpsUrl(pack.url))
  if (
    packageSource.hostname !== 'raw.githubusercontent.com' ||
    !/^[a-f\d]{40}$/i.test(packageSource.pathname.split('/')[3] || '') ||
    packageSource.search ||
    packageSource.hash
  ) {
    throw new Error('Skivu package must have an immutable source')
  }
  const packageSha256 = text(pack.sha256, 64).toLowerCase()
  const packageBytes = pack.bytes
  if (
    !/^[a-f\d]{64}$/.test(packageSha256) ||
    typeof packageBytes !== 'number' ||
    !Number.isSafeInteger(packageBytes) ||
    packageBytes <= 0 ||
    packageBytes > 32 * 1024 * 1024
  ) {
    throw new Error('Invalid Skivu package metadata')
  }
  let source: unknown = manifest.source
  if (protocol !== '3.0') {
    source =
      typeof manifest.repository === 'string'
        ? manifest.repository
        : record(manifest.source).repository
  }
  const entry: SkivuPluginEntry = {
    kind: 'plugin',
    id: `${skivuPluginPrefix}${pluginId}`,
    pluginId,
    name: text(manifest.name, 160),
    description: text(manifest.description, 4000),
    platform: 'Android · Skivu',
    version: text(manifest.version, 64),
    author: text(manifest.author, 256),
    license: text(manifest.license, 128),
    minHostVersion,
    format: format as SkivuPluginEntry['format'],
    sourceUrl: httpsUrl(source),
    catalogUrl,
    packageUrl: `/app-plugins/${protocol === '3.0' ? 'web-packages' : 'packages'}/${packageSha256}.json`,
    packageBytes,
    packageSha256,
    permissions: stringList(manifest.permissions),
    networkDomains: stringList(manifest.networkDomains),
    details: {},
  }
  entry.details = {
    category: skivuPluginCategory(entry),
    publisher: entry.author,
    license: entry.license,
    requirements: `Skivu ${entry.minHostVersion}+ · Android`,
  }
  return entry
}

export function parseSkivuPluginCatalog(
  value: unknown,
  catalogUrl: string
): Pick<SkivuPluginCatalog, 'items' | 'rejectedItems'> {
  const catalog = record(value)
  const protocol = catalog.protocolVersion
  const expected = skivuPluginSources.indexOf(
    catalogUrl as (typeof skivuPluginSources)[number]
  )
  if (expected < 0 || protocol !== ['1.0', '2.0', '3.0'][expected]) {
    throw new Error('Unsupported Skivu catalog protocol')
  }
  const items = protocol === '3.0' ? catalog.packages : catalog.plugins
  if (!Array.isArray(items) || items.length > 1000) {
    throw new Error('Invalid Skivu catalog items')
  }
  const parsed: SkivuPluginEntry[] = []
  let rejectedItems = 0
  for (const item of items) {
    try {
      parsed.push(parseEntry(item, protocol, catalogUrl))
    } catch {
      rejectedItems++
    }
  }
  if (items.length && !parsed.length) {
    throw new Error('No valid Skivu catalog items')
  }
  return { items: parsed, rejectedItems }
}

async function fetchCatalog(path: string, signal?: AbortSignal) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  const timeout = setTimeout(cancel, 15_000)
  try {
    const response = await fetch(path, {
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-cache',
    })
    if (!response.ok) throw new Error('Skivu catalog unavailable')
    const raw = await response.text()
    if (raw.length > 4 * 1024 * 1024) {
      throw new Error('Skivu catalog too large')
    }
    return parseSkivuPluginCatalog(JSON.parse(raw), path)
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

export async function loadSkivuPlugins(
  signal?: AbortSignal
): Promise<SkivuPluginCatalog> {
  const results = await Promise.allSettled(
    skivuPluginSources.map((path) => fetchCatalog(path, signal))
  )
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const byId = new Map<string, SkivuPluginEntry>()
  const unavailableSources: string[] = []
  let rejectedItems = 0
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      unavailableSources.push(skivuPluginSources[index])
      return
    }
    rejectedItems += result.value.rejectedItems
    for (const entry of result.value.items) {
      if (!byId.has(entry.pluginId)) byId.set(entry.pluginId, entry)
    }
  })
  if (unavailableSources.length === skivuPluginSources.length) {
    throw new Error('Skivu plugin catalogs unavailable')
  }
  return { items: [...byId.values()], unavailableSources, rejectedItems }
}
