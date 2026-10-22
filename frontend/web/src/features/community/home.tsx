import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  GitBranch,
  Layers3,
  LayoutDashboard,
  ArrowUpRight,
  LockKeyhole,
  Pin,
  Plus,
  Search,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { CommunityAccessDescription } from '@/features/community/access-copy'
import { useAuthStore } from '@/stores/auth-store'
import { useCreatorStore } from '@/stores/creator-store'

import { loadCommunityMeta, loadTopics } from './api'
import {
  CommunityNumber,
  CommunitySignIn,
  CommunityTime,
  MemberAvatar,
} from './shared'
import { SkivuPromoCard } from './skivu-promo-card'
import { SkyObservatory } from './sky-decorations'
import { TopicWindowFrame } from './topic-window'
import {
  categoryFallback,
  type CommunitySearch,
  type CommunityView,
} from './types'

const views: { id: CommunityView; label: string }[] = [
  { id: 'latest', label: '最新' },
  { id: 'new', label: '新话题' },
  { id: 'top', label: '热门' },
  { id: 'unanswered', label: '未回复' },
  { id: 'bookmarks', label: '收藏的话题' },
]

const viewCopy: Record<CommunityView, { title: string; description: string }> =
  {
    latest: { title: '最新动态', description: '发现社区里正在发生的讨论。' },
    new: { title: '新话题', description: '发现社区里正在发生的讨论。' },
    top: { title: '热门讨论', description: '发现社区里正在发生的讨论。' },
    unanswered: {
      title: '等待你的回答',
      description: '分享你知道的，让一个问题找到答案。',
    },
    bookmarks: {
      title: '收藏的话题',
      description: '值得再读的话题，集中收好。',
    },
    trash: {
      title: '话题回收站',
      description: '删除的话题会保留在这里，可打开后恢复。',
    },
    mine: {
      title: '我发起的话题',
      description: '继续你发起的交流，让每一个想法都有回应。',
    },
  }

