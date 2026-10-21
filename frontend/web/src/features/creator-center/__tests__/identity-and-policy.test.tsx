import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'
import { useAuthStore } from '@/stores/auth-store'
import { useCreatorAccessStore } from '@/stores/creator-access-store'
import { useCreatorHubStore } from '@/stores/creator-hub-store'
import { useCreatorStore } from '@/stores/creator-store'

import {
  creatorRequest,
  loadPublicCreatorProfile,
  saveCreatorProfile,
  type CreatorMe,
  type PublicCreatorProfile,
} from '../api'
import { CreatorReviewPolicySetting } from '../components/review-policy'
import { WorkAuthor } from '../components/work-author'
import { defaultCreatorProfile } from '../lib/hub'
import type { ReviewCatalog } from '../lib/review'
import { emptyWork } from '../types'

vi.mock('../api', () => ({
  creatorRequest: vi.fn(),
  loadPublicCreatorProfile: vi.fn(),
  saveCreatorProfile: vi.fn(),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function mount(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <SoftwareTestRouter>{children}</SoftwareTestRouter>
    </QueryClientProvider>
  )
}
beforeEach(() => {
  vi.mocked(creatorRequest).mockReset()
  vi.mocked(loadPublicCreatorProfile).mockReset()
  useCreatorAccessStore.setState({ mode: 'visitor' })
})
afterEach(() => {
  cleanup()
  useAuthStore.getState().auth.reset()
  useCreatorHubStore.getState().hydrate(null)
})

test('work author uses current public avatar and name, deduplicates the query and links to the creator', async () => {
  const avatar = 'data:image/png;base64,cHVibGljLWF2YXRhcg=='
  vi.mocked(loadPublicCreatorProfile).mockResolvedValue({
    userId: 55,
    profile: { ...defaultCreatorProfile, name: 'Current name' },
    avatar,
    works: [],
    pinned: [],
  })
  const work = { ...emptyWork(), author: 'Old snapshot', ownerId: 55 }
  mount(
    <>
      <WorkAuthor work={work} />
      <WorkAuthor work={work} panel />
    </>
  )
  await screen.findByRole('heading', { name: 'Current name' })
  const authors = screen.getAllByRole('link', {
    name: 'Creator profile · Current name',
  })
  expect(authors).toHaveLength(2)
  expect(authors[0]).toHaveAttribute('href', '/creators/people/55')
  expect(authors[1].querySelector('img')).toHaveAttribute('src', avatar)
  expect(screen.queryByText('Old snapshot')).not.toBeInTheDocument()
  expect(loadPublicCreatorProfile).toHaveBeenCalledTimes(1)
})

test('work authors hide email snapshots while the public nickname is loading', async () => {
  vi.mocked(loadPublicCreatorProfile).mockResolvedValue({
    userId: 55,
    profile: { ...defaultCreatorProfile, name: 'Current nickname' },
    avatar: '',
    works: [],
    pinned: [],
  })
  mount(
    <WorkAuthor
      work={{ ...emptyWork(), author: 'old@example.com', ownerId: 55 }}
    />
  )
  expect(screen.queryByText('old@example.com')).not.toBeInTheDocument()
  expect(screen.getByText('社区成员')).toBeInTheDocument()
  await screen.findByRole('link', {
    name: 'Creator profile · Current nickname',
  })
  expect(screen.queryByText('old@example.com')).not.toBeInTheDocument()
})

test('own work identity responds immediately to profile edits without requesting an old public profile', async () => {
  useAuthStore.setState((s) => ({
    auth: {
      ...s.auth,
      user: {
        id: 7,
        username: 'creator',
        role: 1,
        display_name: 'Before edit',
        setting: { avatar: 'data:image/png;base64,YmVmb3Jl' },
      },
    },
  }))
  useCreatorAccessStore.setState({ mode: 'creator' })
  useCreatorHubStore.setState({
    profile: {
      ...defaultCreatorProfile,
      name: 'Before edit',
      avatar: 'data:image/png;base64,YmVmb3Jl',
    },
  })
  mount(
    <WorkAuthor work={{ ...emptyWork(), author: 'Old snapshot', ownerId: 7 }} />
  )
  expect(screen.getByText('Before edit')).toBeInTheDocument()
  useAuthStore.getState().auth.setUser({
    id: 7,
    username: 'creator',
    role: 1,
    display_name: 'After edit',
    setting: { avatar: 'data:image/jpeg;base64,YWZ0ZXI=' },
  })
  await screen.findByText('After edit')
  expect(screen.getByRole('link').querySelector('img')).toHaveAttribute(
    'src',
    'data:image/jpeg;base64,YWZ0ZXI='
  )
  expect(loadPublicCreatorProfile).not.toHaveBeenCalled()
})

test('saving profile hydrates the owned work list and current public author names together', async () => {
  const old = {
    ...emptyWork(),
    id: 'my-work',
    author: 'Old name',
    ownerId: 7,
    status: 'published' as const,
  }
  const me: CreatorMe = {
    mode: 'creator',
    suspended: false,
    termsVersion: 'test',
    member: {
      profile: { ...defaultCreatorProfile, name: 'New name' },
      pinned: [],
      saved: [],
    },
    works: [{ ...old, author: 'New name' }],
    files: [],
    releases: [],
  }
  useCreatorStore.setState({
    works: [old],
    published: [
      old,
      { ...old, id: 'other-work', ownerId: 8, author: 'Another creator' },
    ],
  })
  vi.mocked(saveCreatorProfile).mockResolvedValueOnce(me)
  await useCreatorHubStore.getState().saveProfile(me.member.profile)
  expect(useCreatorStore.getState().works[0].author).toBe('New name')
  expect(useCreatorStore.getState().published.map((w) => w.author)).toEqual([
    'New name',
    'Another creator',
  ])
  expect(useCreatorHubStore.getState().profile.name).toBe('New name')
})

test('missing or unsafe profile image uses the site default; examples do not request a real creator', async () => {
  vi.mocked(loadPublicCreatorProfile).mockResolvedValue({
    userId: 55,
    profile: { ...defaultCreatorProfile, name: 'Current' },
    avatar: 'javascript:bad',
    works: [],
    pinned: [],
  } as PublicCreatorProfile)
  const view = mount(
    <WorkAuthor work={{ ...emptyWork(), author: 'Fallback', ownerId: 55 }} />
  )
  await screen.findByText('Current')
  expect(view.container.querySelector('img')).toHaveAttribute(
    'src',
    '/skymoni-avatar.png'
  )
  view.unmount()
  vi.mocked(loadPublicCreatorProfile).mockClear()
  mount(
    <WorkAuthor
      work={{ ...emptyWork(), sample: true, author: 'Mio', ownerId: 55 }}
    />
  )
  expect(screen.getByText('Mio · Example creator')).toBeInTheDocument()
  expect(loadPublicCreatorProfile).not.toHaveBeenCalled()
})

type Policy = NonNullable<ReviewCatalog['reviewPolicy']>
function PolicyFixture() {
  const [policy, setPolicy] = useState<Policy>({
    autoApproveWorks: false,
    revision: 'initial',
  })
  return (
    <CreatorReviewPolicySetting
      policy={policy}
      onChange={setPolicy}
      onRefresh={() => undefined}
    />
  )
}
test('admin toggle persists both enable and disable with server revision', async () => {
  vi.mocked(creatorRequest)
    .mockResolvedValueOnce({ autoApproveWorks: true, revision: 'r1' })
    .mockResolvedValueOnce({ autoApproveWorks: false, revision: 'r2' })
  mount(<PolicyFixture />)
  const control = screen.getByRole('switch', { name: '作品自动通过审核' })
  expect(control).not.toBeChecked()
  await userEvent.click(control)
  await screen.findByText('已开启，新提交的作品将直接发布。')
  expect(control).toBeChecked()
  expect(creatorRequest).toHaveBeenNthCalledWith(1, '/admin/review-policy', {
    method: 'put',
    data: { autoApproveWorks: true, revision: 'initial' },
  })
  await userEvent.click(control)
  await screen.findByText('已关闭，新提交的作品需要管理员审核。')
  expect(control).not.toBeChecked()
  expect(creatorRequest).toHaveBeenNthCalledWith(2, '/admin/review-policy', {
    method: 'put',
    data: { autoApproveWorks: false, revision: 'r1' },
  })
})

test('failed policy save keeps the previous checked state and refreshes server settings', async () => {
  const refresh = vi.fn()
  const changed = vi.fn()
  vi.mocked(creatorRequest).mockRejectedValueOnce(
    new Error('Content changed; reload')
  )
  mount(
    <CreatorReviewPolicySetting
      policy={{ autoApproveWorks: true, revision: 'r1' }}
      onChange={changed}
      onRefresh={refresh}
    />
  )
  await userEvent.click(screen.getByRole('switch'))
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(screen.getByRole('switch')).toBeChecked()
  expect(changed).not.toHaveBeenCalled()
  expect(refresh).toHaveBeenCalledTimes(1)
})
