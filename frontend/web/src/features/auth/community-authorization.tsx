import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Check, ShieldCheck, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/user-avatar'
import { CommunityAdmissionFields } from '@/features/community/access-policy'
import { api, getFreshAuthHeaders } from '@/lib/api'
import { applyAuthBundle as applyCommunityBundle } from '@/lib/community-auth-session'
import {
  readCommunityInvite,
  clearCommunityInvite,
} from '@/lib/community-invite'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { accountIdentity } from '@/lib/site-identity'
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

import './community-authorization.css'

export function CommunityAuthorization({ returnTo }: { returnTo: string }) {
  const auth = useAuthStore((state) => state.auth),
    navigate = useNavigate()
  const identity = auth.user ? accountIdentity(auth.user) : null
  const approve = useMutation({
    mutationFn: async () => {
      const headers = await getFreshAuthHeaders()
      const response = await api.post<{
        success: boolean
        data: { bundle: AuthBundle; returnTo: string }
      }>(
        '/api/user/community/authorize',
        { approved: true, userId: auth.user?.id, returnTo },
        {
          headers: {
            ...headers,
            'X-Skymoni-Community-Invite': readCommunityInvite(),
          },
          authScope: 'relay',
          skipAuthRefresh: true,
          skipErrorHandler: true,
        }
      )
      return requireServerSuccess(response.data).data
    },
    onSuccess: (result) => {
      if (result.bundle.user.id !== useAuthStore.getState().auth.user?.id) {
        handleServerError(new Error('账号已变化，请重新确认'))
        return
      }
      applyCommunityBundle(result.bundle)
      clearCommunityInvite()
      void navigate({ href: result.returnTo, replace: true })
    },
    onError: handleServerError,
  })
  const authorizationReturn = `/community-authorize?returnTo=${encodeURIComponent(returnTo)}`
  return (
    <main className='sky-community-authorization'>
      <header>
        <Link to='/creators'>
          <img src='/skymoni-favicon.png' alt='' />
          skymoni 社区
        </Link>
        <span>站点账号 · 授权确认</span>
      </header>
      <section
        className='sky-community-authorization-card'
        aria-labelledby='community-authorization-title'
      >
        <div className='sky-authorization-apps'>
          <span>
            <ShieldCheck />
            中转站账号
          </span>
          <ArrowRight />
          <span>
            <img src='/skymoni-favicon.png' alt='' />
            skymoni 社区
          </span>
        </div>
        <h1 id='community-authorization-title'>使用中转站账号登录社区</h1>
        <p>确认使用同一个 skymoni 账号，继续在社区交流与创作。</p>
        {identity ? (
          <div className='sky-authorization-account'>
            <UserAvatar setting={auth.user?.setting} name={identity.name} />
            <div>
              <strong>{identity.name}</strong>
              <span>@{identity.username}</span>
            </div>
            <span className='sky-authorization-signed-in'>
              <Check />
              已登录
            </span>
          </div>
        ) : (
          <div className='sky-authorization-account'>
            <UserRound />
            <div>
              <strong>请先登录中转站账号</strong>
              <span>登录完成后将回到这里确认，无需另建社区账号。</span>
            </div>
          </div>
        )}
        <div className='sky-authorization-scopes'>
          <strong>社区将使用以下账号信息</strong>
          <ul>
            <li>
              <Check />
              账号标识，用于关联你的话题、回复和作品
            </li>
            <li>
              <Check />
              昵称与头像，与中转站个人资料保持同步
            </li>
          </ul>
          <p>
            账号资料通用，登录状态独立。退出社区或中转站，均不会退出另一边。
          </p>
        </div>
        <CommunityAdmissionFields force />
        {identity ? (
          <Button
            className='sky-authorization-confirm'
            disabled={approve.isPending}
            onClick={() => approve.mutate(undefined)}
          >
            <ShieldCheck />
            {approve.isPending ? '正在确认…' : '确认授权并进入社区'}
          </Button>
        ) : (
          <Link
            className='sky-authorization-confirm'
            to='/sign-in'
            search={{ redirect: authorizationReturn }}
          >
            登录中转站并继续
            <ArrowRight />
          </Link>
        )}
        {approve.isError && (
          <p role='alert'>
            确认未完成，当前页面已保留。请检查网络，或刷新页面后重新确认当前账号。
          </p>
        )}
        <Link className='sky-authorization-cancel' to='/creators'>
          暂不授权，返回社区浏览
        </Link>
        <footer>
          <ShieldCheck />由 skymoni 站点账号服务验证身份
        </footer>
      </section>
    </main>
  )
}
