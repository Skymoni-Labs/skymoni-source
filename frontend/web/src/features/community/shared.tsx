import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/user-avatar'
import {
  CommunityAccessDescription,
  CommunitySignupLabel,
} from '@/features/community/access-copy'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { publicNickname } from '@/lib/public-nickname'
import { accountIdentity } from '@/lib/site-identity'
import { useAuthStore } from '@/stores/auth-store'

import type { CommunityAuthor } from './types'

export function MemberAvatar(props: {
  author: CommunityAuthor
  small?: boolean
}) {
  const author = useMemberIdentity(props.author)
  return (
    <UserAvatar
      setting={{ avatar: author.avatar }}
      name={author.name}
      className={`sf-avatar${props.small ? ' sf-avatar-small' : ''}`}
    />
  )
}

function useMemberIdentity(author: CommunityAuthor): CommunityAuthor {
  const user = useAuthStore((state) => state.auth.user)
  return user?.id === author.id
    ? accountIdentity(user)
    : { ...author, name: publicNickname(author.name) }
}

export function MemberName({ author }: { author: CommunityAuthor }) {
  return useMemberIdentity(author).name
}

export function CommunityNumber(props: { value: number }) {
  const { i18n } = useTranslation()
  return (
    <>
      {formatNumber(
        props.value,
        toIntlLocale(i18n.resolvedLanguage || i18n.language)
      )}
    </>
  )
}

export function CommunityTime(props: { timestamp: number; short?: boolean }) {
  const { i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const date = new Date(props.timestamp * 1000)
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString(locale)}>
      {date.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        ...(props.short ? {} : { year: 'numeric' }),
      })}
    </time>
  )
}

export function CommunitySignIn(props: { redirect?: string }) {
  return (
    <section className='sf-state'>
      <h2>免费加入社区，一起交流</h2>
      <p>
        <CommunityAccessDescription>
          注册后即可发帖、回复、点赞和收藏，无需充值、兑换码或创作者资格。
        </CommunityAccessDescription>
      </p>
      <Button
        render={
          <Link
            to='/sign-up'
            search={{ redirect: props.redirect ?? '/creators' }}
          />
        }
      >
        <CommunitySignupLabel />
      </Button>
      <Button
        variant='ghost'
        render={
          <Link
            to='/sign-in'
            search={{ redirect: props.redirect ?? '/creators' }}
          />
        }
      >
        已有账号，登录
      </Button>
    </section>
  )
}
