import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Bell, CheckCheck, Heart, MessageCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { handleServerError } from '@/lib/handle-server-error'
import { publicNickname } from '@/lib/public-nickname'
import { useAuthStore } from '@/stores/auth-store'

import { communityRequest, loadCommunityNotifications } from './api'
import { CommunityTime } from './shared'

function notificationAction(item: { kind: string; workId?: string }) {
  if (item.kind === 'like') return '赞了你的内容'
  if (item.workId) return '评论了作品或回复了评论'
  return '回复了你的话题'
}

export function CommunityNotifications() {
  const auth = useAuthStore((state) => state.auth)
  const client = useQueryClient()
  const key = ['community-notifications', auth.user?.id, auth.session?.sid]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadCommunityNotifications(signal),
    enabled: !!auth.user,
    refetchInterval: 45000,
    retry: false,
  })
  const mark = useMutation({
    mutationFn: () =>
      communityRequest('/me/notifications', { method: 'put', data: {} }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key })
    },
    onError: handleServerError,
  })
  const unread = query.data?.filter((item) => !item.read).length ?? 0
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant='ghost'
            size='icon'
            aria-label={`社区通知${unread ? `，${unread} 条未读` : ''}`}
          />
        }
      >
        <Bell />
        <span className='sf-notification-dot' hidden={!unread} />
      </PopoverTrigger>
      <PopoverContent className='sf-notifications' align='end'>
        <div className='sf-panel-heading'>
          <strong>社区通知 {unread > 0 && <small>{unread}</small>}</strong>
          <Button
            size='sm'
            variant='ghost'
            disabled={!unread || mark.isPending}
            onClick={() => mark.mutate()}
          >
            <CheckCheck />
            全部已读
          </Button>
        </div>
        {query.isPending && (
          <p role='status' className='sf-loading'>
            正在加载通知…
          </p>
        )}
        {query.isError && (
          <div className='sf-notice-empty' role='alert'>
            <Bell />
            <strong>通知暂时无法加载</strong>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                void query.refetch()
              }}
            >
              重试
            </Button>
          </div>
        )}
        {query.data?.length === 0 && (
          <div className='sf-notice-empty'>
            <Bell />
            <strong>新的交流，值得期待</strong>
            <p>收到的回复和点赞会出现在这里。</p>
          </div>
        )}
        {query.data?.map((item) => (
          <Link
            key={item.id}
            {...(item.workId
              ? {
                  to: '/creators/works/$workId' as const,
                  params: { workId: item.workId },
                  hash: 'work-comments',
                }
              : {
                  to: '/creators/topics/$topicId' as const,
                  params: { topicId: item.topicId },
                })}
            className={item.read ? 'sf-notice-row' : 'sf-notice-row sf-unread'}
          >
            <span className='sf-notice-icon'>
              {item.kind === 'like' ? <Heart /> : <MessageCircle />}
            </span>
            <span className='sf-notice-content'>
              <span>
                {publicNickname(item.actor)} {notificationAction(item)}
              </span>
              <strong>{item.title}</strong>
              <CommunityTime timestamp={item.createdAt} short />
            </span>
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  )
}
