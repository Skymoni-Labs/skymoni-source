import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { emptyWork } from '@/features/creator-center/types'
import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'
import { useAuthStore } from '@/stores/auth-store'
import { useCreatorStore } from '@/stores/creator-store'

import {
  communityRequest,
  loadCommunityAdmin,
  loadCommunityMeta,
  loadTopic,
  loadTopics,
} from '../api'
import { CommunityComposer } from '../composer'
import { CommunityHome } from '../home'
import { CommunityModeration } from '../moderation'
import { CommunityTopic } from '../topic'
import { categoryFallback, type TopicDetail } from '../types'

vi.mock('../api', () => ({
  communityRequest: vi.fn(),
  loadCommunityMeta: vi.fn(),
  loadCommunityAdmin: vi.fn(),
  loadTopics: vi.fn(),
  loadTopic: vi.fn(),
}))
const clients: QueryClient[] = []
const topic: TopicDetail = {
  topic: {
    id: 'a'.repeat(32),
    title: 'A real community topic',
    category: 'development',
    tags: ['Python'],
    author: { id: 1, name: 'Maker', username: 'maker', avatar: '' },
    createdAt: 1792000000,
    updatedAt: 1792000001,
    pinned: false,
    closed: false,
    hidden: false,
    revision: 'revision1',
    views: 9,
    replies: 1,
    likes: 0,
    bookmarked: false,
    workId: '',
  },
  posts: [
    {
      id: 'first',
      author: { id: 1, name: 'Maker', username: 'maker', avatar: '' },
      content: 'A **real discussion** body. <script>alert(1)</script>',
      createdAt: 1792000000,
      editedAt: 0,
      deleted: false,
      revision: 'first-revision',
      replyTo: null,
      likes: 0,
      liked: false,
    },
    {
      id: 'second',
      author: { id: 2, name: 'Reader', username: 'reader', avatar: '' },
      content: 'A thoughtful reply.',
      createdAt: 1792000001,
      editedAt: 0,
      deleted: false,
      revision: 'second-revision',
      replyTo: null,
      likes: 0,
      liked: false,
    },
  ],
}
function show(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <SoftwareTestRouter>{children}</SoftwareTestRouter>
    </QueryClientProvider>
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.getState().auth.reset()
  useCreatorStore.setState({ published: [], works: [], saved: [] })
  vi.mocked(loadCommunityMeta).mockResolvedValue({
    categories: categoryFallback,
    stats: { topics: 1, replies: 1, members: 2 },
  })
  vi.mocked(loadTopics).mockResolvedValue({
    topics: [topic.topic],
    total: 1,
    page: 1,
    pageSize: 30,
  })
  vi.mocked(loadTopic).mockResolvedValue(structuredClone(topic))
  vi.mocked(communityRequest).mockResolvedValue({ id: topic.topic.id })
})
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  useAuthStore.getState().auth.reset()
  useCreatorStore.setState({ published: [], works: [], saved: [] })
})

test('forum feed contains only topics even when published works exist', async () => {
  useCreatorStore.setState({
    published: [
      {
        ...emptyWork(),
        id: 'existing-work',
        title: 'Existing software project',
        summary: 'A real existing creation',
        author: 'Maker',
        ownerId: 1,
        category: 'software',
        status: 'published',
      },
    ],
  })
  show(<CommunityHome search={{}} />)
  const link = await screen.findByRole('link', {
    name: 'A real community topic',
  })
  expect(link).toHaveAttribute('href', `/creators/topics/${topic.topic.id}`)
  expect(
    screen.queryByRole('link', { name: 'Existing software project' })
  ).not.toBeInTheDocument()
})

test('anonymous bookmark view offers sign in instead of requesting private data', () => {
  show(<CommunityHome search={{ view: 'bookmarks' }} />)
  expect(
    screen.getByRole('heading', { name: '免费加入社区，一起交流' })
  ).toBeVisible()
  expect(loadTopics).not.toHaveBeenCalled()
})

