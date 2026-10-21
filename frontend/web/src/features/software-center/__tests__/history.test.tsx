import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { SoftwareHistory } from '../software-history'
import catalog from '../preview-catalog.json'
import type { SoftwareEntry } from '../types'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const data = { app: { name: 'Kelivo', note: 'All versions', syncedAt: '2026-10-11', sources: ['https://github.com/Chevey339/kelivo/releases'] }, total: 25, pages: 2, page: 1, platforms: ['Android', 'Windows'], releases: [{ id: 'old', version: 'v1.0.0', name: 'v1.0.0', date: '2025-12-01', prerelease: false, sourceUrl: 'https://github.com/Chevey339/kelivo/releases/tag/v1.0.0', assets: [{ filename: 'kelivo-arm64.apk', platform: 'Android', architecture: 'ARM64', format: 'APK', kind: 'installer', size: 1000000, url: 'https://github.com/Chevey339/kelivo/releases/download/v1.0.0/kelivo-arm64.apk', downloadUrl: '/software-history-downloads/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/kelivo-arm64.apk' }] }] }
function view() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SoftwareHistory entry={catalog.items.find(a => a.id === 'kelivo') as SoftwareEntry} /></QueryClientProvider>) }
test('history loads on demand, preserves original sources, and selects every page and platform', async () => {
  const summary = { ...data, releases: data.releases.map(release => ({ ...release, assets: [], fileCount: release.assets.length })) }
  const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(url.includes('release=') ? { release: data.releases[0] } : summary), { status: 200, headers: { 'Content-Type': 'application/json' } }))); vi.stubGlobal('fetch', fetcher)
  view(); expect(fetcher).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Version history for {{name}}' }))
  expect(await screen.findByRole('link', { name: 'Site relay' })).toHaveAttribute('href', data.releases[0].assets[0].downloadUrl)
  expect(screen.getByRole('link', { name: 'Original source' })).toHaveAttribute('href', data.releases[0].assets[0].url)
  await userEvent.click(screen.getByRole('button', { name: 'Next page' })); expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('page=2'), expect.anything())
  fireEvent.change(screen.getByRole('combobox', { name: 'Supported platforms' }), { target: { value: 'Android' } }); expect(await screen.findByRole('button', { name: 'Next page' })).toBeVisible()
  await waitFor(() => expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('platform=Android'), expect.anything()))
})
test('an unavailable history offers retry without hiding existing software actions', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 }))); view()
  await userEvent.click(screen.getByRole('button', { name: 'Version history for {{name}}' }))
  expect(await screen.findByText('Version history could not be loaded.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('opening history never resets an immediately selected older version', async () => {
  const newer = { ...data.releases[0], id: 'new', version: 'v1.1.0', name: 'v1.1.0' }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...data, releases: [newer, ...data.releases] }), { status: 200 })))
  view()
  await userEvent.click(screen.getByRole('button', { name: 'Version history for {{name}}' }))
  await screen.findByRole('heading', { name: 'v1.1.0' })
  await userEvent.click(screen.getByRole('button', { name: /^v1\.0\.0/ }))
  await new Promise(resolve => setTimeout(resolve, 350))
  expect(screen.getByRole('heading', { name: 'v1.0.0' })).toBeVisible()
})
