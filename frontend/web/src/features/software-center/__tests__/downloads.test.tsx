import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SoftwareCenter } from '..'
import type { SoftwareEntry } from '../types'
import { SoftwareTestRouter } from './router-fixture'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string; total?: string }) =>
      key
        .replace('{{name}}', options?.name || '{{name}}')
        .replace('{{total}}', options?.total || '{{total}}'),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const entries: SoftwareEntry[] = [
  {
    id: 'drip',
    kind: 'software',
    name: 'Drip Browser',
    description: 'Browse',
    platform: 'Windows',
    version: '0.3.28',
    downloadUrl: '/drip-releases/Drip-Setup-0.3.28-x64.exe',
    filename: 'Drip-Setup-0.3.28-x64.exe',
    detailUrl: '#installation',
    imageUrl: '',
    appearance: 'drip',
    sortOrder: 10,
    published: true,
  },
  {
    id: 'skymoni-mail',
    kind: 'software',
    name: 'skymoni Mail',
    description: 'Mail',
    platform: 'Android',
    version: '1.4.1',
    downloadUrl: '/static/downloads/skymoni-mail/1.4.1/Skymoni-Mail-1.4.1.apk',
    filename: 'Skymoni-Mail-1.4.1.apk',
    detailUrl: 'https://mail.skymoni.com/login',
    imageUrl: '',
    appearance: 'mail',
    sortOrder: 20,
    published: true,
  },
  ...[
    ['Cherry Studio', 'https://cherry-ai.com'],
    ['CC Switch', 'https://ccswitch.io'],
  ].map(([name, detailUrl], index) => ({
    id: `tool-${index}`,
    kind: 'tool' as const,
    name,
    description: 'Companion',
    platform: 'Desktop',
    version: '',
    downloadUrl: '',
    filename: '',
    detailUrl,
    imageUrl: '',
    appearance: 'generic' as const,
    sortOrder: 30 + index,
    published: true,
  })),
]
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
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items: entries } },
  })
})

