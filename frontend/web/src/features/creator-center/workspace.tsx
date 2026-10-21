import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CirclePlus,
  Clock3,
  FileText,
  Globe,
  Home,
  Layers3,
  Package,
  Search,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { IconGithub } from '@/assets/brand-icons/icon-github'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useCreatorHubStore } from '@/stores/creator-hub-store'
import { useCreatorStore } from '@/stores/creator-store'

import { CreatorAttachments } from './attachments'
import { ProjectRows } from './components/project-rows'
import { WorkCard } from './components/shared'
import { DistributionPanel } from './distribution'
import { CreatorGitHubConnect } from './github-connect'
import { CreatorHomepagePanel } from './home-panel'
import { publicShowcaseWorks } from './lib/showcase'

type WorkspaceTab =
  | 'overview'
  | 'projects'
  | 'distribution'
  | 'saved'
  | 'github'
  | 'homepage'
const sections = [
  { id: 'overview', label: 'Workspace overview', icon: Home },
  { id: 'projects', label: 'My projects', icon: Layers3 },
  { id: 'distribution', label: 'Software submissions', icon: Package },
  { id: 'github', label: 'GitHub import', icon: IconGithub },
  { id: 'homepage', label: '首页展示卡片', icon: Sparkles },
  { id: 'saved', label: '收藏的作品', icon: Bookmark },
] as const

