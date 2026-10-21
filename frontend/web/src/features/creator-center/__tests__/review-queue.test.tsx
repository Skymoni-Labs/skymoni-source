import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { CreatorManagement } from '../admin'
import { CreatorReviewQueue } from '../components/review-queue'
import {
  filterReviewItems,
  reviewItems,
  type ReviewCatalog,
} from '../lib/review'
import { emptyWork, type Work } from '../types'

function project(index: number, status: Work['status'] = 'review'): Work {
  return {
    ...emptyWork(),
    id: `work-${index}`,
    title: `Project ${index}`,
    summary: 'A creator submission',
    description: 'Full project description',
    author: 'Legacy name',
    ownerId: 5,
    revision: `revision-${index}`,
    status,
    updatedAt: index + 1,
  }
}
function catalog(count = 25): ReviewCatalog {
  return {
    works: Array.from({ length: count }, (_, index) => project(index)),
    releases: [],
    members: {
      '5': {
        profile: {
          name: 'Alice',
          handle: 'alice',
          bio: '',
          website: '',
          introduction: '',
        },
      },
    },
  }
}
function Fixture({ initial }: { initial: ReviewCatalog }) {
  const [data, setData] = useState(initial)
  return (
    <CreatorReviewQueue
      catalog={data}
      fetching={false}
      onCatalogChange={setData}
      onRefresh={() => undefined}
    />
  )
}
function mount(initial: ReviewCatalog) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <SoftwareTestRouter>
        <Fixture initial={initial} />
      </SoftwareTestRouter>
    </QueryClientProvider>
  )
}
beforeEach(() => {
  useAuthStore.getState().auth.setBundle({
    access_token: 'fixture-review-access',
    token_type: 'Bearer',
    access_expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 1, username: 'reviewer', role: 100 },
    session: {
      sid: 'fixture-review-session',
      current: true,
      login_method: 'password',
      ip: '',
      user_agent: '',
      created_at: 1,
      last_active_at: 1,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
  })
})
afterEach(() => useAuthStore.getState().auth.reset())

test('normalizes software ownership and searches profile identity while excluding private drafts', () => {
  const data = catalog(1)
  data.works.push(project(1, 'draft'), {
    ...project(2, 'draft'),
    reviewNote: 'Please correct the description',
  })
  data.releases.push({
    id: 'release-1',
    projectId: 'work-0',
    version: '1.0',
    platform: 'Windows',
    downloadUrl: 'https://example.com/app.exe',
    notes: 'Initial software release',
    provenance: 'original',
    license: '',
    sourceUrl: '',
    storeUrl: '',
    status: 'review',
    updatedAt: 100,
  })
  const items = reviewItems(data)
  expect(items).toHaveLength(3)
  expect(
    filterReviewItems(items, {
      status: 'review',
      kind: 'release',
      search: 'alice',
    })
  ).toEqual([
    expect.objectContaining({
      key: 'release-release-1',
      author: 'Alice',
      ownerId: 5,
    }),
  ])
  expect(
    filterReviewItems(items, {
      status: 'returned',
      kind: 'all',
      search: 'correct',
    })
  ).toHaveLength(1)
})

test('paginates and clears hidden selections when changing search or status', async () => {
  const user = userEvent.setup()
  mount(catalog())
  expect(
    screen.getByRole('button', { name: 'Review Project 0' })
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Review Project 20' })
  ).not.toBeInTheDocument()
  await user.click(
    screen.getByRole('checkbox', { name: 'Select current page' })
  )
  expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  await user.type(
    screen.getByRole('textbox', { name: 'Search submissions' }),
    'Project 24'
  )
  expect(
    screen.getByRole('button', { name: 'Review Project 24' })
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Approve' })
  ).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Review status'), 'published')
  expect(screen.getByText('No matching submissions')).toBeInTheDocument()
})

test('current-page bulk approval posts only selected revisions and reports partial conflicts', async () => {
  const data = catalog()
  const calls = vi.spyOn(api, 'request').mockImplementation(async (config) => {
    const id = config.url?.split('/').at(-1)
    if (id === 'work-1') throw new Error('Revision changed')
    data.works = data.works.map((work) =>
      work.id === id ? { ...work, status: 'published' } : work
    )
    return { data: { success: true, data: structuredClone(data) } }
  })
  const user = userEvent.setup()
  mount(data)
  await user.click(
    screen.getByRole('checkbox', { name: 'Select current page' })
  )
  await user.click(screen.getByRole('button', { name: 'Approve' }))
  const dialog = screen.getByRole('alertdialog')
  expect(
    within(dialog).queryByText('Project 20 · Alice')
  ).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Approve' }))
  await waitFor(() => expect(calls).toHaveBeenCalledTimes(20))
  expect(calls.mock.calls.map(([config]) => config.url)).not.toContain(
    '/api/creators/admin/work/work-20'
  )
  expect(calls.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      data: { decision: 'approve', revision: 'revision-0', note: '' },
      skipAuthRefresh: true,
    })
  )
  expect(
    await screen.findByText('Processed 19 submissions.')
  ).toBeInTheDocument()
  expect(screen.getByText('Project 1: Revision changed')).toBeInTheDocument()
})

test('details show full content and returning a submission requires a reason', async () => {
  const calls = vi.spyOn(api, 'request').mockResolvedValue({
    data: {
      success: true,
      data: {
        ...catalog(1),
        works: [
          { ...project(0, 'draft'), reviewNote: 'Please add screenshots' },
        ],
      },
    },
  })
  const user = userEvent.setup()
  mount(catalog(1))
  await user.click(screen.getByRole('button', { name: 'Review Project 0' }))
  const details = screen.getByRole('dialog')
  expect(
    within(details).getByText('Full project description')
  ).toBeInTheDocument()
  await user.click(
    within(details).getByRole('button', { name: 'Return for changes' })
  )
  const confirm = screen.getByRole('alertdialog')
  const submit = within(confirm).getByRole('button', {
    name: 'Return for changes',
  })
  expect(submit).toBeDisabled()
  await user.type(
    within(confirm).getByLabelText('Review note'),
    'Please add screenshots'
  )
  await user.click(submit)
  await waitFor(() =>
    expect(calls).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          decision: 'reject',
          revision: 'revision-0',
          note: 'Please add screenshots',
        },
      })
    )
  )
})

test('a changed account stops all remaining batch requests', async () => {
  const calls = vi.spyOn(api, 'request').mockImplementation(async () => {
    useAuthStore.getState().auth.setUser({ id: 6, username: 'other', role: 1 })
    return { data: { success: true, data: catalog(2) } }
  })
  const user = userEvent.setup()
  mount(catalog(2))
  await user.click(
    screen.getByRole('checkbox', { name: 'Select current page' })
  )
  await user.click(screen.getByRole('button', { name: 'Approve' }))
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Approve',
    })
  )
  expect(
    await screen.findByText('Processed 0 submissions.')
  ).toBeInTheDocument()
  expect(calls).toHaveBeenCalledTimes(1)
  expect(
    screen.getByText(
      '2 submissions were not processed. Refresh and review them individually.'
    )
  ).toBeInTheDocument()
})

test('ordinary users cannot fetch the administrator queue', () => {
  useAuthStore.getState().auth.setUser({ id: 6, username: 'member', role: 1 })
  const calls = vi.spyOn(api, 'request')
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <CreatorManagement />
    </QueryClientProvider>
  )
  expect(screen.getByText('Permission denied')).toBeInTheDocument()
  expect(calls).not.toHaveBeenCalled()
})