test('new topic form uses existing login and protects administrator announcement category', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'reader', role: 1 })
  show(<CommunityComposer />)
  await screen.findByRole('heading', { name: '发起一个新话题' })
  expect(
    screen.queryByRole('option', { name: '社区公告' })
  ).not.toBeInTheDocument()
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('话题标题'), 'My first community topic')
  await user.type(
    screen.getByLabelText('正文'),
    'A useful community discussion body.'
  )
  await user.click(screen.getByRole('button', { name: '发布话题' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/topics',
      expect.objectContaining({
        method: 'post',
        data: expect.objectContaining({
          title: 'My first community topic',
          content: 'A useful community discussion body.',
          category: 'general',
        }),
      })
    )
  )
})

test('topic editor can move an owned topic to the recycle bin with revision protection', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'maker', role: 1 })
  vi.mocked(communityRequest).mockResolvedValue({
    id: topic.topic.id,
    deleted: true,
  })
  show(<CommunityComposer topicId={topic.topic.id} />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '删除话题' }))
  await user.click(screen.getByRole('button', { name: '移入回收站' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      `/topics/${topic.topic.id}/trash`,
      expect.objectContaining({
        method: 'put',
        data: { deleted: true, revision: 'revision1' },
      })
    )
  )
})

test('an owned recycled topic can be restored while reply controls remain disabled', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'maker', role: 1 })
  vi.mocked(loadTopic).mockResolvedValue({
    ...structuredClone(topic),
    topic: { ...topic.topic, deleted: true },
  })
  vi.mocked(communityRequest).mockResolvedValue({
    id: topic.topic.id,
    deleted: false,
  })
  show(<CommunityTopic topicId={topic.topic.id} />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '恢复话题' }))
  expect(
    screen.queryByRole('button', { name: '发布回复' })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '确认恢复' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      `/topics/${topic.topic.id}/trash`,
      expect.objectContaining({
        data: { deleted: false, revision: 'revision1' },
      })
    )
  )
})

test('new admin-created categories are available to ordinary members when composing', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'reader', role: 1 })
  vi.mocked(loadCommunityMeta).mockResolvedValue({
    categories: [
      ...categoryFallback,
      {
        id: 'cat_custom',
        name: '自定义交流区',
        description: '来自管理员的新分类',
        color: '#123abc',
        topics: 0,
      },
    ],
    stats: { topics: 1, replies: 1, members: 2 },
  })
  show(<CommunityComposer />)
  await userEvent.click(await screen.findByLabelText('选择分类'))
  expect(
    await screen.findByRole('option', { name: '自定义交流区' })
  ).toBeVisible()
})

test('topic page sanitizes markup and anonymous readers cannot submit replies', async () => {
  const rendered = show(<CommunityTopic topicId={topic.topic.id} />)
  expect(
    await screen.findByRole('heading', { name: 'A real community topic' })
  ).toBeVisible()
  expect(rendered.container.querySelector('script')).toBeNull()
  expect(
    screen.queryByRole('textbox', { name: '回复内容' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: '免费加入社区，一起交流' })
  ).toBeVisible()
})

test('reply and like actions submit authenticated intent against the correct content', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'reader', role: 1 })
  show(<CommunityTopic topicId={topic.topic.id} />)
  await screen.findByRole('heading', { name: 'A real community topic' })
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: '赞' })[0])
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/posts/first/like',
      expect.objectContaining({ method: 'put', data: { liked: true } })
    )
  )
  await user.type(
    screen.getByRole('textbox', { name: '回复内容' }),
    'A helpful response from the reader.'
  )
  await user.click(screen.getByRole('button', { name: '发布回复' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      `/topics/${topic.topic.id}/replies`,
      expect.objectContaining({
        method: 'post',
        data: expect.objectContaining({
          content: 'A helpful response from the reader.',
        }),
      })
    )
  )
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '回复内容' })).toHaveValue('')
  )
})