export function CreatorWorkspace({ tab = 'overview' }: { tab?: WorkspaceTab }) {
  const { t } = useTranslation()
  const tabsRef = useRef<HTMLElement>(null)
  useEffect(() => {
    tabsRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [tab])
  const works = useCreatorStore((state) => state.works)
  const published = useCreatorStore((state) => state.published)
  const saved = useCreatorStore((state) => state.saved)
  const releases = useCreatorHubStore((state) => state.releases)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const recent = [...works].sort((a, b) => b.updatedAt - a.updatedAt)
  const filtered = recent.filter(
    (work) =>
      (status === 'all' || work.status === status) &&
      (!search.trim() ||
        [work.title, work.summary, work.tags].some((value) =>
          value.toLowerCase().includes(search.trim().toLowerCase())
        ))
  )
  const collection = [
    ...new Map(
      [...works, ...published]
        .filter((work) => !work.sample && saved.includes(work.id))
        .map((work) => [work.id, work])
    ).values(),
  ]
  const inspiration = publicShowcaseWorks(published).slice(0, 2)
  return (
    <main className='cc-main ch-main'>
      <div className='cc-shell ch-shell'>
        <div className='ch-workspace-layout'>
          <nav
            ref={tabsRef}
            className='sf-workspace-tabs'
            aria-label={t('Workspace sections')}
          >
            {sections.map((section) => (
              <Link
                key={section.id}
                to='/creators/workspace'
                search={{ tab: section.id }}
                aria-current={tab === section.id ? 'page' : undefined}
              >
                <section.icon aria-hidden />
                {t(section.label)}
                {section.id === 'projects' && <small>{works.length}</small>}
                {section.id === 'distribution' && (
                  <small>{releases.length}</small>
                )}
              </Link>
            ))}
            <Button
              className='sf-primary'
              render={<Link to='/creators/studio' />}
            >
              <CirclePlus />
              {t('New project')}
            </Button>
          </nav>
          <div className='ch-workspace-content'>
            {tab === 'github' && <CreatorGitHubConnect />}
            {tab === 'overview' && (
              <>
                <header className='ch-workspace-welcome'>
                  <div>
                    <span className='cc-eyebrow'>YOUR CREATIVE WORKSPACE</span>
                    <h1>
                      <span>{t('Make something')}</span>{' '}
                      <span>{t('worth sharing.')}</span>
                    </h1>
                    <p>
                      {t(
                        'Keep your projects, updates and inspiration in one place.'
                      )}
                    </p>
                  </div>
                  <img
                    src='/branding/skymoni-cloud-friend-transparent.png'
                    alt=''
                  />
                </header>
                <div className='cg-overview-link'>
                  <IconGithub aria-hidden />
                  <span>{t('Already building on GitHub?')}</span>
                  <Link to='/creators/workspace' search={{ tab: 'github' }}>
                    {t('Import a repository')}
                    <ArrowRight aria-hidden />
                  </Link>
                </div>
                <div className='ch-workspace-body'>
                  <div>
                    <section className='ch-create-panel'>
                      <span className='ch-kicker'>
                        <Sparkles aria-hidden />
                        {t('What would you like to make?')}
                      </span>
                      <h2>{t('A small idea. A new beginning.')}</h2>
                      <p>
                        {t(
                          'Start with a website, a useful tool, a story, or something entirely your own.'
                        )}
                      </p>
                      <div className='ch-quick-create'>
                        {[
                          {
                            category: 'website',
                            label: 'Website & portfolio',
                            icon: Globe,
                          },
                          {
                            category: 'software',
                            label: 'Software & tool',
                            icon: Package,
                          },
                          {
                            category: 'design',
                            label: 'Design & resources',
                            icon: Layers3,
                          },
                          {
                            category: 'article',
                            label: 'Article & tutorial',
                            icon: FileText,
                          },
                        ].map((item) => (
                          <Link
                            key={item.category}
                            to='/creators/studio'
                            search={{
                              category: item.category as
                                | 'website'
                                | 'software'
                                | 'design'
                                | 'article',
                            }}
                          >
                            <item.icon aria-hidden />
                            {t(item.label)}
                            <ArrowUpRight aria-hidden />
                          </Link>
                        ))}
                      </div>
                    </section>
                    <div className='ch-section-title'>
                      <h2>
                        <Clock3 aria-hidden />
                        {t('Recently edited')}
                      </h2>
                      <Link
                        to='/creators/workspace'
                        search={{ tab: 'projects' }}
                      >
                        {t('All projects')}
                        <ArrowRight aria-hidden />
                      </Link>
                    </div>
                    {recent.length ? (
                      <ProjectRows works={recent.slice(0, 4)} editable />
                    ) : (
                      <EmptyState
                        icon={Layers3}
                        title={t('Your first project starts with an idea')}
                        description={t(
                          'Choose a starting point above. Your drafts will appear here.'
                        )}
                      />
                    )}
                    {inspiration.length > 0 && (
                      <>
                        <div className='ch-section-title'>
                          <h2>
                            <Bookmark aria-hidden />
                            {t('A little inspiration')}
                          </h2>
                          <Link to='/creators/explore'>
                            {t('Find projects')}
                            <ArrowRight aria-hidden />
                          </Link>
                        </div>
                        <div className='ch-inspiration-grid'>
                          {inspiration.map((work) => (
                            <WorkCard key={work.id} work={work} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <aside className='ch-workspace-rail'>
                    <section className='ch-panel'>
                      <h2>{t('Your creative space')}</h2>
                      <div className='ch-stats-grid'>
                        {[
                          {
                            label: 'My projects',
                            value: works.length,
                            icon: Layers3,
                          },
                          {
                            label: 'Draft',
                            value: works.filter((w) => w.status === 'draft')
                              .length,
                            icon: FileText,
                          },
                          {
                            label: 'Submission previews',
                            value: works.filter((w) => w.status === 'review')
                              .length,
                            icon: Send,
                          },
                          {
                            label: '收藏的作品',
                            value: saved.length,
                            icon: Bookmark,
                          },
                        ].map((item) => (
                          <div key={item.label}>
                            <item.icon aria-hidden />
                            <strong>{item.value}</strong>
                            <span>{t(item.label)}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className='ch-panel ch-profile-nudge'>
                      <div className='ch-mini-orbit'>
                        <UserRound aria-hidden />
                      </div>
                      <h2>{t('Give your work a home.')}</h2>
                      <p>
                        {t(
                          'Add your introduction and pin the projects you want people to notice first.'
                        )}
                      </p>
                      <Link to='/creators/profile'>
                        {t('Customize my profile')}
                        <ArrowRight aria-hidden />
                      </Link>
                    </section>
                    <section className='ch-panel'>
                      <span className='ch-outline-badge'>
                        {t('Platform review')}
                      </span>
                      <h2>{t('From a project to a software release')}</h2>
                      <ol className='ch-mini-timeline'>
                        <li>
                          <strong>{t('Create a software project')}</strong>
                          <span>
                            {t(
                              'Introduce the features and show the interface.'
                            )}
                          </span>
                        </li>
                        <li>
                          <strong>{t('Prepare a version')}</strong>
                          <span>
                            {t(
                              'Add a package or download link and release notes.'
                            )}
                          </span>
                        </li>
                        <li>
                          <strong>{t('Submit for review')}</strong>
                          <span>
                            {t(
                              'An administrator decides what appears in the software center.'
                            )}
                          </span>
                        </li>
                      </ol>
                      <Link
                        to='/creators/workspace'
                        search={{ tab: 'distribution' }}
                      >
                        {t('Software submissions')}
                        <ArrowRight aria-hidden />
                      </Link>
                    </section>
                  </aside>
                </div>
              </>
            )}
            {tab === 'projects' && (
              <>
                <header className='ch-page-heading'>
                  <span className='cc-eyebrow'>YOUR PROJECTS</span>
                  <h1>
                    {t('My projects')} <small>{works.length}</small>
                  </h1>
                  <p>
                    {t(
                      'Find a draft, continue creating, or prepare your next update.'
                    )}
                  </p>
                </header>
                <div className='ch-list-toolbar'>
                  <label className='ch-search'>
                    <Search aria-hidden />
                    <Input
                      aria-label={t('Search my projects')}
                      placeholder={t('Search my projects')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <NativeSelect
                    aria-label={t('Project status')}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value='all'>{t('All statuses')}</option>
                    <option value='published'>{t('Published')}</option>
                    <option value='draft'>{t('Draft')}</option>
                    <option value='review'>{t('Pending review')}</option>
                  </NativeSelect>
                  <Button
                    className='cc-primary'
                    render={<Link to='/creators/studio' />}
                  >
                    <CirclePlus aria-hidden />
                    {t('New project')}
                  </Button>
                </div>
                {filtered.length ? (
                  <ProjectRows works={filtered} editable pinnable />
                ) : (
                  <EmptyState
                    icon={Search}
                    title={t('No matching projects')}
                    description={t(
                      'Try another keyword or create a new project.'
                    )}
                  />
                )}
              </>
            )}
            {tab === 'saved' && (
              <>
                <header className='ch-page-heading'>
                  <span className='cc-eyebrow'>
                    COLLECT A LITTLE INSPIRATION
                  </span>
                  <h1>{t('收藏的作品')}</h1>
                  <p>{t('Good ideas you saved, ready when you need them.')}</p>
                </header>
                {collection.length ? (
                  <ProjectRows works={collection} />
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
                )}
              </>
            )}
            {tab === 'homepage' && <CreatorHomepagePanel />}
            {tab === 'distribution' && (
              <>
                <DistributionPanel />
                <CreatorAttachments />
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
