import { afterEach, expect, test, vi } from 'vitest'

import {
  loadResourceWallpapers,
  loadSkivuRelease,
  parseResourceWallpapers,
  parseSkivuRelease,
  skivuReleasePath,
  wallpaperCatalogPath,
} from '../catalog'

const sha = 'a'.repeat(64)
export const releaseData = {
  success: true,
  data: {
    available: true,
    package_name: 'com.skyjjgw.independent.ski',
    abi: 'arm64-v8a',
    version: '0.2.48',
    version_code: 52,
    min_sdk: 24,
    size: 97216426,
    sha256: sha,
    notes: '已发布版本说明',
    download_url:
      'https://skymoni.com/api/app-update/download/v0.2.48-build.52/arm64-v8a',
  },
}
export const wallpaperData = {
  success: true,
  data: {
    schema_version: 1,
    items: [
      {
        id: 'b'.repeat(32),
        name: '月下海岸',
        description: '月光下的海面',
        sha256: sha,
        url: `https://skymoni.com/app-wallpapers/assets/${sha}.jpg`,
        thumbnail_url: `https://skymoni.com/app-wallpapers/assets/${sha}-thumb.jpg`,
        width: 841,
        height: 1870,
        size_bytes: 281458,
      },
    ],
  },
}

afterEach(() => vi.unstubAllGlobals())

test('published release remains first party and separate from local unpublished APKs', () => {
  expect(parseSkivuRelease(releaseData)).toMatchObject({
    version: '0.2.48',
    versionCode: 52,
    url: '/api/app-update/download/v0.2.48-build.52/arm64-v8a',
  })
  for (const patch of [
    { available: false },
    { package_name: 'com.skymoni.mobile' },
    { abi: 'x86_64' },
    {
      download_url:
        'https://evil.example/api/app-update/download/v0.2.48-build.52/arm64-v8a',
    },
    {
      download_url:
        'https://skymoni.com/api/app-update/download/v0.2.48-build.52/arm64-v8a?key=x',
    },
    { sha256: 'bad' },
  ]) {
    expect(() =>
      parseSkivuRelease({
        success: true,
        data: { ...releaseData.data, ...patch },
      })
    ).toThrow()
  }
})

test('wallpapers match exact content hashes, bounded dimensions and unique identities', () => {
  expect(parseResourceWallpapers(wallpaperData)[0]).toMatchObject({
    name: '月下海岸',
    url: `/app-wallpapers/assets/${sha}.jpg`,
  })
  for (const patch of [
    { url: `https://other.example/app-wallpapers/assets/${sha}.jpg` },
    { url: `/app-wallpapers/assets/${'c'.repeat(64)}.jpg` },
    { width: 8192, height: 8192 },
    { size_bytes: 11 * 1024 ** 2 },
  ]) {
    expect(() =>
      parseResourceWallpapers({
        success: true,
        data: {
          schema_version: 1,
          items: [{ ...wallpaperData.data.items[0], ...patch }],
        },
      })
    ).toThrow()
  }
  expect(() =>
    parseResourceWallpapers({
      success: true,
      data: {
        schema_version: 1,
        items: [wallpaperData.data.items[0], wallpaperData.data.items[0]],
      },
    })
  ).toThrow()
})

test('catalogue GET requests omit account credentials and forward cancellation', async () => {
  const mock = vi.fn(
    async (path: string) =>
      new Response(
        JSON.stringify(path === skivuReleasePath ? releaseData : wallpaperData)
      )
  )
  vi.stubGlobal('fetch', mock)
  const controller = new AbortController()
  await loadSkivuRelease(controller.signal)
  await loadResourceWallpapers(controller.signal)
  expect(mock.mock.calls.map((call) => call[0])).toEqual([
    skivuReleasePath,
    wallpaperCatalogPath,
  ])
  for (const call of mock.mock.calls) {
    const options = (call as unknown as [string, RequestInit])[1]
    expect(options).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-cache',
    })
    expect(options.headers).toEqual({ Accept: 'application/json' })
    expect(options.signal).toBeInstanceOf(AbortSignal)
  }
})

test('an oversized or failed public response is not used as a resource catalogue', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('x'.repeat(1024 ** 2 + 1)))
  )
  await expect(loadResourceWallpapers()).rejects.toThrow('too large')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 503 }))
  )
  await expect(loadSkivuRelease()).rejects.toThrow('unavailable')
})
