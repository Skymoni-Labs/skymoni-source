import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { isAxiosError } from 'axios'
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Globe,
  Layers3,
  Pin,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { publicNickname } from '@/lib/public-nickname'
import { useAuthStore } from '@/stores/auth-store'

import { loadPublicCreatorProfile } from './api'
import { WorkCard } from './components/shared'
import { isSafeProjectUrl } from './lib/schema'
import { publicShowcaseWorks } from './lib/showcase'

import '@/styles/creator-public-profile.css'

export function CreatorPublicProfilePage({ creatorId }: { creatorId: string }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const currentUserId = useAuthStore((state) => state.auth.user?.id)
  const id = Number(creatorId)
  const validId = Number.isSafeInteger(id) && id > 0
  const query = useQuery({
    queryKey: ['creator-public-profile', creatorId],
    queryFn: ({ signal }) => loadPublicCreatorProfile(id, signal),
    enabled: validId,
    staleTime: 30_000,
    retry: false,
  })
  const data = query.data
  const unavailable = !data && (!validId || !query.isPending)
  if (!data) {
    return (
      <main className='cc-main ch-main'>
        <div className='cc-shell ch-shell'>
          <div
            className='ch-empty-inline'
            role={unavailable ? 'alert' : 'status'}
          >
            <h1>{unavailable ? '创作者主页暂不可用' : t('Loading...')}</h1>
            {unavailable && <p>该创作者不存在或暂未公开。</p>}
            {query.isError &&
              (!isAxiosError(query.error) ||
                query.error.response?.status !== 404) && (
                <Button variant='outline' onClick={() => void query.refetch()}>
                  {t('Retry')}
                </Button>
              )}
            <Link to='/creators'>{t('Back to projects')}</Link>
          </div>
        </div>
      </main>
    )
  }
  const { profile, pinned, avatar } = data
  const works = publicShowcaseWorks(data.works)
  const name = publicNickname(profile.name)
  const highlights = pinned.flatMap((workId) =>
    works.filter((work) => work.id === workId)
  )
  const filtered = works.filter((work) =>
    [work.title, work.summary, work.tags].some((value) =>
      value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    )
  )
  const featured = highlights.length ? highlights : works.slice(0, 6)
  const isOwner = currentUserId === data.userId
  return (
    <main className='cc-main ch-main ch-public-profile'>
      <div className='cc-shell ch-shell'>
        <div className='ch-profile-tabs' aria-label='创作者主页栏目'>
          <button
            type='button'
            aria-pressed={tab === 'overview'}
            onClick={() => setTab('overview')}
          >
            <BookOpen aria-hidden />
            主页概览
          </button>
          <button
            type='button'
            aria-pressed={tab === 'projects'}
            onClick={() => setTab('projects')}
          >
            <Layers3 aria-hidden />
            公开作品 <small>{works.length}</small>
          </button>
          <span>创作者公开主页</span>
        </div>
        <div className='ch-profile-layout'>
          <aside className='ch-profile-sidebar'>
            <div className='ch-profile-portrait'>
              <div className='ch-portrait-orbit' />
              <img
                className='ch-public-avatar'
                src={avatar || '/skymoni-avatar.png'}
                alt={`${name}的头像`}
              />
              <span aria-hidden>✦</span>
            </div>
            <h1>{name}</h1>
            <p>{profile.bio || '每一份作品背后，都有一个爱创造的人。'}</p>
            {isOwner && (
              <Button
                variant='outline'
                render={<Link to='/creators/profile' />}
              >
                编辑个人主页
              </Button>
            )}
            {isSafeProjectUrl(profile.website) && (
              <a
                className='ch-profile-website'
                href={profile.website}
                target='_blank'
                rel='noopener noreferrer'
              >
                <Globe aria-hidden />
                {new URL(profile.website).hostname}
                <ArrowUpRight aria-hidden />
              </a>
            )}
            <div className='ch-profile-counts'>
              <span>
                <Layers3 aria-hidden />
                <strong>{works.length}</strong> 件公开作品
              </span>
            </div>
            <Link to='/creators'>
              <ArrowLeft aria-hidden />
              返回创作者中心
            </Link>
          </aside>
          <div className='ch-profile-content'>
            {tab === 'overview' && (
              <>
                <section className='ch-profile-readme'>
                  <div>
                    <BookOpen aria-hidden />
                    <span>{name} / 介绍</span>
                  </div>
                  <section>
                    <span className='cc-eyebrow'>HELLO, CREATIVE WORLD</span>
                    <h2>把热爱，变成可以分享的作品。</h2>
                    <p className='ch-public-introduction'>
                      {profile.introduction ||
                        '欢迎来到我的创作空间。网站、工具、设计和一些小实验，每件作品都有自己的故事。'}
                    </p>
                    <div className='ch-profile-signature'>
                      <img
                        src='/branding/skymoni-cloud-friend-transparent.png'
                        alt=''
                      />
                      <span>MADE WITH CURIOSITY · SKYMONI</span>
                    </div>
                  </section>
                </section>
                <div className='ch-section-title'>
                  <h2>
                    <Pin aria-hidden />
                    {highlights.length ? '置顶作品' : '最近作品'}
                  </h2>
                  <Button variant='ghost' onClick={() => setTab('projects')}>
                    全部作品 <ArrowUpRight aria-hidden />
                  </Button>
                </div>
                {featured.length ? (
                  <div className='ch-pinned-grid'>
                    {featured.map((work) => (
                      <WorkCard key={work.id} work={work} />
                    ))}
                  </div>
                ) : (
                  <div className='ch-empty-inline'>
                    <Layers3 aria-hidden />
                    <strong>作品正在路上</strong>
                    <p>创作者暂时还没有公开发布的作品，稍后再来看看。</p>
                  </div>
                )}
              </>
            )}
            {tab === 'projects' && (
              <>
                <div className='ch-profile-project-search'>
                  <Input
                    aria-label='搜索该创作者的作品'
                    placeholder='搜索该创作者的作品…'
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                {filtered.length ? (
                  <div className='ch-pinned-grid'>
                    {filtered.map((work) => (
                      <WorkCard key={work.id} work={work} />
                    ))}
                  </div>
                ) : (
                  <div className='ch-empty-inline'>
                    <strong>
                      {works.length ? '没有找到匹配作品' : '作品正在路上'}
                    </strong>
                    <p>
                      {works.length
                        ? '试试其他关键词。'
                        : '创作者暂时还没有公开发布的作品。'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
