import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SoftwareCenter } from '..'
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

function entry(kind: SoftwareEntry['kind'], number: number): SoftwareEntry {
  return {
    id: `${kind}-${number}`,
    kind,
    name: `${kind} ${number}`,
    description: 'An application',
    platform: number <= 8 ? 'Windows' : 'Android',
    version: '',
    filename: '',
    downloadUrl: kind === 'software' ? '/example.zip' : '',
    detailUrl: 'https://example.com',
    imageUrl: '',
    appearance: 'generic',
    sortOrder: number,
    published: true,
    details: { category: number <= 8 ? 'Coding' : 'Utilities' },
  }
}
const software = Array.from({ length: 7 }, (_, index) =>
  entry('software', index + 1)
)
const tools = Array.from({ length: 14 }, (_, index) => entry('tool', index + 1))

function respond(items: SoftwareEntry[]) {
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { items } },
  })
}
function renderCenter() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <SoftwareTestRouter>
        <SoftwareCenter />
      </SoftwareTestRouter>
    </QueryClientProvider>
  )
  return client
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
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  vi.spyOn(api, 'get')
  respond([...software, ...tools])
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('software catalog browsing', () => {
  test('the public page uses saved recommendations while retaining every published product in the catalog', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [...software, ...tools],
          featured: { carousel: ['tool-7'], tiles: ['software-4'] },
        },
      },
    })
    renderCenter()
    const regions = await screen.findAllByRole('region', {
      name: 'Featured recommendations',
    })
    const region = regions[0]
    expect(
      within(region).getByRole('heading', { name: 'tool 7' })
    ).toBeVisible()
    expect(
      within(region).getByRole('link', { name: 'software 4' })
    ).toHaveAttribute('href', '/software/software-4')
    expect(
      within(region).queryByRole('heading', { name: 'software 1' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'software 1' })).toBeVisible()
  })
  test('overview stays bounded and its heading arrow opens the complete paginated tool catalog from the keyboard', async () => {
    const user = userEvent.setup()
    renderCenter()
    await screen.findByRole('article', { name: 'software 1' })
    expect(screen.getAllByRole('article')).toHaveLength(12)
    expect(
      screen.queryByRole('article', { name: 'tool 7' })
    ).not.toBeInTheDocument()
    const more = screen.getByRole('button', {
      name: 'View all Companion tools',
    })
    more.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.queryByRole('article', { name: 'software 1' })
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(12)
    expect(screen.getByRole('article', { name: 'tool 12' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Go to previous page' })
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByRole('article', { name: 'tool 14' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Go to next page' })
    ).toBeDisabled()
    expect(screen.getByText('Showing 13–14 of 14')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Go to previous page' })
    )
    expect(screen.getByRole('article', { name: 'tool 1' })).toBeVisible()
  })

  test('the software heading and view-all footer show only software, and returning restores the limited overview', async () => {
    const user = userEvent.setup()
    renderCenter()
    await user.click(
      await screen.findByRole('button', { name: 'View all Software' })
    )
    expect(screen.getAllByRole('article')).toHaveLength(7)
    expect(
      screen.queryByRole('article', { name: 'tool 1' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Software' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await user.click(screen.getByRole('button', { name: 'Back to overview' }))
    expect(screen.getAllByRole('article')).toHaveLength(12)
    await user.click(screen.getByRole('button', { name: 'View all 14 items' }))
    expect(screen.getByRole('article', { name: 'tool 12' })).toBeVisible()
    expect(
      screen.queryByRole('article', { name: 'software 1' })
    ).not.toBeInTheDocument()
  })

  test('usage categories, platform and search work together and filter changes reset pagination', async () => {
    const user = userEvent.setup()
    renderCenter()
    await user.click(
      await screen.findByRole('button', { name: 'View all Companion tools' })
    )
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    await user.click(screen.getByRole('button', { name: 'Coding' }))
    expect(screen.getAllByRole('article')).toHaveLength(8)
    expect(screen.getByRole('article', { name: 'tool 1' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Windows' }))
    await user.type(screen.getByRole('searchbox'), 'tool 2')
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('article', { name: 'tool 2' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Android' }))
    expect(screen.getByText('No matching apps')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'All apps' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getAllByRole('article')).toHaveLength(12)
  })

  test('an admin-added category appears automatically and entries are grouped by kind rather than download availability', async () => {
    respond([
      {
        ...software[0],
        downloadUrl: '',
        details: { category: 'New category' },
      },
      { ...software[1], details: undefined },
      { ...tools[0], downloadUrl: '/tool.zip' },
    ])
    const user = userEvent.setup()
    renderCenter()
    const app = await screen.findByRole('article', { name: 'software 1' })
    expect(within(app).getByText('New category')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'View all Software' }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Other' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'New category' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('article', { name: 'software 1' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Companion tools' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('article', { name: 'tool 1' })).toBeVisible()
  })

  test('catalog refreshes cannot strand visitors on a now-empty page after entries are unpublished', async () => {
    const user = userEvent.setup()
    const client = renderCenter()
    await user.click(
      await screen.findByRole('button', { name: 'View all Companion tools' })
    )
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    respond([...software, ...tools.slice(0, 3)])
    await client.refetchQueries({ queryKey: ['software', 'public'] })
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
    expect(screen.getByRole('article', { name: 'tool 1' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Go to next page' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1–3 of 3')).toBeVisible()
  })
})
