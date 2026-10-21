import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { communityRequest } from '@/features/community/api'
import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'
import { useAuthStore } from '@/stores/auth-store'

import { WorkComments, type WorkCommentListing } from '../work-comments'

vi.mock('@/features/community/api', () => ({ communityRequest: vi.fn() }))
const clients: QueryClient[] = []
const listing: WorkCommentListing = {
  workId: 'work-one',
  title: 'Independent work',
  count: 1,
  total: 1,
  page: 1,
  pageSize: 30,
  comments: [
    {
      id: 'comment-one',
      author: { id: 11, name: 'Maker', username: 'maker', avatar: '' },
      content: 'A **useful work comment**. <script>alert(1)</script>',
      createdAt: 1792000000,
      editedAt: 0,
      deleted: false,
      revision: 'comment-revision',
      replyTo: null,
      likes: 0,
      liked: false,
    },
  ],
}
function show() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <SoftwareTestRouter>
        <WorkComments workId='work-one' />
      </SoftwareTestRouter>
    </QueryClientProvider>
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.getState().auth.reset()
  vi.mocked(communityRequest).mockImplementation(async (_path, options) =>
    options?.method ? { id: 'new-comment' } : structuredClone(listing)
  )
})
afterEach(() => {
  for (const client of clients.splice(0)) client.clear()
  useAuthStore.getState().auth.reset()
})

test('anonymous visitors can read sanitized work comments and sign in back to the work', async () => {
  const view = show()
  expect(
    await screen.findByText('useful work comment', { selector: 'strong' })
  ).toBeVisible()
  expect(view.container.querySelector('script')).toBeNull()
  expect(
    screen.queryByRole('textbox', { name: '作品评论内容' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '登录后评论' })).toHaveAttribute(
    'href',
    '/sign-in?redirect=%2Fcreators%2Fworks%2Fwork-one'
  )
})

test('a regular signed-in member posts directly to the work instead of creating a topic', async () => {
  useAuthStore.getState().auth.setUser({ id: 12, username: 'reader', role: 1 })
  show()
  await screen.findByText('useful work comment', { selector: 'strong' })
  const user = userEvent.setup()
  await user.type(
    screen.getByRole('textbox', { name: '作品评论内容' }),
    'A genuine experience with this work.'
  )
  await user.click(screen.getByRole('button', { name: '发布评论' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/works/work-one/comments',
      expect.objectContaining({
        method: 'post',
        data: {
          content: 'A genuine experience with this work.',
          replyTo: undefined,
        },
      })
    )
  )
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '作品评论内容' })).toHaveValue(
      ''
    )
  )
  expect(
    vi
      .mocked(communityRequest)
      .mock.calls.every(([path]) => !path.startsWith('/topics'))
  ).toBe(true)
})

test('reply and like intent targets the selected work comment', async () => {
  useAuthStore.getState().auth.setUser({ id: 12, username: 'reader', role: 1 })
  show()
  await screen.findByText('useful work comment', { selector: 'strong' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '赞' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/work-comments/comment-one/like',
      expect.objectContaining({ method: 'put', data: { liked: true } })
    )
  )
  await user.click(screen.getByRole('button', { name: '回复' }))
  await user.type(
    screen.getByRole('textbox', { name: '作品评论内容' }),
    'A reply to this work comment.'
  )
  await user.click(screen.getByRole('button', { name: '发布评论' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/works/work-one/comments',
      expect.objectContaining({
        data: {
          content: 'A reply to this work comment.',
          replyTo: 'comment-one',
        },
      })
    )
  )
})

test('editing a work comment sends its own revision and self-like is disabled', async () => {
  useAuthStore.getState().auth.setUser({ id: 11, username: 'maker', role: 1 })
  show()
  await screen.findByText('useful work comment', { selector: 'strong' })
  expect(screen.getByRole('button', { name: '赞' })).toBeDisabled()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '编辑' }))
  const field = screen.getByRole('textbox', { name: '编辑作品评论内容' })
  await user.clear(field)
  await user.type(field, 'An updated work comment.')
  await user.click(screen.getByRole('button', { name: '保存评论修改' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/work-comments/comment-one',
      expect.objectContaining({
        method: 'put',
        data: {
          content: 'An updated work comment.',
          revision: 'comment-revision',
        },
      })
    )
  )
})

test('posting across a work comment page boundary loads the final comment page', async () => {
  useAuthStore.getState().auth.setUser({ id: 12, username: 'reader', role: 1 })
  vi.mocked(communityRequest).mockImplementation(async (_path, options) =>
    options?.method
      ? { id: 'new-comment' }
      : { ...structuredClone(listing), total: 30, count: 30 }
  )
  show()
  await screen.findByText('useful work comment', { selector: 'strong' })
  const user = userEvent.setup()
  await user.type(
    screen.getByRole('textbox', { name: '作品评论内容' }),
    'One more comment on this work.'
  )
  await user.click(screen.getByRole('button', { name: '发布评论' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/works/work-one/comments',
      expect.objectContaining({ params: { page: 2 } })
    )
  )
})

test('switching accounts clears the previous work comment draft', async () => {
  useAuthStore.getState().auth.setUser({ id: 12, username: 'reader', role: 1 })
  show()
  await screen.findByText('useful work comment', { selector: 'strong' })
  const user = userEvent.setup()
  await user.type(
    screen.getByRole('textbox', { name: '作品评论内容' }),
    'Private draft for the first account'
  )
  act(() => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 13, username: 'another-reader', role: 1 })
  })
  await screen.findByText('useful work comment', { selector: 'strong' })
  expect(screen.getByRole('textbox', { name: '作品评论内容' })).toHaveValue('')
})