test('closed topic keeps posts visible while removing reply form', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'reader', role: 1 })
  vi.mocked(loadTopic).mockResolvedValue({
    ...structuredClone(topic),
    topic: { ...topic.topic, closed: true },
  })
  show(<CommunityTopic topicId={topic.topic.id} />)
  await screen.findByText('这个话题已关闭回复，已有内容仍可阅读。')
  expect(
    screen.queryByRole('textbox', { name: '回复内容' })
  ).not.toBeInTheDocument()
  expect(screen.getByText('A thoughtful reply.')).toBeVisible()
})

test('editing a draft retains its original revision when another edit is refetched', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'maker', role: 1 })
  show(<CommunityComposer topicId={topic.topic.id} />)
  const title = await screen.findByLabelText('话题标题')
  const user = userEvent.setup()
  await user.clear(title)
  await user.type(title, 'My unsaved edited topic')
  vi.mocked(loadTopic).mockResolvedValue({
    ...structuredClone(topic),
    topic: { ...topic.topic, revision: 'a-new-server-revision' },
  })
  await act(async () => {
    await clients[0].refetchQueries({
      queryKey: ['community-topic', topic.topic.id],
    })
  })
  expect(title).toHaveValue('My unsaved edited topic')
  await user.click(screen.getByRole('button', { name: '保存修改' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      `/topics/${topic.topic.id}`,
      expect.objectContaining({
        method: 'put',
        data: expect.objectContaining({ revision: 'revision1' }),
      })
    )
  )
})

test('new topics view also excludes published works', async () => {
  useCreatorStore.setState({
    published: [
      {
        ...emptyWork(),
        id: 'existing-work',
        title: 'Existing software project',
        status: 'published',
      },
    ],
  })
  show(<CommunityHome search={{ view: 'new' }} />)
  expect(
    await screen.findByRole('link', { name: 'A real community topic' })
  ).toBeVisible()
  expect(
    screen.queryByRole('link', { name: 'Existing software project' })
  ).not.toBeInTheDocument()
})

test('composer formatting preserves text and invalid tag counts cannot be submitted', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'reader', role: 1 })
  show(<CommunityComposer />)
  await screen.findByRole('heading', { name: '发起一个新话题' })
  const user = userEvent.setup()
  await user.type(
    screen.getByLabelText('话题标题'),
    'A well described new topic'
  )
  await user.type(screen.getByLabelText('正文'), 'A useful body with context.')
  await user.click(screen.getByRole('button', { name: '插入粗体' }))
  expect(screen.getByLabelText('正文')).toHaveValue(
    'A useful body with context.**粗体文字**'
  )
  await user.click(screen.getByRole('button', { name: '预览' }))
  expect(screen.getByText('粗体文字', { selector: 'strong' })).toBeVisible()
  await user.type(screen.getByLabelText(/标签/), 'one,two,three,four,five,six')
  expect(screen.getByRole('button', { name: '发布话题' })).toBeDisabled()
  expect(communityRequest).not.toHaveBeenCalled()
})

test('composer uploads an image into the selected article position and submits the same markup and attachment', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'reader', role: 1 })
  const uploaded = {
    id: 'c'.repeat(32),
    name: 'article.png',
    url: '/api/community/uploads/article',
    image: true,
    mime: 'image/png',
    size: 12,
  }
  vi.mocked(communityRequest).mockImplementation(async (path) =>
    path === '/uploads'
      ? (uploaded as never)
      : ({ id: topic.topic.id } as never)
  )
  show(<CommunityComposer />)
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('话题标题'), '图片位置验收')
  const editor = screen.getByLabelText('正文') as HTMLTextAreaElement
  await user.type(editor, '第一段正文\n\n第二段正文')
  editor.setSelectionRange(5, 5)
  fireEvent.select(editor)
  await user.upload(
    screen.getByLabelText('选择上传图片'),
    new File(['image bytes'], 'article.png', { type: 'image/png' })
  )
  await waitFor(() =>
    expect(editor.value).toContain(
      '![article.png](/api/community/uploads/article)'
    )
  )
  expect(editor.value.indexOf('/uploads/article')).toBeLessThan(
    editor.value.indexOf('第二段正文')
  )
  expect(
    screen.getByRole('button', { name: '插入正文 article.png' })
  ).toBeEnabled()
  await user.click(screen.getByRole('button', { name: '发布话题' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      '/topics',
      expect.objectContaining({
        method: 'post',
        data: expect.objectContaining({
          content: editor.value,
          contentFormat: 'markdown',
          attachments: [uploaded.id],
        }),
      })
    )
  )
})

