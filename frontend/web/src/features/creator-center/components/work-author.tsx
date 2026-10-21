import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { publicNickname } from '@/lib/public-nickname'
import { accountIdentity } from '@/lib/site-identity'
import { useAuthStore } from '@/stores/auth-store'
import { useCreatorAccessStore } from '@/stores/creator-access-store'

import { loadPublicCreatorProfile } from '../api'
import type { Work } from '../types'

export function WorkAuthor({
  work,
  panel = false,
}: {
  work: Work
  panel?: boolean
}) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const userId = user?.id
  const creator = useCreatorAccessStore((s) => s.mode === 'creator')
  const own = !work.sample && creator && work.ownerId === userId
  const validOwner =
    !work.sample &&
    Number.isSafeInteger(work.ownerId) &&
    (work.ownerId ?? 0) > 0
  const profile = useQuery({
    queryKey: ['creator-public-profile', String(work.ownerId)],
    queryFn: ({ signal }) =>
      loadPublicCreatorProfile(work.ownerId ?? 0, signal),
    enabled: validOwner && !own,
    staleTime: 30_000,
    retry: false,
  })
  const name = publicNickname(
    (own && user ? accountIdentity(user).name : profile.data?.profile.name) ||
      work.author
  )
  const avatar =
    own && user ? accountIdentity(user).avatar : profile.data?.avatar
  const image =
    avatar && /^data:image\/(?:jpeg|png);base64,/.test(avatar) ? avatar : ''
  const content = (
    <>
      <span
        className={`cc-avatar ${panel ? 'cc-author-avatar' : ''} cc-avatar-${work.style}`}
      >
        {work.sample ? (
          name.slice(0, 1)
        ) : (
          <img src={image || '/skymoni-avatar.png'} alt='' />
        )}
      </span>
      {panel ? (
        <h2>{name}</h2>
      ) : (
        <span>
          {name}
          {work.sample && ` · ${t('Example creator')}`}
        </span>
      )}
    </>
  )
  return validOwner ? (
    <Link
      to='/creators/people/$creatorId'
      params={{ creatorId: String(work.ownerId) }}
      className={`cc-work-author ${panel ? 'cc-work-author-panel' : ''}`}
      aria-label={`${t('Creator profile')} · ${name}`}
    >
      {content}
    </Link>
  ) : (
    <span className={`cc-work-author ${panel ? 'cc-work-author-panel' : ''}`}>
      {content}
    </span>
  )
}