export function CommunityHome(props: { search: CommunitySearch }) {
  const search = props.search
  const user = useAuthStore((state) => state.auth.user)
  const sid = useAuthStore((state) => state.auth.session?.sid)
  const works = useCreatorStore((state) => state.published)
  const visibleWorks = works.filter(
    (work) => !work.sample && work.settings?.listed !== false
  )
  const navigate = useNavigate()
  const restricted =
    search.view === 'bookmarks' ||
    search.view === 'mine' ||
    search.view === 'trash'
  const topics = useQuery({
    queryKey: ['community-topics', search, user?.id, sid],
    queryFn: ({ signal }) => loadTopics(search, signal),
    enabled: !restricted || !!user,
    staleTime: 15000,
    retry: false,
  })
  const meta = useQuery({
    queryKey: ['community-meta'],
    queryFn: ({ signal }) => loadCommunityMeta(signal),
    staleTime: 60000,
    retry: false,
  })
  const categories = meta.data?.categories ?? categoryFallback
  const category = categories.find((item) => item.id === search.category)
  const rows = (topics.data?.topics ?? []).map((topic) => ({
    ...topic,
    timestamp: topic.updatedAt,
    topic,
  }))
  const change = (next: CommunitySearch) => {
    void navigate({
      to: '/creators',
      search: { ...search, ...next, page: next.page },
    })
  }
  const newTopic = user ? (
    <Link to='/creators/new' />
  ) : (
    <Link to='/sign-in' search={{ redirect: '/creators/new' }} />
  )
  return (
    <main className='sf-community-home'>
      <div className='sf-community-grid'>
        <div className='sf-feed-column'>
          {!restricted &&
            !search.category &&
            !search.q &&
            (!search.view || search.view === 'latest') && <SkivuPromoCard />}
          {!search.category &&
            !search.q &&
            !restricted &&
            (!search.view || search.view === 'latest') && (
              <section className='sf-welcome'>
                <div className='sf-welcome-copy'>
                  <span className='sf-welcome-eyebrow'>
                    <span />
                    欢迎来到 skymoni 社区
                  </span>
                  <h1>让想法相遇，让创作发生。</h1>
                  <p>
                    <CommunityAccessDescription>
                      社区免费注册，发帖与评论无需充值或创作者资格。展示作品，请前往作品广场。
                    </CommunityAccessDescription>
                  </p>
                  <Link to='/creators/guidelines'>
                    了解社区 <ArrowRight />
                  </Link>
                </div>
                <div className='sf-welcome-stats' aria-label='社区概况'>
                  <div>
                    <strong>
                      {meta.data ? (
                        <CommunityNumber value={meta.data.stats.topics} />
                      ) : (
                        '—'
                      )}
                    </strong>
                    <span>讨论话题</span>
                  </div>
                  <div>
                    <strong>
                      <CommunityNumber value={visibleWorks.length} />
                    </strong>
                    <span>公开作品</span>
                  </div>
                </div>
              </section>
            )}
          {!search.category &&
            !search.q &&
            search.view &&
            search.view !== 'latest' && (
              <header className='sf-view-heading'>
                <span className='sf-rail-kicker'>COMMUNITY / SKYMONI</span>
                <h1>{viewCopy[search.view].title}</h1>
                <p>{viewCopy[search.view].description}</p>
              </header>
            )}
          {!search.category &&
            !search.q &&
            !restricted &&
            (!search.view || search.view === 'latest') && (
              <nav className='sf-quick-links' aria-label='创作快捷入口'>
                <Link to='/creators/projects'>
                  <Layers3 />
                  发现作品
                  <ArrowUpRight />
                </Link>
                <Link to='/creators/workspace'>
                  <LayoutDashboard />
                  创作者工作台
                  <ArrowUpRight />
                </Link>
                <Link to='/creators/workspace' search={{ tab: 'github' }}>
                  <GitBranch />从 GitHub 导入
                  <ArrowUpRight />
                </Link>
              </nav>
            )}
          {category && (
            <div className='sf-category-intro'>
              <i style={{ backgroundColor: category.color }} />
              <div>
                <h1>{category.name}</h1>
                <p>{category.description}</p>
              </div>
            </div>
          )}
          {search.q && (
            <div className='sf-view-heading'>
              <h1>搜索“{search.q}”</h1>
              <p>搜索论坛话题的标题和正文。作品请前往作品广场搜索。</p>
              <Link to='/creators' className='sf-text-link'>
                清除搜索 <ArrowRight />
              </Link>
            </div>
          )}
          <div className='sf-feed-controls'>
            <NativeSelect
              aria-label='社区分类'
              value={search.category ?? ''}
              onChange={(event) =>
                change({ category: event.target.value || undefined })
              }
            >
              <option value=''>所有分类</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </NativeSelect>
            <span className='sf-content-hint'>论坛话题 · 按讨论分类浏览</span>
            <Button className='sf-primary' render={newTopic}>
              <Plus />
              发起话题
            </Button>
          </div>
          <nav className='sf-feed-tabs' aria-label='话题排序'>
            {views.map((view) => (
              <Link
                key={view.id}
                to='/creators'
                search={{ ...search, view: view.id, page: undefined }}
                aria-current={
                  (search.view ?? 'latest') === view.id ? 'page' : undefined
                }
              >
                {view.label}
              </Link>
            ))}
            <Link to='/creators/projects' className='sf-works-tab'>
              作品广场 <ArrowUpRight />
            </Link>
          </nav>
          {restricted && !user ? (
            <CommunitySignIn redirect={`/creators?view=${search.view}`} />
          ) : (
            <>
              {topics.isError && (
                <div role='alert' className='sf-inline-error'>
                  社区话题暂时无法加载。
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => {
                      void topics.refetch()
                    }}
                  >
                    重试
                  </Button>
                </div>
              )}
              {topics.isPending && (
                <p role='status' className='sf-loading'>
                  正在加载社区话题…
                </p>
              )}
              {(topics.isPending || rows.length > 0) && (
                <div
                  className='sf-topic-table-wrap sf-topic-window'
                  aria-busy={topics.isFetching}
                >
                  <TopicWindowFrame />
                  <table className='sf-topic-table'>
                    <thead>
                      <tr>
                        <th>话题</th>
                        <th className='sf-participants'>参与者</th>
                        <th>回复</th>
                        <th className='sf-views'>浏览</th>
                        <th>动态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topics.isPending &&
                        !rows.length &&
                        [0, 1, 2, 3].map((item) => (
                          <tr
                            className='sf-skeleton-row'
                            key={item}
                            aria-hidden='true'
                          >
                            <td colSpan={5}>
                              <span />
                              <span />
                            </td>
                          </tr>
                        ))}
                      {rows.map((row) => {
                        const board = categories.find(
                          (item) => item.id === row.category
                        )
                        return (
                          <tr
                            key={row.id}
                            className={
                              row.topic?.pinned ? 'sf-row-pinned' : undefined
                            }
                          >
                            <td>
                              <div className='sf-topic-title'>
                                {row.topic?.pinned && (
                                  <Pin size={14} aria-label='置顶' />
                                )}
                                {row.topic?.closed && (
                                  <LockKeyhole
                                    size={14}
                                    aria-label='已关闭回复'
                                  />
                                )}
                                <Link
                                  to='/creators/topics/$topicId'
                                  params={{ topicId: row.id }}
                                >
                                  {row.title}
                                </Link>
                              </div>
                              <div className='sf-topic-meta'>
                                <Link
                                  to='/creators'
                                  search={{ category: row.category }}
                                >
                                  <i
                                    style={{ backgroundColor: board?.color }}
                                  />
                                  {board?.name}
                                </Link>
                                {row.tags.slice(0, 3).map((tag) => (
                                  <Link
                                    key={tag}
                                    to='/creators'
                                    search={{ q: tag }}
                                    className='sf-tag'
                                  >
                                    {tag}
                                  </Link>
                                ))}
                              </div>
                            </td>
                            <td className='sf-participants'>
                              <MemberAvatar author={row.author} small />
                            </td>
                            <td>
                              <CommunityNumber value={row.replies} />
                            </td>
                            <td className='sf-views'>
                              <CommunityNumber value={row.views} />
                            </td>
                            <td className='sf-activity'>
                              <CommunityTime timestamp={row.timestamp} short />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!topics.isPending && !topics.isError && !rows.length && (
                <div className='sf-state sf-topic-window'>
                  <TopicWindowFrame />
                  <Search />
                  <h2>{restricted ? '这里还没有内容' : '还没有相关话题'}</h2>
                  <p>换个分类看看，或者分享你的第一个想法。</p>
                  <Button className='sf-primary' render={newTopic}>
                    发起话题
                  </Button>
                </div>
              )}
              {(topics.data?.total ?? 0) > 30 && (
                <nav className='sf-pagination' aria-label='话题分页'>
                  <Button
                    variant='outline'
                    disabled={(search.page ?? 1) <= 1}
                    onClick={() => change({ page: (search.page ?? 1) - 1 })}
                  >
                    上一页
                  </Button>
                  <span>第 {search.page ?? 1} 页</span>
                  <Button
                    variant='outline'
                    disabled={
                      (search.page ?? 1) * 30 >= (topics.data?.total ?? 0)
                    }
                    onClick={() => change({ page: (search.page ?? 1) + 1 })}
                  >
                    下一页
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
        <aside className='sf-right-rail'>
          <section className='sf-rail-card sf-community-card'>
            <SkyObservatory />
            <span className='sf-rail-kicker'>COMMUNITY</span>
            <h2>一个账号，更多连接。</h2>
            <p>现有 skymoni 账号即可参与。把经验留下，把好作品分享给更多人。</p>
            <div className='sf-community-stats'>
              <div>
                <strong>
                  <CommunityNumber value={meta.data?.stats.topics ?? 0} />
                </strong>
                <span>讨论话题</span>
              </div>
              <div>
                <strong>
                  <CommunityNumber value={visibleWorks.length} />
                </strong>
                <span>公开作品</span>
              </div>
            </div>
            <Button
              variant='outline'
              render={
                <Link to={user ? '/creators/workspace' : '/creators/join'} />
              }
            >
              {user ? '进入创作者工作台' : '成为创作者'} <ArrowRight />
            </Button>
          </section>
          <section className='sf-rail-card'>
            <h2>探索社区</h2>
            {categories.slice(0, 6).map((board) => (
              <Link
                key={board.id}
                className='sf-rail-category'
                to='/creators'
                search={{ category: board.id }}
              >
                <i style={{ backgroundColor: board.color }} />
                <span>
                  {board.name}
                  <small>{board.description}</small>
                </span>
                <ArrowRight />
              </Link>
            ))}
          </section>
          <section className='sf-rail-card'>
            <h2>创作不止于讨论</h2>
            <p>
              作品编辑、GitHub
              导入、软件版本、附件和首页展示，都在创作者工作台。
            </p>
            <Link className='sf-text-link' to='/creators/workspace'>
              前往工作台 <ArrowUpRight />
            </Link>
          </section>
        </aside>
      </div>
    </main>
  )
}