test('moderation separates resolved reports and restores hidden topics with their revision', async () => {
  vi.mocked(communityRequest).mockResolvedValue({
    categories: categoryFallback,
    revision: 'catalog-revision',
  })
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'operator', role: 100 })
  vi.mocked(loadCommunityAdmin).mockResolvedValue({
    reports: [
      {
        id: 'open-report',
        topicId: topic.topic.id,
        postId: 'first',
        reason: 'Open reason',
        state: 'open',
        title: 'Open report topic',
        reporter: 'Reader',
        content: 'Reported content',
      },
      {
        id: 'resolved-report',
        topicId: topic.topic.id,
        postId: 'first',
        reason: 'Resolved reason',
        state: 'resolved',
        title: 'Resolved report topic',
        reporter: 'Reader',
        content: 'Resolved content',
      },
    ],
    hidden: [{ ...topic.topic, hidden: true }],
  })
  show(<CommunityModeration />)
  expect(
    await screen.findByRole('link', { name: 'Open report topic' })
  ).toBeVisible()
  expect(
    screen.queryByRole('link', { name: 'Resolved report topic' })
  ).not.toBeInTheDocument()
  const user = userEvent.setup()
  await user.click(
    within(screen.getByRole('navigation', { name: '管理内容' })).getByRole(
      'button',
      { name: '已处理' }
    )
  )
  expect(
    screen.getByRole('link', { name: 'Resolved report topic' })
  ).toBeVisible()
  await user.click(
    within(screen.getByRole('navigation', { name: '管理内容' })).getByRole(
      'button',
      { name: '隐藏话题' }
    )
  )
  await user.click(screen.getByRole('button', { name: '恢复公开' }))
  await waitFor(() =>
    expect(communityRequest).toHaveBeenCalledWith(
      `/topics/${topic.topic.id}/moderation`,
      expect.objectContaining({
        data: { revision: 'revision1', hidden: false },
      })
    )
  )
})

test('posting on a full reply page loads the final page after success', async () => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'reader', role: 1 })
  vi.mocked(loadTopic).mockResolvedValue({
    ...structuredClone(topic),
    totalPosts: 100,
  })
  show(<CommunityTopic topicId={topic.topic.id} />)
  await screen.findByRole('heading', { name: 'A real community topic' })
  const user = userEvent.setup()
  await user.type(
    screen.getByRole('textbox', { name: '回复内容' }),
    'A reply crossing the pagination boundary.'
  )
  await user.click(screen.getByRole('button', { name: '发布回复' }))
  await waitFor(() =>
    expect(loadTopic).toHaveBeenCalledWith(
      topic.topic.id,
      expect.any(AbortSignal),
      2
    )
  )
})

test.each([
  { category: 'resources' },
  { q: 'Existing software project' },
  { view: 'bookmarks' },
  { view: 'mine' },
] as const)('forum filters do not reclassify works: %o', async (search) => {
  useAuthStore.getState().auth.setUser({ id: 2, username: 'reader', role: 1 })
  useCreatorStore.setState({
    published: [
      {
        ...emptyWork(),
        id: 'existing-work',
        title: 'Existing software project',
        category: 'software',
        ownerId: 2,
        status: 'published',
      },
    ],
    saved: ['existing-work'],
  })
  vi.mocked(loadTopics).mockResolvedValue({
    topics: [],
    total: 0,
    page: 1,
    pageSize: 30,
  })
  show(<CommunityHome search={search} />)
  await screen.findByText('换个分类看看，或者分享你的第一个想法。')
  expect(
    screen.queryByRole('link', { name: 'Existing software project' })
  ).not.toBeInTheDocument()
})
