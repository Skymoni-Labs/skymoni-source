import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import skills from '@/features/software-center/__tests__/fixtures/skivu-extensions.json'
import presets from '@/features/software-center/__tests__/fixtures/skivu-index.json'
import {
  loadSkivuPlugins,
  parseSkivuPluginCatalog,
  skivuPluginSources,
} from '@/features/software-center/skivu-plugins'

import { SkivuResources } from '..'
import { loadResourceWallpapers, loadSkivuRelease } from '../catalog'

vi.mock('../catalog', () => ({
  loadSkivuRelease: vi.fn(),
  loadResourceWallpapers: vi.fn(),
}))
vi.mock('@/features/software-center/skivu-plugins', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadSkivuPlugins: vi.fn(),
}))
vi.mock('@/features/software-center/skivu-plugin-install', () => ({
  SkivuPluginInstall: () => <button type='button'>在 Skivu 中安装</button>,
}))

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.mocked(loadSkivuRelease).mockResolvedValue({
    version: '0.2.48',
    versionCode: 52,
    url: '/api/app-update/download/v0.2.48-build.52/arm64-v8a',
    size: 97216426,
    minSdk: 24,
    notes: '正式更新说明',
    sha256: 'a'.repeat(64),
  })
  vi.mocked(loadResourceWallpapers).mockResolvedValue([
    {
      id: 'b'.repeat(32),
      name: '月下海岸',
      description: '月光下的海面',
      url: '/app-wallpapers/assets/moon.jpg',
      thumbnail: '/app-wallpapers/assets/moon-thumb.jpg',
      width: 841,
      height: 1870,
      size: 281458,
      sha256: 'a'.repeat(64),
    },
  ])
  vi.mocked(loadSkivuPlugins).mockResolvedValue({
    items: [
      ...parseSkivuPluginCatalog(presets, skivuPluginSources[0]).items,
      ...parseSkivuPluginCatalog(skills, skivuPluginSources[1]).items,
    ],
    rejectedItems: 0,
    unavailableSources: [],
  })
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
})
function show() {
  render(
    <QueryClientProvider client={client}>
      <SkivuResources />
    </QueryClientProvider>
  )
}

test('resource hub uses the public release, shared catalogues and a relay-home navigation', async () => {
  show()
  const download = await screen.findByRole('link', {
    name: /下载 Android 安装包/,
  })
  expect(download.getAttribute('href')).toBe(
    '/api/app-update/download/v0.2.48-build.52/arm64-v8a'
  )
  expect(
    screen
      .getAllByRole('link', { name: '中转站首页' })
      .every((link) => link.getAttribute('href') === '/')
  ).toBe(true)
  expect(
    await screen.findByRole('button', { name: '预览月下海岸' })
  ).toBeTruthy()
  expect(loadSkivuPlugins).toHaveBeenCalledTimes(1)
  expect(loadResourceWallpapers).toHaveBeenCalledTimes(1)
})

test('plugin search and categories filter independently without affecting wallpapers', async () => {
  show()
  const input = screen.getByRole('textbox', { name: '搜索插件名称或作者' })
  await screen.findByRole('button', { name: '预览月下海岸' })
  const all = screen.getAllByRole('article').length
  await userEvent.click(screen.getByRole('button', { name: '内容技能' }))
  expect(screen.getAllByRole('article').length).toBeLessThan(all)
  await userEvent.type(input, 'nothing-matches-this')
  expect(screen.queryAllByRole('article')).toHaveLength(0)
  expect(screen.getByText(/没有找到匹配的插件/)).toBeTruthy()
  expect(screen.getByRole('button', { name: '预览月下海岸' })).toBeTruthy()
})

test('wallpaper preview offers download and instructions without changing any App selection', async () => {
  const before = localStorage.length
  show()
  await userEvent.click(
    await screen.findByRole('button', { name: '预览月下海岸' })
  )
  const dialog = screen.getByRole('dialog')
  expect(
    within(dialog).getByRole('link', { name: '下载壁纸' }).getAttribute('href')
  ).toBe('/app-wallpapers/assets/moon.jpg')
  expect(within(dialog).getByText(/预览不会更换 App 背景/)).toBeTruthy()
  expect(localStorage.length).toBe(before)
})

test('compact navigation exposes all resource sections and relay-home link', async () => {
  show()
  const menu = screen.getByRole('button', { name: '展开导航' })
  await userEvent.click(menu)
  expect(menu.getAttribute('aria-expanded')).toBe('true')
  const navigation = screen.getByRole('navigation', { name: 'Skivu 资源导航' })
  await userEvent.click(within(navigation).getByRole('link', { name: '壁纸' }))
  expect(
    screen
      .getByRole('button', { name: '展开导航' })
      .getAttribute('aria-expanded')
  ).toBe('false')
})
