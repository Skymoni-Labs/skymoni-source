import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  window.history.replaceState({}, '', '/')
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
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
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
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

test('merged product preview switches content and colour without model calls', async () => {
  show()
  await userEvent.click(screen.getByRole('button', { name: '角色与陪伴' }))
  expect(
    screen.getByRole('heading', { name: '相处的方式，由你定义。' })
  ).toBeTruthy()
  expect(
    within(document.querySelector('.sr-demo') as HTMLElement).getByText(
      /慢慢说，我在这里/
    )
  ).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: '预览极光配色' }))
  expect(
    screen
      .getByRole('button', { name: '预览极光配色' })
      .getAttribute('aria-pressed')
  ).toBe('true')
  expect(screen.getByText('功能交互示意 · 不发起模型请求')).toBeTruthy()
  fireEvent.change(screen.getByRole('slider', { name: /玻璃模糊/ }), {
    target: { value: '20' },
  })
  expect(screen.getByText('20 px')).toBeTruthy()
})

test('beta entry is visible in navigation, hero and a dedicated section', async () => {
  show()
  expect(
    screen.getByRole('link', { name: '内测计划' }).getAttribute('href')
  ).toBe('#beta')
  expect(
    screen.getByRole('link', { name: '申请内测' }).getAttribute('href')
  ).toBe('/creators/skivu-beta')
  expect(
    screen.getByRole('link', { name: '进入内测中心' }).getAttribute('href')
  ).toBe('/creators/skivu-beta')
  expect(screen.getByText(/内测资格由管理员审核/)).toBeTruthy()
})

test('visitor can pause decorative motion without changing saved App preferences', async () => {
  const matchMedia = window.matchMedia
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...matchMedia(query),
    matches: false,
  }))
  const before = localStorage.length
  show()
  await userEvent.click(screen.getByRole('button', { name: '暂停动效' }))
  expect(
    document.querySelector('.sr-page')?.getAttribute('data-motion-paused')
  ).toBe('true')
  await userEvent.click(screen.getByRole('button', { name: '开启动效' }))
  expect(
    document.querySelector('.sr-page')?.getAttribute('data-motion-paused')
  ).toBe('false')
  expect(localStorage.length).toBe(before)
})

test('system reduced-motion preference keeps the scene static', () => {
  show()
  expect(screen.getByRole('button', { name: '系统已减少动态' })).toBeDisabled()
  expect(
    document.querySelector('.sr-page')?.getAttribute('data-motion-paused')
  ).toBe('true')
})

test('brand film loads on request and unmounts when the dialog closes', async () => {
  show()
  expect(document.querySelector('iframe')).toBeNull()
  await userEvent.click(
    screen.getByRole('button', { name: '播放 Skivu 品牌短片' })
  )
  expect(screen.getByTitle('Skivu 品牌宣传片').getAttribute('src')).toBe(
    '/skivu/film/index.html'
  )
  await userEvent.keyboard('{Escape}')
  expect(document.querySelector('iframe')).toBeNull()
})

test.each([false, true])(
  'deep link waits for async catalogue layout and respects visitor scroll=%s',
  async (visitorScrolls) => {
    window.history.replaceState({}, '', '/skivu/?from=old#wallpapers')
    let resolveCatalogue!: (
      value: Awaited<ReturnType<typeof loadSkivuPlugins>>
    ) => void
    vi.mocked(loadSkivuPlugins).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCatalogue = resolve
        })
    )
    show()
    await screen.findByRole('button', { name: '预览月下海岸' })
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView)
    expect(scroll).not.toHaveBeenCalled()
    if (visitorScrolls) fireEvent.wheel(window)
    resolveCatalogue({ items: [], rejectedItems: 0, unavailableSources: [] })
    await screen.findByText(/没有找到匹配的插件/)
    if (visitorScrolls) {
      expect(scroll).not.toHaveBeenCalled()
    } else {
      await waitFor(() => {
        expect(scroll).toHaveBeenCalledTimes(1)
        expect((scroll.mock.contexts[0] as HTMLElement | undefined)?.id).toBe(
          'wallpapers'
        )
      })
    }
  }
)
