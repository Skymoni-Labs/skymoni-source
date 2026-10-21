import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { CreatorHomeManagement } from '../home-admin'
import {
  loadHomepageShowcase,
  type CreatorHomeState,
  type HomeCard,
  type HomeRequest,
  type PublicCreatorHome,
} from '../home-api'
import { homepageWorks } from '../lib/home-examples'
import { defaultSettings, emptyWork } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
const transport = vi.hoisted(() => ({
  get: vi.fn<(path: string) => Promise<{ data: unknown }>>(),
}))
vi.mock('@/lib/api', () => ({ api: transport }))

beforeEach(() => {
  transport.get.mockReset()
  transport.get.mockImplementation(async (path) => ({
    data: {
      success: true,
      data: path.startsWith('/api/creators/home')
        ? { config: state.config, authors: [], works: [] }
        : [],
    },
  }))
})
afterEach(cleanup)
const state: CreatorHomeState = {
  config: {
    galleryEnabled: true,
    marqueeEnabled: true,
    autoAddCreators: true,
    revision: 'r1',
  },
  cards: [],
  orders: [],
  works: [],
  balance: 0,
  authors: [{ userId: 1, name: 'Mio', avatar: '', visible: true, position: 0 }],
  examples: [{ id: 'horizon', hidden: false, position: 0, revision: 'r1' }],
}
const submittedCard: HomeCard = {
  workId: 'deleted-project',
  ownerId: 5,
  image: 'data:image/jpeg;base64,abc',
  approvedImage: '',
  status: 'review',
  note: '',
  revision: 'card-r1',
  expiresAt: 0,
  permanent: false,
  hidden: false,
  ownerPaused: false,
  position: 0,
  updatedAt: 1,
}
function mountManagement(data: CreatorHomeState) {
  const request = vi.fn(async () => data)
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <CreatorHomeManagement
        preview
        request={request as unknown as HomeRequest}
      />
    </QueryClientProvider>
  )
  return request
}
test.each(['review', 'approved'] as const)(
  'a deleted work with a %s application is marked invalid and cannot be reviewed or edited',
  async (status) => {
    const request = mountManagement({
      ...state,
      cards: [{ ...submittedCard, status, permanent: status === 'approved' }],
      authors: [
        { userId: 5, name: 'xiaolin', avatar: '', visible: true, position: 0 },
      ],
    })
    fireEvent.click(
      await screen.findByRole('tab', { name: /Display applications/ })
    )
    await screen.findByRole('heading', { name: 'Deleted work' })
    expect(screen.getByText('Application invalid')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The original work was deleted. This application can no longer be reviewed or displayed.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText(/^xiaolin ·/)).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: submittedCard.workId })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /^编辑作品 |通过卡片审核|保存显示与排序/,
      })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/待审核|尚未开通或已到期/)
    ).not.toBeInTheDocument()
    expect(request.mock.calls).toHaveLength(1)
    if (status === 'approved') {
      expect(screen.getByText('永久展示')).toBeInTheDocument()
    }
  }
)
test('a published work keeps its review action and submits the current card revision', async () => {
  const request = mountManagement({
    ...state,
    cards: [submittedCard],
    works: [
      {
        ...emptyWork(),
        id: submittedCard.workId,
        title: 'Live project',
        author: 'xiaolin',
        status: 'published',
      },
    ],
  })
  fireEvent.click(
    await screen.findByRole('tab', { name: /Display applications/ })
  )
  fireEvent.click(
    await screen.findByRole('button', { name: '编辑作品 Live project' })
  )
  fireEvent.click(screen.getByRole('button', { name: '通过卡片审核' }))
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/admin/home/cards/deleted-project', {
      method: 'put',
      data: {
        revision: 'card-r1',
        hidden: false,
        position: 0,
        note: '',
        decision: 'approve',
      },
    })
  )
})
test('management retains real submissions and author controls without demo cards', async () => {
  const request = vi.fn(async () => state) as unknown as HomeRequest
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <CreatorHomeManagement preview request={request} />
    </QueryClientProvider>
  )
  fireEvent.click(
    await screen.findByRole('tab', { name: /Display applications/ })
  )
  await screen.findByRole('heading', { name: '还没有提交的首页卡片' })
  expect(screen.queryByText(/默认示例/)).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '编辑作品轮播模块' }))
  expect(
    screen.getByText('此开关只控制轮播区域的显示，不影响展示套餐价格。')
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  fireEvent.click(screen.getByRole('tab', { name: /创作者头像/ }))
  expect(
    screen.getByRole('button', { name: '编辑创作者 Mio' })
  ).toBeInTheDocument()
})
test('homepage never restores demo works, including an empty real catalogue', () => {
  const data: PublicCreatorHome = {
    config: state.config,
    authors: [],
    works: [],
    examples: state.examples,
  }
  expect(homepageWorks(data)).toEqual([])
  expect(homepageWorks()).toEqual([])
  const work = emptyWork()
  data.works = [
    { ...work, id: 'real', status: 'published' },
    { ...work, id: 'sample', sample: true, status: 'published' },
    { ...work, id: 'draft', status: 'draft' },
    { ...work, id: 'review', status: 'review' },
    {
      ...work,
      id: 'hidden',
      status: 'published',
      settings: { ...defaultSettings(), listed: false },
    },
  ]
  expect(homepageWorks(data).map((x) => x.id)).toEqual(['real'])
  data.works = data.works.slice(1)
  expect(homepageWorks(data)).toEqual([])
})
test('an empty homepage uses real published creator projects and their actual covers, excluding drafts, hidden works and demos', () => {
  const home: PublicCreatorHome = {
    config: state.config,
    authors: [],
    works: [],
  }
  const work = {
    ...emptyWork(),
    id: 'real',
    title: 'My real project',
    status: 'published' as const,
    cover: '/real-cover.jpg',
  }
  const catalogue = [
    work,
    { ...work, id: 'draft', status: 'draft' as const },
    { ...work, id: 'review', status: 'review' as const },
    { ...work, id: 'demo', sample: true },
    {
      ...work,
      id: 'private',
      settings: { ...defaultSettings(), listed: false },
    },
  ]
  expect(homepageWorks(home, catalogue)).toEqual([work])
  expect(
    homepageWorks(
      { ...home, works: [{ ...work, homePoster: '/approved-poster.jpg' }] },
      catalogue
    )
  ).toEqual([{ ...work, homePoster: '/approved-poster.jpg' }])
  expect(
    homepageWorks(
      { ...home, config: { ...state.config, galleryEnabled: false } },
      catalogue
    )
  ).toEqual([])
  expect(homepageWorks(undefined, catalogue)).toEqual([])
})
test('administrator sees real homepage projects separately from submitted applications', async () => {
  const work = {
    ...emptyWork(),
    id: 'real-project',
    title: 'Real website',
    author: 'xiaolin',
    status: 'published' as const,
    cover: '/real-cover.jpg',
  }
  transport.get.mockImplementation(async (path) => ({
    data: {
      success: true,
      data: path.startsWith('/api/creators/home')
        ? {
            config: state.config,
            authors: [],
            works: [work],
            source: 'creator-center',
          }
        : [work],
    },
  }))
  mountManagement(state)
  expect(
    await screen.findByRole('link', { name: 'Real website' })
  ).toHaveAttribute('href', '/creators/works/real-project')
  expect(screen.getByRole('img', { name: 'Real website' })).toHaveAttribute(
    'src',
    '/real-cover.jpg'
  )
  expect(screen.getByText(/来自创作者中心/)).toBeInTheDocument()
  expect(screen.queryByText('待审核')).not.toBeInTheDocument()
})
test('a configured homepage card keeps its poster and prevents catalogue fallback requests', async () => {
  const work = {
    ...emptyWork(),
    id: 'paid-card',
    title: 'Approved project',
    status: 'published' as const,
    homePoster: '/approved.jpg',
  }
  transport.get.mockResolvedValueOnce({
    data: {
      success: true,
      data: { config: state.config, authors: [], works: [work] },
    },
  })
  expect(await loadHomepageShowcase()).toMatchObject({
    works: [work],
    source: 'applications',
  })
  expect(transport.get.mock.calls.map(([path]) => path)).toEqual([
    '/api/creators/home?view=cards',
  ])
})
test('a disabled or unavailable homepage configuration never loads public fallback projects', async () => {
  transport.get.mockResolvedValueOnce({
    data: {
      success: true,
      data: {
        config: { ...state.config, galleryEnabled: false },
        authors: [],
        works: [],
      },
    },
  })
  expect((await loadHomepageShowcase()).works).toEqual([])
  transport.get.mockRejectedValueOnce(new Error('Configuration unavailable'))
  await expect(loadHomepageShowcase()).rejects.toThrow(
    'Configuration unavailable'
  )
  expect(transport.get.mock.calls.map(([path]) => path)).toEqual([
    '/api/creators/home?view=cards',
    '/api/creators/home?view=cards',
  ])
})

