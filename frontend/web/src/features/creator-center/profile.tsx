import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Clock3,
  Globe,
  Layers3,
  Pencil,
  Pin,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { accountIdentity } from '@/lib/site-identity'
import { useAuthStore } from '@/stores/auth-store'
import { useCreatorHubStore } from '@/stores/creator-hub-store'
import { useCreatorStore } from '@/stores/creator-store'

import { CreatorAvatar } from './components/creator-avatar'
import { CreatorProfileEditor } from './components/creator-profile-editor'
import { ProjectRows } from './components/project-rows'
import { WorkCard } from './components/shared'
import { isSafeProjectUrl } from './lib/schema'
import { publicationLabel } from './types'

export function CreatorProfilePage() {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const auth = useAuthStore((s) => s.auth)
  const works = useCreatorStore((state) => state.works)
  const published = useCreatorStore((state) => state.published)
  const saved = useCreatorStore((state) => state.saved)
  const storedProfile = useCreatorHubStore((state) => state.profile)
  const identity = auth.user ? accountIdentity(auth.user) : null
  const profile = identity
    ? { ...storedProfile, name: identity.name, avatar: identity.avatar }
    : storedProfile
  const pinned = useCreatorHubStore((state) => state.pinned)
  const saveProfile = useCreatorHubStore((state) => state.saveProfile)
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(false)
  const shown = works.filter((work) => work.settings?.listed !== false)
  const highlights = pinned
    .map((id) => shown.find((work) => work.id === id))
    .filter((work): work is (typeof works)[number] => Boolean(work))
  const collected = [
    ...new Map(
      [...works, ...published]
        .filter((work) => !work.sample && saved.includes(work.id))
        .map((work) => [work.id, work])
    ).values(),
  ]
  const filtered = shown.filter((work) =>
    [work.title, work.summary, work.tags].some((value) =>
      value.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    )
  )
  const name = profile.name || t('My creative space')
  return (
    <main className='cc-main ch-main'>
      <div className='cc-shell ch-shell'>
        <div className='ch-profile-tabs' aria-label={t('Profile sections')}>
          {[
            { id: 'overview', label: 'Profile overview', icon: BookOpen },
            {
              id: 'projects',
              label: 'My projects',
              icon: Layers3,
              count: shown.length,
            },
            {
              id: 'saved',
              label: '收藏的作品',
              icon: Bookmark,
              count: collected.length,
            },
          ].map((item) => (
            <button
              key={item.id}
              type='button'
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              <item.icon aria-hidden />
              {t(item.label)}
              {'count' in item && <small>{item.count}</small>}
            </button>
          ))}
          <span>{t('My profile preview')}</span>
        </div>
        <div className='ch-profile-layout'>
          <aside className='ch-profile-sidebar'>
            <CreatorAvatar avatar={profile.avatar} name={name} />
            <h1>{name}</h1>
            <p>
              {profile.bio ||
                t('A little about you, and the things you love making.')}
            </p>
            <Button variant='outline' onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              {t('Edit creator profile')}
            </Button>
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
                <strong>{shown.length}</strong> {t('projects')}
              </span>
              <span>
                <Bookmark aria-hidden />
                <strong>{saved.length}</strong> {t('saved ideas')}
              </span>
            </div>
            <div className='ch-profile-note'>
              <Pin aria-hidden />
              <p>
                {t(
                  'Pin up to six projects. Use the pin button in your project list to choose what appears first.'
                )}
              </p>
            </div>
            <Link to='/creators/workspace'>
              {t('Back to creative workspace')}
              <ArrowRight aria-hidden />
            </Link>
          </aside>
          <div className='ch-profile-content'>
            {tab === 'overview' && (
              <>
                <section className='ch-profile-readme'>
                  <div>
                    <BookOpen aria-hidden />
                    <span>
                      {name} / {t('Introduction')}
                    </span>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      aria-label={t('Edit creator profile')}
                      onClick={() => setEditing(true)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  </div>
                  <section>
                    <span className='cc-eyebrow'>HELLO, CREATIVE WORLD</span>
                    <h2>{t('A space for the things I make.')}</h2>
                    <p>
                      {profile.introduction ||
                        t(
                          'Welcome to my creative space. Websites, useful tools, design and small experiments — each project has a story of its own.'
                        )}
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
                    {t('Pinned projects')}
                  </h2>
                  <Button variant='ghost' onClick={() => setTab('projects')}>
                    {t('Choose pinned projects')}
                    <ArrowRight aria-hidden />
                  </Button>
                </div>
                {highlights.length ? (
                  <div className='ch-pinned-grid'>
                    {highlights.map((work) => (
                      <WorkCard key={work.id} work={work} />
                    ))}
                  </div>
                ) : (
                  <div className='ch-empty-inline'>
                    <Pin aria-hidden />
                    <strong>
                      {t('Choose the projects that feel most like you.')}
                    </strong>
                    <p>
                      {t(
                        'Your pinned projects will appear here, with larger covers and a short introduction.'
                      )}
                    </p>
                    <Button
                      variant='outline'
                      onClick={() => setTab('projects')}
                    >
                      {t('Choose pinned projects')}
                    </Button>
                  </div>
                )}
                <div className='ch-section-title'>
                  <h2>
                    <Clock3 aria-hidden />
                    {t('Recent creative activity')}
                  </h2>
                  <span className='ch-muted'>
                    {t('Based on your local project updates')}
                  </span>
                </div>
                <div className='ch-activity-list'>
                  {[...works]
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .slice(0, 5)
                    .map((work) => (
                      <Link
                        key={work.id}
                        to='/creators/works/$workId'
                        params={{ workId: work.id }}
                      >
                        <i />
                        <div>
                          <strong>{work.title || t('Untitled project')}</strong>
                          <span>{t(publicationLabel(work.status))}</span>
                        </div>
                        <time>
                          {new Date(work.updatedAt).toLocaleDateString(
                            toIntlLocale(i18n.language)
                          )}
                        </time>
                        <ArrowUpRight aria-hidden />
                      </Link>
                    ))}
                  {!works.length && (
                    <p className='ch-muted'>
                      {t('Your project updates will appear here.')}
                    </p>
                  )}
                </div>
              </>
            )}
            {tab === 'projects' && (
              <>
                <div className='ch-profile-project-search'>
                  <Input
                    aria-label={t('Search my projects')}
                    placeholder={t('Search my projects')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Link to='/creators/studio' className='ch-text-action'>
                    {t('New project')}
                    <ArrowUpRight aria-hidden />
                  </Link>
                </div>
                <p className='ch-muted'>
                  {t(
                    'Your private profile workspace. Only reviewed projects appear in the public showcase.'
                  )}
                </p>
                {filtered.length ? (
                  <ProjectRows works={filtered} editable pinnable />
                ) : (
                  <EmptyState
                    icon={Layers3}
                    title={t('No matching projects')}
                    description={t(
                      'Create a project to start your collection.'
                    )}
                  />
                )}
              </>
            )}
            {tab === 'saved' &&
              (collected.length ? (
                <ProjectRows works={collected} />
              ) : (
                <EmptyState
                  icon={Bookmark}
                  title={t('Your inspiration collection starts here')}
                  description={t(
                    'Save projects with the bookmark button, then find them here.'
                  )}
                  action={
                    <Button
                      variant='outline'
                      render={<Link to='/creators/explore' />}
                    >
                      {t('Find projects')}
                    </Button>
                  }
                />
              ))}
          </div>
        </div>
        {editing && (
          <CreatorProfileEditor
            profile={{ ...profile, name }}
            onSave={async (profile) => {
              const me = await saveProfile(profile)
              client.setQueryData(
                ['creator-me', auth.user?.id, auth.session?.sid],
                me
              )
              await Promise.all([
                client.invalidateQueries({ queryKey: ['creator-public'] }),
                client.invalidateQueries({
                  queryKey: ['creator-public-profile', String(auth.user?.id)],
                }),
                client.invalidateQueries({ queryKey: ['home-creator-public'] }),
              ])
            }}
            onClose={() => setEditing(false)}
          />
        )}
      </div>
    </main>
  )
}
