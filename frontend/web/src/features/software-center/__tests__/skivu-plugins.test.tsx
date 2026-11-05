import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SoftwareCenter } from '..'
import { SoftwareDetailsPage } from '../details-page'
import {
  loadSkivuPlugins,
  parseSkivuPluginCatalog,
  skivuPluginSources,
} from '../skivu-plugins'
import apps from './fixtures/skivu-apps-v3.json'
import extensions from './fixtures/skivu-extensions.json'
import presets from './fixtures/skivu-index.json'
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

const catalogs = [presets, extensions, apps]
let client: QueryClient
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  fetchMock = vi.fn(
    async (path: string) =>
      new Response(
        JSON.stringify(
          catalogs[
            skivuPluginSources.indexOf(
              path as (typeof skivuPluginSources)[number]
            )
          ]
        ),
        { status: 200 }
      )
  )
  vi.stubGlobal('fetch', fetchMock)
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
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        items: [
          {
            id: 'existing-app',
            kind: 'software',
            name: 'Existing app',
            description: 'Original download',
            platform: 'Windows',
            version: '1.0',
            filename: 'original.zip',
            downloadUrl: '/original.zip',
            detailUrl: '',
            imageUrl: '',
            appearance: 'generic',
            sortOrder: 1,
            published: true,
          },
        ],
      },
    },
  })
})
afterEach(() => {
  cleanup()
  client.clear()
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function show(detail?: string) {
  render(
    <QueryClientProvider client={client}>
      <SoftwareTestRouter>
        {detail ? (
          <SoftwareDetailsPage softwareId={detail} />
        ) : (
          <SoftwareCenter />
        )}
      </SoftwareTestRouter>
    </QueryClientProvider>
  )
}

test('the three live catalog protocols expose all nine plugins with verified package mirrors and requirements', async () => {
  const result = await loadSkivuPlugins()
  expect(result.items).toHaveLength(9)
  expect(result.unavailableSources).toEqual([])
  expect(result.rejectedItems).toBe(0)
  expect(new Set(result.items.map((entry) => entry.format))).toEqual(
    new Set(['ui-preset', 'skill', 'mcp-http', 'web-plugin'])
  )
  const phone = result.items.find(
    (entry) => entry.pluginId === 'org.skivu.pocket-phone'
  )
  if (!phone) throw new Error('Missing pocket phone plugin')
  expect(phone.minHostVersion).toBe('0.2.41')
  expect(phone.permissions).toContain('chat.read')
  expect(phone.networkDomains).toEqual(['*'])
  expect(phone.packageUrl).toBe(
    `/app-plugins/web-packages/${phone.packageSha256}.json`
  )
  expect(
    result.items.find((entry) => entry.format === 'skill')?.packageUrl
  ).toMatch(/^\/app-plugins\/packages\/[a-f0-9]{64}\.json$/)
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test('a failed source preserves other catalogs and reports the partial failure; a complete outage rejects', async () => {
  fetchMock.mockImplementation(async (path: string) => {
    if (path === skivuPluginSources[1]) return new Response('', { status: 503 })
    return new Response(
      JSON.stringify(
        catalogs[
          skivuPluginSources.indexOf(
            path as (typeof skivuPluginSources)[number]
          )
        ]
      )
    )
  })
  const result = await loadSkivuPlugins()
  expect(result.items).toHaveLength(4)
  expect(result.unavailableSources).toEqual([skivuPluginSources[1]])
  fetchMock.mockResolvedValue(new Response('', { status: 503 }))
  await expect(loadSkivuPlugins()).rejects.toThrow(
    'Skivu plugin catalogs unavailable'
  )
})

test('protocol mismatches and unsafe or mutable package URLs are not published', () => {
  expect(() =>
    parseSkivuPluginCatalog(presets, skivuPluginSources[2])
  ).toThrow()
  for (const url of [
    'javascript:alert(1)',
    'https://raw.githubusercontent.com/a/b/main/plugin.json',
    `https://evil.example/a/b/${'a'.repeat(40)}/plugin.json`,
  ]) {
    const changed = structuredClone(presets)
    changed.plugins[0].package.url = url
    const result = parseSkivuPluginCatalog(changed, skivuPluginSources[0])
    expect(result.items).toHaveLength(1)
    expect(result.rejectedItems).toBe(1)
  }
})

test('plugins share search and filters while existing software keeps its original download', async () => {
  const user = userEvent.setup()
  show()
  const original = await screen.findByRole('article', { name: 'Existing app' })
  expect(
    within(original).getByRole('link', { name: /Download/ })
  ).toHaveAttribute('href', '/original.zip')
  await user.click(
    await screen.findByRole('button', { name: 'View all Skivu plugins' })
  )
  expect(screen.getAllByRole('article')).toHaveLength(9)
  await user.type(
    screen.getByRole('searchbox', { name: 'Search apps and tools' }),
    'org.skivu.pocket-phone'
  )
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('article', { name: '角色小手机' })).toHaveTextContent(
    '0.2.41'
  )
  await user.click(screen.getByRole('button', { name: 'Clear search' }))
  await user.click(screen.getByRole('button', { name: 'MCP tools' }))
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('article')).toHaveTextContent('Firecrawl')
})

test('a partial plugin failure is visible and leaves the original software usable', async () => {
  fetchMock.mockImplementation(
    async (path: string) =>
      new Response(
        path === skivuPluginSources[1]
          ? ''
          : JSON.stringify(
              catalogs[
                skivuPluginSources.indexOf(
                  path as (typeof skivuPluginSources)[number]
                )
              ]
            ),
        { status: path === skivuPluginSources[1] ? 503 : 200 }
      )
  )
  show()
  expect(
    await screen.findByText('Some Skivu plugins could not be loaded.')
  ).toBeVisible()
  expect(screen.getByRole('article', { name: 'Existing app' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
})

test('a plugin detail route exposes real permissions and the supported local import package', async () => {
  const user = userEvent.setup()
  show('skivu-plugin-org.skivu.pocket-phone')
  expect(
    await screen.findByRole('heading', { level: 1, name: '角色小手机' })
  ).toBeVisible()
  expect(screen.getByText('Read conversations')).toBeVisible()
  expect(screen.getByText(/All domains/)).toBeVisible()
  expect(api.get).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Install in Skivu' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/Requires Skivu 0.2.41/)).toBeVisible()
  const download = within(dialog).getByRole('link', {
    name: 'Download plugin package',
  })
  expect(download).toHaveAttribute(
    'download',
    'org.skivu.pocket-phone-1.4.0.skivu.json'
  )
  expect(download).toHaveAttribute(
    'href',
    expect.stringMatching(/^\/app-plugins\/web-packages\/[a-f0-9]{64}\.json$/)
  )
  expect(
    within(dialog).getByText(
      /Installation and permissions are managed in Skivu/
    )
  ).toBeVisible()
})

test('an interface pack uses the in-app guide without offering an unsupported file import', async () => {
  const user = userEvent.setup()
  show('skivu-plugin-skivu.qq')
  await screen.findByRole('heading', { level: 1, name: 'QQ' })
  await user.click(screen.getByRole('button', { name: 'Install in Skivu' }))
  const dialog = await screen.findByRole('dialog')
  expect(
    within(dialog).queryByRole('link', { name: 'Download plugin package' })
  ).not.toBeInTheDocument()
  expect(
    within(dialog).getByText('Open Skivu and enter its plugin market.')
  ).toBeVisible()
})