test('disabled works remain selectable and saving submits enablement, order and automatic-add policy', async () => {
  const work = {
    ...emptyWork(),
    id: 'choice',
    title: 'Selectable project',
    status: 'published' as const,
  }
  transport.get.mockImplementation(async (path) => ({
    data: {
      success: true,
      data: path.startsWith('/api/creators/home')
        ? {
            config: state.config,
            authors: [],
            works: [work],
            source: 'creator-center',
          }
        : [work],
    },
  }))
  const request = mountManagement({
    ...state,
    works: [work],
    showcase: {
      revision: 'selection-r1',
      autoAddWorks: true,
      works: [{ workId: work.id, enabled: false, position: 5 }],
    },
  })
  const enabled = await screen.findByRole('checkbox', {
    name: '启用展示 Selectable project',
  })
  expect(enabled).not.toBeChecked()
  fireEvent.click(enabled)
  fireEvent.click(
    screen.getByRole('checkbox', { name: '新公开作品自动加入展示' })
  )
  fireEvent.change(
    screen.getByRole('spinbutton', { name: '展示排序 Selectable project' }),
    { target: { value: '2' } }
  )
  fireEvent.click(screen.getByRole('button', { name: '保存展示配置' }))
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/admin/home/showcase', {
      method: 'put',
      data: {
        revision: 'selection-r1',
        autoAddWorks: false,
        works: [{ workId: 'choice', enabled: true, position: 2 }],
      },
    })
  )
})

test('homepage honors saved order, all-off and manual addition for both paid cards and fallback works', () => {
  const a = { ...emptyWork(), id: 'a', status: 'published' as const }
  const b = { ...a, id: 'b' }
  const unseen = { ...a, id: 'new' }
  const home: PublicCreatorHome = {
    config: state.config,
    authors: [],
    works: [],
    showcase: {
      revision: 'r',
      autoAddWorks: false,
      works: [
        { workId: 'a', enabled: true, position: 20 },
        { workId: 'b', enabled: true, position: 1 },
      ],
    },
  }
  expect(homepageWorks(home, [a, b, unseen]).map((work) => work.id)).toEqual([
    'b',
    'a',
  ])
  home.showcase?.works.forEach((item) => {
    item.enabled = false
  })
  expect(homepageWorks(home, [a, b, unseen])).toEqual([])
  home.works = [a, b]
  expect(homepageWorks(home, [a, b, unseen])).toEqual([])
  if (home.showcase) home.showcase.autoAddWorks = true
  expect(homepageWorks(home, [a, b, unseen]).map((work) => work.id)).toEqual([
    'new',
  ])
})
