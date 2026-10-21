import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SoftwareDetailsPage } from '../details-page'
import type { SoftwareEntry } from '../types'
import { SoftwareTestRouter } from './router-fixture'

const entry: SoftwareEntry = {
  id: 'editor',
  name: 'Editor',
  kind: 'software',
  description: 'A small editor',
  platform: 'Windows',
  version: '1.0',
  downloadUrl: '/static/downloads/Editor.zip',
  filename: 'Editor.zip',
  detailUrl: 'https://example.com',
  imageUrl: '',
  appearance: 'generic',
  sortOrder: 0,
  published: true,
  details: {
    overview: 'A real introduction\nSecond paragraph',
    features: 'Edit documents\nExport files',
    changelog: 'Improved file opening',
    requirements: 'Windows 10 or later',
    publisher: 'Example team',
    license: 'MIT',
    updatedAt: '2026-10-08',
    screenshots: ['https://example.com/screen.png'],
  },
}
let client: QueryClient
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        items: [
          entry,
          { ...entry, id: 'other', name: 'Other', details: undefined },
        ],
      },
    },
  })
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  cleanup()
  client.clear()
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function renderDetail(id = 'editor') {
  return render(
    <SoftwareTestRouter>
      <QueryClientProvider client={client}>
        <SoftwareDetailsPage softwareId={id} />
      </QueryClientProvider>
    </SoftwareTestRouter>
  )
}

test('guests see real details, direct download and other published software', async () => {
  renderDetail()
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Editor' })
  ).toBeVisible()
  expect(screen.getByText('A real introduction Second paragraph')).toBeVisible()
  expect(screen.getByRole('list')).toHaveTextContent(
    'Edit documentsExport files'
  )
  expect(screen.getByText('Windows 10 or later')).toBeVisible()
  expect(screen.getByText('Improved file opening')).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Download for Windows' })
  ).toHaveAttribute('download', 'Editor.zip')
  expect(screen.getByRole('link', { name: /Other Windows/ })).toHaveAttribute(
    'href',
    '/software/other'
  )
  expect(screen.queryByText(/rating|reviews/i)).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'Visit the store' })
  ).not.toBeInTheDocument()
})

test.each(['drip', '96b2ad63-7355-4fe9-b7e8-92a8ac85abd8', 'skymoni-mail'])(
  'the %s detail page offers the store alongside its free download',
  async (id) => {
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: { items: [{ ...entry, id }] } },
    })
    renderDetail(id)
    expect(
      await screen.findByRole('link', { name: 'Visit the store' })
    ).toHaveAttribute('href', '/store')
    expect(
      screen.getByRole('link', { name: 'Download for Windows' })
    ).toHaveAttribute('href', entry.downloadUrl)
  }
)

test('screenshots open from the keyboard and close back to the triggering image', async () => {
  const user = userEvent.setup()
  renderDetail()
  const image = await screen.findByRole('button', { name: 'View image 1' })
  image.focus()
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('dialog')).toBeVisible()
  expect(
    within(screen.getByRole('dialog')).getByRole('img', { name: 'Editor' })
  ).toHaveAttribute('src', 'https://example.com/screen.png')
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(image).toHaveFocus()
})

test('legacy entries without optional details retain introduction and platform without empty sections', async () => {
  renderDetail('other')
  await screen.findByRole('heading', { level: 1, name: 'Other' })
  expect(
    screen.getByRole('heading', { name: 'Software introduction' })
  ).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Screenshots' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: "What's new in this version" })
  ).not.toBeInTheDocument()
})

test('a missing or unpublished item offers a way back without leaking its details', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { items: [{ ...entry, published: false }] } },
  })
  renderDetail()
  expect(await screen.findByText('Software not available')).toBeVisible()
  expect(
    screen.queryByText('A real introduction Second paragraph')
  ).not.toBeInTheDocument()
  expect(
    screen.getAllByRole('link', { name: 'Back to Software Center' })[0]
  ).toHaveAttribute('href', '/software')
})

test('a failed details request can be retried without showing stale metadata', async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error('Offline'))
  const user = userEvent.setup()
  renderDetail()
  await user.click(await screen.findByRole('button', { name: 'Retry' }))
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Editor' })
  ).toBeVisible()
})

test('tools keep their official external link and hidden screenshots stay hidden', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: {
        items: [
          {
            ...entry,
            kind: 'tool',
            downloadUrl: '',
            details: { ...entry.details, screenshotsEnabled: false },
          },
        ],
      },
    },
  })
  renderDetail()
  const website = await screen.findByRole('link', {
    name: 'Visit Editor website',
  })
  expect(website).toHaveAttribute('href', 'https://example.com')
  expect(website).toHaveAttribute('rel', 'noopener noreferrer')
  expect(
    screen.queryByRole('button', { name: 'View image 1' })
  ).not.toBeInTheDocument()
})
