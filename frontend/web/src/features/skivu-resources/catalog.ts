export const skivuReleasePath =
  '/api/app-update/latest?platform=android&abi=arm64-v8a&version_code=0'
export const wallpaperCatalogPath = '/api/app-wallpapers'

export type SkivuRelease = {
  version: string
  versionCode: number
  url: string
  size: number
  sha256: string
  minSdk: number
  notes: string
}
export type ResourceWallpaper = {
  id: string
  name: string
  description: string
  url: string
  thumbnail: string
  sha256: string
  width: number
  height: number
  size: number
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid public resource')
  }
  return value as Record<string, unknown>
}
function text(value: unknown, limit: number) {
  if (typeof value !== 'string' || value.length > limit) {
    throw new Error('Invalid resource text')
  }
  return value
}
function number(value: unknown, min: number, max: number) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < min ||
    Number(value) > max
  ) {
    throw new Error('Invalid resource number')
  }
  return Number(value)
}
function digest(value: unknown) {
  const sha = text(value, 64)
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error('Invalid checksum')
  return sha
}
function firstPartyPath(value: unknown, pattern: RegExp) {
  const url = new URL(text(value, 500), 'https://skymoni.com')
  if (
    url.origin !== 'https://skymoni.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !pattern.test(url.pathname)
  ) {
    throw new Error('Invalid resource source')
  }
  return url.pathname
}

export function parseSkivuRelease(value: unknown): SkivuRelease {
  const response = record(value)
  const data = record(response.data)
  if (
    response.success !== true ||
    data.available !== true ||
    data.package_name !== 'com.skyjjgw.independent.ski' ||
    data.abi !== 'arm64-v8a'
  ) {
    throw new Error('Skivu release unavailable')
  }
  return {
    version: text(data.version, 64),
    versionCode: number(data.version_code, 1, 2 ** 31 - 1),
    url: firstPartyPath(
      data.download_url,
      /^\/api\/app-update\/download\/[A-Za-z0-9._-]+\/arm64-v8a$/
    ),
    size: number(data.size, 1, 1024 ** 3),
    sha256: digest(data.sha256),
    minSdk: number(data.min_sdk, 21, 100),
    notes: text(data.notes, 20000),
  }
}

export function parseResourceWallpapers(value: unknown): ResourceWallpaper[] {
  const response = record(value)
  const data = record(response.data)
  if (
    response.success !== true ||
    data.schema_version !== 1 ||
    !Array.isArray(data.items) ||
    data.items.length > 200
  ) {
    throw new Error('Wallpaper catalogue unavailable')
  }
  const ids = new Set<string>()
  return data.items.map((raw) => {
    const item = record(raw)
    const id = text(item.id, 32),
      sha256 = digest(item.sha256)
    if (!/^[a-f0-9]{32}$/.test(id) || ids.has(id)) {
      throw new Error('Invalid wallpaper identity')
    }
    ids.add(id)
    const width = number(item.width, 240, 8192),
      height = number(item.height, 240, 8192)
    if (width * height > 20000000 || width / height > 3 || height / width > 3) {
      throw new Error('Invalid wallpaper dimensions')
    }
    const url = firstPartyPath(
      item.url,
      /^\/app-wallpapers\/assets\/[a-f0-9]{64}\.jpg$/
    )
    const thumbnail = firstPartyPath(
      item.thumbnail_url,
      /^\/app-wallpapers\/assets\/[a-f0-9]{64}-thumb\.jpg$/
    )
    if (
      url !== `/app-wallpapers/assets/${sha256}.jpg` ||
      thumbnail !== `/app-wallpapers/assets/${sha256}-thumb.jpg`
    ) {
      throw new Error('Mismatched wallpaper image')
    }
    const name = text(item.name, 60)
    if (!name.trim()) throw new Error('Missing wallpaper name')
    return {
      id,
      name,
      description: text(item.description, 300),
      url,
      thumbnail,
      sha256,
      width,
      height,
      size: number(item.size_bytes, 1, 10 * 1024 ** 2),
    }
  })
}

async function publicJson(path: string, signal?: AbortSignal) {
  const response = await fetch(path, {
    signal: AbortSignal.any([
      AbortSignal.timeout(15000),
      ...(signal ? [signal] : []),
    ]),
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-cache',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('Public resources unavailable')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing resource response')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 1024 ** 2) throw new Error('Resource catalogue too large')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

export async function loadSkivuRelease(signal?: AbortSignal) {
  return parseSkivuRelease(await publicJson(skivuReleasePath, signal))
}
export async function loadResourceWallpapers(signal?: AbortSignal) {
  return parseResourceWallpapers(await publicJson(wallpaperCatalogPath, signal))
}
