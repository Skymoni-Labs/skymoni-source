import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'
import { useCreatorStore } from '@/stores/creator-store'

import { creatorRequest } from '../api'
import { CreatorGallery } from '../gallery'
import {
  defaultShowcaseLayout,
  orderedShowcaseWorks,
  showcaseSlots,
  type ShowcaseAdminData,
} from '../lib/showcase-layout'
import { ShowcaseEditor } from '../showcase-admin'
import { emptyWork } from '../types'

vi.mock('../api', () => ({ creatorRequest: vi.fn() }))
const projects = ['Alpha', 'Beta', 'Gamma'].map((title) => ({
  ...emptyWork(),
  id: title.toLowerCase(),
  title,
  author: 'Mio',
  status: 'published' as const,
}))
afterEach(() => {
  cleanup()
  useCreatorStore.setState({ showcase: null, published: [], saved: [] })
})
function mount(data: ShowcaseAdminData) {
  return render(
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
      <ShowcaseEditor data={data} onRefresh={() => undefined} />
    </QueryClientProvider>
  )
}
test('reserves explicit positions before auto filling and ignores unavailable projects', () => {
  const config = {
    ...defaultShowcaseLayout(),
    spotlightIds: ['', 'alpha', 'beta'] as [string, string, string],
    orderedIds: ['missing', 'alpha', 'gamma'],
  }
  expect(showcaseSlots(projects, config).map((work) => work?.id)).toEqual([
    'gamma',
    'alpha',
    'beta',
  ])
  expect(
    orderedShowcaseWorks(projects, config.orderedIds).map((work) => work.id)
  ).toEqual(['alpha', 'gamma', 'beta'])
  expect(
    showcaseSlots(projects.slice(0, 1), config).filter(Boolean)
  ).toHaveLength(1)
})
test('choosing an occupied position swaps the projects and saves the revision', async () => {
  const data: ShowcaseAdminData = {
    config: {
      ...defaultShowcaseLayout(),
      revision: 'r1',
      spotlightIds: ['alpha', 'beta', 'gamma'],
    },
    works: projects,
  }
  vi.mocked(creatorRequest).mockResolvedValue({
    ...data,
    config: { ...data.config, revision: 'r2' },
  })
  mount(data)
  fireEvent.change(screen.getByLabelText('左侧主推'), {
    target: { value: 'beta' },
  })
  expect(screen.getByLabelText('右侧上方')).toHaveValue('alpha')
  await userEvent.click(screen.getByRole('button', { name: '保存编排' }))
  await waitFor(() =>
    expect(creatorRequest).toHaveBeenCalledWith(
      '/admin/showcase',
      expect.objectContaining({
        method: 'put',
        data: expect.objectContaining({
          revision: 'r1',
          spotlightIds: ['beta', 'alpha', 'gamma'],
        }),
      })
    )
  )
})
test('search preserves absolute ordering and reset returns to default order', async () => {
  const data = {
    config: {
      ...defaultShowcaseLayout(),
      revision: 'r1',
      orderedIds: ['gamma', 'alpha', 'beta'],
    },
    works: projects,
  }
  mount(data)
  await userEvent.type(screen.getByLabelText('搜索编排作品'), 'Alpha')
  await userEvent.click(screen.getByRole('button', { name: '上移 Alpha' }))
  await userEvent.click(screen.getByRole('button', { name: '保存编排' }))
  await waitFor(() =>
    expect(creatorRequest).toHaveBeenCalledWith(
      '/admin/showcase',
      expect.objectContaining({
        data: expect.objectContaining({
          orderedIds: ['alpha', 'gamma', 'beta'],
        }),
      })
    )
  )
  await userEvent.click(screen.getByRole('button', { name: '恢复默认顺序' }))
  await userEvent.clear(screen.getByLabelText('搜索编排作品'))
  expect(screen.getByRole('button', { name: '上移 Alpha' })).toBeDisabled()
})
test('daily mode saves immediately and previews the server selection without a second save', async () => {
  const data: ShowcaseAdminData = {
    config: {
      ...defaultShowcaseLayout(),
      revision: 'r1',
      dailyRandom: false,
      spotlightIds: ['alpha', 'beta', 'gamma'],
    },
    dailyPreview: {
      ...defaultShowcaseLayout(),
      dailyRandom: true,
      rotationDate: '2026-10-12',
      spotlightIds: ['gamma', 'alpha', 'beta'],
    },
    works: projects,
  }
  vi.mocked(creatorRequest).mockResolvedValue({
    ...data,
    config: { ...data.config, dailyRandom: true, revision: 'r2' },
  })
  mount(data)
  const toggle = screen.getByRole('button', {
    name: /Daily random recommendations|每日随机推荐/,
  })
  await userEvent.click(toggle)
  await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'))
  expect(creatorRequest).toHaveBeenCalledWith('/admin/showcase', {
    method: 'put',
    data: expect.objectContaining({
      dailyRandom: true,
      revision: 'r1',
      spotlightIds: ['alpha', 'beta', 'gamma'],
    }),
  })
  expect(screen.getByLabelText('左侧主推')).toBeDisabled()
  expect(
    within(screen.getByRole('region', { name: '推荐区预览' }))
      .getAllByText(/Gamma|Alpha|Beta/)
      .map((node) => node.textContent)
  ).toEqual(['Gamma', 'Alpha', 'Beta'])
  expect(screen.getByRole('button', { name: '保存编排' })).toBeDisabled()
  expect(screen.getByText(/2026-10-12/)).toBeInTheDocument()
})
test('a failed daily mode update preserves the manual selection and allows retry', async () => {
  vi.mocked(creatorRequest).mockRejectedValue(new Error('network unavailable'))
  mount({
    config: { ...defaultShowcaseLayout(), dailyRandom: false, revision: 'r1' },
    works: projects,
  })
  const toggle = screen.getByRole('button', {
    name: /Daily random recommendations|每日随机推荐/,
  })
  await userEvent.click(toggle)
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByLabelText('左侧主推')).toBeEnabled()
  expect(toggle).toBeEnabled()
})
test('public gallery uses configured placements, keeps other sorting, and never shows sample fillers', async () => {
  useCreatorStore.setState({
    published: projects,
    showcase: {
      ...defaultShowcaseLayout(),
      spotlightIds: ['gamma', 'alpha', 'beta'],
      orderedIds: ['beta', 'gamma', 'alpha'],
    },
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SoftwareTestRouter>
        <CreatorGallery />
      </SoftwareTestRouter>
    </QueryClientProvider>
  )
  const spotlight = screen.getByRole('region', {
    name: /Project spotlight|作品推荐/,
  })
  expect(
    within(spotlight)
      .getAllByRole('heading')
      .map((heading) => heading.textContent)
  ).toEqual(['Gamma', 'Alpha', 'Beta'])
  expect(
    screen
      .getAllByRole('article')
      .map((article) => within(article).getByRole('heading').textContent)
  ).toEqual(['Beta', 'Gamma', 'Alpha'])
  act(() => useCreatorStore.setState({ published: projects.slice(0, 1) }))
  await waitFor(() =>
    expect(
      within(
        screen.getByRole('region', { name: /Project spotlight|作品推荐/ })
      ).getAllByRole('heading')
    ).toHaveLength(1)
  )
  act(() =>
    useCreatorStore.setState({
      published: [],
      showcase: defaultShowcaseLayout(),
    })
  )
  await waitFor(() =>
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  )
})
