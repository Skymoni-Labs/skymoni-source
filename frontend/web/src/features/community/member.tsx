import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import { communityRequest } from './api'
import { CommunityTime, MemberAvatar, MemberName } from './shared'
import type { CommunityAuthor, Topic } from './types'

export function CommunityMember(props: { memberId: string }) {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const sid = useAuthStore((state) => state.auth.session?.sid)
  const query = useQuery({
    queryKey: ['community-member', props.memberId, userId, sid],
    queryFn: ({ signal }) =>
      communityRequest<{
        member: CommunityAuthor & { role: number }
        topics: Topic[]
        replies: number
      }>(`/members/${encodeURIComponent(props.memberId)}`, { signal }),
    retry: false,
  })
  if (query.isPending) {
    return (
      <p className='sf-state' role='status'>
        正在加载成员资料…
      </p>
    )
  }
  if (!query.data) {
    return (
      <div className='sf-state'>
        <h1>成员资料暂不可用</h1>
        <p>成员可能尚未加入社区，或服务暂时无法连接。</p>
        <Button
          variant='outline'
          onClick={() => {
            void query.refetch()
          }}
        >
          重试
        </Button>
        <Link to='/creators'>返回社区</Link>
      </div>
    )
  }
  const { member, topics } = query.data
  return (
    <main className='sf-moderation-page sf-member-page'>
      <header className='sf-member-header'>
        <MemberAvatar author={member} />
        <div>
          <h1>
            <MemberName author={member} />
          </h1>
          <p>
            @{member.username}
            {member.role === 100 ? ' · 社区管理员' : ' · 社区成员'}
          </p>
        </div>
      </header>
      {userId === member.id && (
        <Button variant='outline' render={<Link to='/profile' />}>
          编辑站点资料
        </Button>
      )}
      <div className='sf-member-stats'>
        <div>
          <strong>{topics.length}</strong>
          <span>最近公开话题</span>
        </div>
        <div>
          <strong>{query.data.replies}</strong>
          <span>参与回复</span>
        </div>
      </div>
      <section>
        <h2>发布的话题</h2>
        {!topics.length && (
          <div className='sf-state'>
            <h2>这里还没有公开话题</h2>
            <p>每一次分享，都是新的开始。</p>
            <Button variant='outline' render={<Link to='/creators' />}>
              浏览社区
            </Button>
          </div>
        )}
        {topics.map((topic) => (
          <article className='sf-report-card' key={topic.id}>
            <Link to='/creators/topics/$topicId' params={{ topicId: topic.id }}>
              {topic.title}
            </Link>
            <p>
              {topic.replies} 条回复 ·{' '}
              <CommunityTime timestamp={topic.createdAt} />
            </p>
          </article>
        ))}
      </section>
    </main>
  )
}
