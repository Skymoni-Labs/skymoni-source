import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SoftwareCenter } from '..'
import { SoftwareArtwork } from '../artwork'
import { softwareEntrySchema } from '../lib/schema'
import catalog from '../preview-catalog.json'
import { SoftwareAction } from '../software-card'
import type { SoftwareEntry } from '../types'
import { SoftwareTestRouter } from './router-fixture'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key.replaceAll(/{{(\w+)}}/g, (match, name: string) =>
        String(values?.[name] ?? match)
      ),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))
const items = catalog.items as SoftwareEntry[]
function getEntry(id: string): SoftwareEntry {
  const entry = items.find((item) => item.id === id)
  if (!entry) throw new Error(`Missing catalog fixture: ${id}`)
  return entry
}
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: catalog },
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('role-playing is available in all-app browsing and its platform filter keeps web and mobile entries', async () => {
  const user = userEvent.setup()
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SoftwareTestRouter>
        <SoftwareCenter />
      </SoftwareTestRouter>
    </QueryClientProvider>
  )
  await user.click(await screen.findByRole('button', { name: '角色扮演' }))
  expect(screen.getAllByRole('article')).toHaveLength(5)
  expect(screen.getByRole('article', { name: 'Operit' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Web' }))
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(screen.getByRole('article', { name: '噜喵 Lumeow' })).toBeVisible()
  expect(screen.getByRole('article', { name: '鲸岛 AI' })).toBeVisible()
})

test('Kelivo offers versioned installers per platform and keeps iOS as a store entry', async () => {
  const user = userEvent.setup()
  render(<SoftwareAction entry={getEntry('kelivo')} />)
  await user.click(
    screen.getByRole('button', { name: 'Choose a platform for Kelivo' })
  )
  const windows = screen.getByRole('menuitem', { name: /^Windows · Installer/ })
  expect(windows).toHaveAttribute(
    'href',
    expect.stringContaining('/software-downloads/')
  )
  expect(
    screen.getByRole('menuitem', {
      name: /^Original download for Kelivo · Windows · Installer/,
    })
  ).toHaveAttribute('href', expect.stringContaining('/v1.3.1/'))
  expect(windows).toHaveTextContent('Site relay')
  expect(windows).toHaveAttribute(
    'download',
    'Kelivo_windows_1.3.1+80_setup.exe'
  )
  const ios = screen.getByRole('menuitem', { name: 'iOS · App Store' })
  expect(ios).toHaveAttribute('target', '_blank')
  expect(ios).not.toHaveAttribute('download')
})

test('Yese retains the cloud button separately from its Android and official iOS entries', async () => {
  const user = userEvent.setup()
  render(<SoftwareAction entry={getEntry('yese-ai')} />)
  const cloud = screen.getByRole('link', {
    name: 'Cloud drive download for 夜色 AI',
  })
  expect(cloud).toHaveAttribute('href', 'https://pan.quark.cn/s/6b1b64af1949')
  expect(cloud).not.toHaveAttribute('download')
  await user.click(
    screen.getByRole('button', { name: 'Choose a platform for 夜色 AI' })
  )
  expect(
    screen.getByRole('menuitem', { name: /Android · APK/ })
  ).toHaveAttribute('download', 'yese-ai-3.0.5c.apk')
  expect(screen.getByRole('menuitem', { name: /iOS/ })).not.toHaveAttribute(
    'download'
  )
})

test('adding direct installers keeps the existing website button beside the new download button', async () => {
  const user = userEvent.setup()
  const entry: SoftwareEntry = {
    ...getEntry('cherry-studio'),
    downloadUrl: '',
    downloads: [
      {
        platform: 'Windows',
        label: 'x64 installer',
        url: 'https://github.com/CherryHQ/cherry-studio/releases/download/v2.1.5/Cherry-Studio-2.1.5-win-x64-setup.exe',
        filename: 'Cherry-Studio-2.1.5-win-x64-setup.exe',
        kind: 'installer',
        version: '2.1.5',
      },
    ],
  }
  render(<SoftwareAction entry={entry} />)
  expect(
    screen.getByRole('link', { name: 'Visit Cherry Studio website' })
  ).toHaveAttribute('href', entry.detailUrl)
  const download = screen.getByRole('button', {
    name: 'Choose a platform for Cherry Studio',
  })
  expect(download).toHaveTextContent('Download software')
  await user.click(download)
  expect(screen.getByRole('menuitem', { name: /^Windows/ })).toHaveAttribute(
    'download',
    entry.downloads?.[0].filename
  )
  expect(
    screen.getByRole('link', { name: 'Visit Cherry Studio website' })
  ).toHaveAttribute('href', entry.detailUrl)
})

test('catalog and platform URLs validate while unsafe platform links fail', () => {
  for (const item of items) {
    expect(softwareEntrySchema.safeParse(item).success, item.id).toBe(true)
  }
  const item = getEntry('kelivo')
  expect(
    softwareEntrySchema.safeParse({
      ...item,
      downloads: [{ ...item.downloads?.[0], url: 'javascript:alert(1)' }],
    }).success
  ).toBe(false)
})

test('a broken custom icon falls back and a changed icon URL can load again', () => {
  const item = getEntry('gstory')
  const view = render(<SoftwareArtwork entry={item} />)
  const image = view.container.querySelector('img')
  if (!image) throw new Error('Expected custom catalog icon')
  fireEvent.error(image)
  expect(view.container.querySelector('img')).toBeNull()
  expect(view.container.querySelector('svg')).not.toBeNull()
  view.rerender(
    <SoftwareArtwork
      entry={{ ...item, imageUrl: '/static/software/icons/new-icon.png' }}
    />
  )
  expect(view.container.querySelector('img')).toHaveAttribute(
    'src',
    '/static/software/icons/new-icon.png'
  )
})
