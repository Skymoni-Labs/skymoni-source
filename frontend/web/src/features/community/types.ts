export type CommunityAuthor = {
  id: number
  name: string
  username: string
  avatar: string
}
export type CommunityCategory = {
  id: string
  name: string
  description: string
  color: string
  topics: number
  adminOnly?: boolean
}
export type TopicNavigationLink = {
  id: string
  categoryId: string
  label: string
  title: string
}
export type TopicNavigationItem = TopicNavigationLink & {
  available: boolean
}
export type TopicNavigationCatalog = {
  items: TopicNavigationItem[]
  revision: string
}
export type CommunityMeta = {
  navigation?: TopicNavigationLink[]
  categories: CommunityCategory[]
  stats: { topics: number; replies: number; members: number }
}
export type Topic = {
  id: string
  title: string
  category: string
  tags: string[]
  author: CommunityAuthor
  createdAt: number
  updatedAt: number
  pinned: boolean
  closed: boolean
  hidden: boolean
  revision: string
  views: number
  replies: number
  likes: number
  bookmarked: boolean
  workId: string
  deleted?: boolean
  contentFormat?: TopicFormat
}
export type Post = {
  id: string
  author: CommunityAuthor
  content: string
  createdAt: number
  editedAt: number
  deleted: boolean
  revision: string
  replyTo: string | null
  likes: number
  liked: boolean
  contentFormat?: TopicFormat
}
export type TopicFormat = 'markdown' | 'html' | 'text'
export type TopicUpload = {
  id: string
  name: string
  size: number
  mime: string
  image: boolean
  url: string
}
export type TopicDetail = {
  topic: Topic
  posts: Post[]
  page?: number
  totalPosts?: number
  attachments?: TopicUpload[]
}
export type TopicListing = {
  topics: Topic[]
  total: number
  page: number
  pageSize: number
}
export type CommunityView =
  | 'latest'
  | 'new'
  | 'top'
  | 'unanswered'
  | 'bookmarks'
  | 'mine'
  | 'trash'
export type CommunitySearch = {
  view?: CommunityView
  category?: string
  q?: string
  page?: number
}
export type CommunityNotification = {
  id: string
  topicId: string
  workId?: string
  title: string
  actor: string
  kind: 'reply' | 'like'
  read: boolean
  createdAt: number
}
export type CommunityReport = {
  id: string
  topicId: string
  postId: string
  reason: string
  state: string
  title: string
  reporter: string
  content: string
}
export type WorkCommentReport = {
  id: string
  commentId: string
  workId: string
  title: string
  reporter: string
  reason: string
  state: string
  content: string
  revision: string
  deleted: boolean
}
export type CommunityAdminData = {
  reports: CommunityReport[]
  hidden: Topic[]
  workReports?: WorkCommentReport[]
}

export const categoryFallback: CommunityCategory[] = [
  {
    id: 'general',
    name: '社区交流',
    description: '日常交流与想法分享',
    color: '#12a89d',
    topics: 0,
  },
  {
    id: 'development',
    name: '开发调优',
    description: '编程、开源与技术实践',
    color: '#eeb83c',
    topics: 0,
  },
  {
    id: 'ai',
    name: '人工智能',
    description: '模型、应用与工作流',
    color: '#9b72cf',
    topics: 0,
  },
  {
    id: 'showcase',
    name: '创作交流',
    description: '讨论创作经验、产品与设计',
    color: '#ed7669',
    topics: 0,
  },
  {
    id: 'resources',
    name: '资源荟萃',
    description: '实用工具与学习资料',
    color: '#4a9ed7',
    topics: 0,
  },
  {
    id: 'help',
    name: '求助问答',
    description: '一起寻找问题的答案',
    color: '#74b05c',
    topics: 0,
  },
  {
    id: 'feedback',
    name: '运营反馈',
    description: '建议、反馈与使用交流',
    color: '#da8a55',
    topics: 0,
  },
  {
    id: 'announcements',
    name: '社区公告',
    description: '社区的重要消息',
    color: '#d55461',
    topics: 0,
    adminOnly: true,
  },
]