describe('public software downloads', () => {
  test('Drip and Mail cards link to the store while independent software and tools do not', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [
            ...entries,
            {
              ...entries[0],
              id: '96b2ad63-7355-4fe9-b7e8-92a8ac85abd8',
              name: 'Drip Mac',
              platform: 'macOS',
            },
            {
              ...entries[0],
              id: 'operit',
              name: 'Operit',
              appearance: 'generic',
            },
          ],
        },
      },
    })
    renderCenter()
    await screen.findByRole('article', { name: 'Drip Browser' })
    for (const name of ['Drip Browser', 'Drip Mac', 'skymoni Mail']) {
      expect(
        within(screen.getByRole('article', { name })).getByRole('link', {
          name: 'Visit the store',
        })
      ).toHaveAttribute('href', '/store')
    }
    for (const name of ['Operit', 'Cherry Studio', 'CC Switch']) {
      expect(
        within(screen.getByRole('article', { name })).queryByRole('link', {
          name: 'Visit the store',
        })
      ).not.toBeInTheDocument()
    }
  })

  test('Drip cards display the real browser icon when no custom image is configured', async () => {
    renderCenter()
    const card = await screen.findByRole('article', { name: 'Drip Browser' })
    expect(card.querySelector('img')).toHaveAttribute(
      'src',
      '/static/software/drip-0.3.28.png'
    )
  })

  test('visitors get direct Drip and Mail installers without a login step', async () => {
    renderCenter()
    await screen.findByRole('article', { name: 'Drip Browser' })
    expect(
      within(screen.getByRole('article', { name: 'Drip Browser' })).getByRole(
        'link',
        { name: 'View details for Drip Browser' }
      )
    ).toHaveAttribute('href', '/software/drip')
    expect(
      within(screen.getByRole('article', { name: 'Drip Browser' })).getByRole(
        'link',
        { name: 'Download for Windows' }
      )
    ).toHaveAttribute('href', '/drip-releases/Drip-Setup-0.3.28-x64.exe')
    expect(
      within(screen.getByRole('article', { name: 'skymoni Mail' })).getByRole(
        'link',
        { name: 'Download for Android' }
      )
    ).toHaveAttribute('download', 'Skymoni-Mail-1.4.1.apk')
    expect(
      screen.queryByRole('article', { name: 'skymoni App' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Sign in/ })
    ).not.toBeInTheDocument()
  })
  test('third-party tools link to their official websites instead of hosted installers', async () => {
    renderCenter()
    await screen.findByRole('article', { name: 'CC Switch' })
    for (const [name, href] of [
      ['Visit Cherry Studio website', 'https://cherry-ai.com'],
      ['Visit CC Switch website', 'https://ccswitch.io'],
    ]) {
      const card = screen.getByRole('article', {
        name: name.replace(/^Visit /, '').replace(/ website$/, ''),
      })
      const link = within(card).getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).not.toHaveAttribute('download')
    }
  })
  test('published custom software and tools use the server-provided names and links', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [
            {
              ...entries[0],
              id: 'my-editor',
              name: 'My Editor',
              downloadUrl: '/api/software/files/example/MyEditor.zip',
              platform: 'Linux',
              appearance: 'generic',
            },
            {
              ...entries[2],
              id: 'my-tool',
              name: 'My Tool',
              detailUrl: 'https://example.com/tool',
            },
          ],
        },
      },
    })
    renderCenter()
    const card = await screen.findByRole('article', { name: 'My Editor' })
    expect(
      within(card).getByRole('link', { name: 'Download software' })
    ).toHaveAttribute('href', '/api/software/files/example/MyEditor.zip')
    expect(
      within(screen.getByRole('article', { name: 'My Tool' })).getByRole(
        'link',
        {
          name: 'Visit My Tool website',
        }
      )
    ).toHaveAttribute('href', 'https://example.com/tool')
    expect(
      screen.queryByRole('article', { name: 'Drip Browser' })
    ).not.toBeInTheDocument()
  })
  test('an empty published catalog shows the empty states without restoring removed defaults', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: { items: [] } },
    })
    renderCenter()
    expect(await screen.findByText('No software published yet')).toBeVisible()
    expect(screen.getByText('No tools published yet')).toBeVisible()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  test('typing a search hides promotions and shows only matching published cards', async () => {
    const user = userEvent.setup()
    renderCenter()
    await screen.findByRole('article', { name: 'Drip Browser' })
    await user.type(
      screen.getByRole('searchbox', { name: 'Search apps and tools' }),
      '  mail  '
    )
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('article', { name: 'skymoni Mail' })).toBeVisible()
    expect(
      screen.queryByRole('region', { name: 'Featured recommendations' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'All apps' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  test('platform categories combine with search and expose the selected state', async () => {
    const user = userEvent.setup()
    renderCenter()
    await screen.findByRole('article', { name: 'Drip Browser' })
    await user.click(screen.getByRole('button', { name: 'Windows' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Windows' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await user.type(screen.getByRole('searchbox'), 'Mail')
    expect(screen.getByText('No matching apps')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getAllByRole('article')).toHaveLength(4)
  })

  test('software and tool category buttons can be activated from the keyboard', async () => {
    const user = userEvent.setup()
    renderCenter()
    await screen.findByRole('article', { name: 'Drip Browser' })
    const tools = screen.getByRole('button', {
      name: 'Companion tools',
    })
    tools.focus()
    await user.keyboard('{Enter}')
    expect(tools).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(
      screen.queryByRole('article', { name: 'Drip Browser' })
    ).not.toBeInTheDocument()
  })

  test('a single custom app uses its uploaded cover and does not display unusable carousel controls', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [
            {
              ...entries[0],
              id: 'custom',
              name: 'Custom App',
              appearance: 'generic',
              imageUrl: 'https://example.com/icon.png',
            },
          ],
        },
      },
    })
    renderCenter()
    const card = await screen.findByRole('article', { name: 'Custom App' })
    expect(card.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/icon.png'
    )
    expect(
      screen.queryByRole('button', { name: 'Next recommendation' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('article', { name: 'Drip Browser' })
    ).not.toBeInTheDocument()
  })

  test('failed catalog requests show a retry action without stale default recommendations', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network unavailable'))
    const user = userEvent.setup()
    renderCenter()
    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('article', { name: 'Drip Browser' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument()
  })

  test('a long custom app name retains its full accessible name and download action', async () => {
    const name = 'My custom productivity application '.repeat(3).trim()
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: { items: [{ ...entries[0], name }] } },
    })
    renderCenter()
    const card = await screen.findByRole('article', { name })
    expect(within(card).getByRole('heading', { name })).toHaveAttribute(
      'title',
      name
    )
    expect(
      within(card).getByRole('link', { name: 'Download for Windows' })
    ).toHaveAttribute('href', entries[0].downloadUrl)
  })
})
