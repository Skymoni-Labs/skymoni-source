import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Compass,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { NativeSelect } from '@/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCreatorAccessStore } from '@/stores/creator-access-store'
import { useCreatorStore } from '@/stores/creator-store'

import { SkyObservatory } from '../community/sky-decorations'
import { WorkCard } from './components/shared'
import { Spotlight, TopicCollection } from './components/showcase'
import { CreatorHomeShowcase } from './home-showcase'
import { filterProjects } from './lib/hub'
import { publicShowcaseWorks } from './lib/showcase'
import {
  defaultShowcaseLayout,
  orderedShowcaseWorks,
  showcaseSlots,
} from './lib/showcase-layout'
import { categories } from './types'

export function CreatorGallery() {
  const { t } = useTranslation()
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('discover')
  const [sort, setSort] = useState('selected')
  const saved = useCreatorStore((state) => state.saved)
  const isCreator = useCreatorAccessStore((state) => state.mode === 'creator')
  const projects = useRef<HTMLElement>(null)
  const jumpToCollection = useRef(false)
  useEffect(() => {
    if (jumpToCollection.current) {
      projects.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      jumpToCollection.current = false
    }
  }, [category, search, view])
  const published = useCreatorStore((state) => state.published)
  const showcase = useCreatorStore((state) => state.showcase)
  const all = useMemo(
    () =>
      orderedShowcaseWorks(
        publicShowcaseWorks(published),
        showcase?.orderedIds ?? []
      ),
    [published, showcase]
  )
  const highlights = showcaseSlots(all, showcase ?? defaultShowcaseLayout())
  const works = useMemo(
    () =>
      filterProjects(
        all,
        {
          search,
          category,
          source: 'all',
          linked: false,
          attached: false,
          sort,
        },
        t
      ).filter((work) => view !== 'saved' || saved.includes(work.id)),
    [all, saved, category, search, view, sort, t]
  )
  const browsing = view === 'discover' && category === 'all' && !search.trim()
  let collectionNote = 'Creator project'
  if (view === 'saved') collectionNote = 'Bookmarks stay in this browser.'
  function reset() {
    setSearch('')
    setCategory('all')
    setView('discover')
  }
  function chooseTopic(value: string) {
    jumpToCollection.current = true
    setCategory(value)
    setSearch('')
    setView('discover')
  }
  return (
    <main className='cc-main cs-showcase'>
      <div className='cc-shell cs-shell'>
        <header className='cs-discover-header'>
          <div>
            <span className='cc-eyebrow'>
              <span />
              CREATED WITH CURIOSITY
            </span>
            <h1>
              {t('Discover something')} <em>{t('worth exploring.')}</em>
            </h1>
            <p>
              {t(
                'Useful tools, thoughtful websites, beautiful details. Meet the projects behind the ideas.'
              )}
            </p>
          </div>
          <SkyObservatory />
          <div className='cs-discover-search'>
            <InputGroup>
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('Search projects, tags or creators')}
                aria-label={t('Search projects, tags or creators')}
              />
              <InputGroupAddon align='inline-end'>
                {search ? (
                  <Button
                    variant='ghost'
                    size='icon-xs'
                    aria-label={t('Clear search')}
                    onClick={() => setSearch('')}
                  >
                    <X aria-hidden />
                  </Button>
                ) : (
                  <span className='cs-search-hint'>⌕</span>
                )}
              </InputGroupAddon>
            </InputGroup>
            <span>
              {t('Start with an idea:')}{' '}
              {['Portfolio', 'Figma', 'AI'].map((term) => (
                <button
                  key={term}
                  type='button'
                  onClick={() => {
                    setSearch(term)
                    setCategory('all')
                    setView('discover')
                  }}
                >
                  #{term}
                </button>
              ))}
            </span>
          </div>
        </header>
        {browsing && (
          <>
            {(showcase?.enabled ?? true) && highlights[0] && (
              <section
                className='cs-spotlight-grid'
                aria-label={t('Project spotlight')}
              >
                <Spotlight work={highlights[0]} primary />
                <div className='cs-spotlight-stack'>
                  {highlights
                    .slice(1)
                    .map((work) =>
                      work ? <Spotlight key={work.id} work={work} /> : null
                    )}
                </div>
              </section>
            )}
            <TopicCollection onChoose={chooseTopic} />
          </>
        )}
        <section
          className='cc-explore cs-collection'
          id='projects'
          ref={projects}
          aria-label={t('Project gallery')}
        >
          <div className='cc-explore-heading cs-collection-heading'>
            <div>
              <span className='cc-eyebrow'>THE COMMUNITY COLLECTION</span>
              <h2>
                {t(
                  view === 'saved'
                    ? 'Your inspiration shelf'
                    : 'Good ideas, in good company.'
                )}
              </h2>
            </div>
            <ToggleGroup
              value={[view]}
              onValueChange={(values) => {
                if (values[0]) setView(String(values[0]))
              }}
              spacing={1}
              aria-label={t('Project collection')}
            >
              <ToggleGroupItem value='discover'>
                <Compass aria-hidden />
                {t('Discover projects')}
              </ToggleGroupItem>
              <ToggleGroupItem value='saved'>
                <Bookmark aria-hidden />
                {t('Saved')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className='cs-collection-toolbar'>
            <div className='cc-category-scroll'>
              <ToggleGroup
                spacing={2}
                value={[category]}
                onValueChange={(values) => {
                  if (values[0]) setCategory(String(values[0]))
                }}
                aria-label={t('Project category')}
              >
                {categories.map((item) => (
                  <ToggleGroupItem key={item.id} value={item.id}>
                    {t(item.label)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <NativeSelect
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label={t('Sort projects')}
            >
              <option value='selected'>{t('Curated order')}</option>
              <option value='recent'>{t('Recently updated')}</option>
            </NativeSelect>
          </div>
          <p className='cc-result-note' aria-live='polite'>
            <span>
              {t('Showing {{count}} projects', { count: works.length })}
              {search.trim() && <strong> · “{search.trim()}”</strong>}
            </span>
            <span>{t(collectionNote)}</span>
          </p>
          {works.length > 0 ? (
            <div className='cc-work-grid cs-work-grid'>
              {works.map((work) => (
                <WorkCard key={work.id} work={work} showTags />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Search}
              title={t(
                view === 'saved'
                  ? 'Your inspiration collection starts here'
                  : 'No matching projects'
              )}
              description={t(
                view === 'saved'
                  ? 'Save projects with the bookmark button, then find them here.'
                  : 'Try another keyword or explore a different category.'
              )}
              action={
                <Button variant='outline' onClick={reset}>
                  {t('Explore everything')}
                </Button>
              }
            />
          )}
          <div className='cs-browse-more'>
            <span>{t('Looking for something specific?')}</span>
            <Link to='/creators/explore'>
              {t('Open advanced project search')}
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>
        {browsing && <CreatorHomeShowcase />}
        <section className='cs-creator-invite'>
          <img src='/branding/skymoni-cloud-friend-transparent.png' alt='' />
          <div>
            <span className='cc-eyebrow'>MAKE YOUR NEXT THING</span>
            <h2>{t('Your next project could be here.')}</h2>
            <p>
              {t(
                isCreator
                  ? 'Bring a new idea to your workspace and give it a place to shine.'
                  : 'Browse without an account. Activate your creator identity when you are ready to share.'
              )}
            </p>
          </div>
          <Button
            className='cc-primary'
            render={
              <Link to={isCreator ? '/creators/studio' : '/creators/join'} />
            }
          >
            {t(
              isCreator ? 'Create a project' : 'Learn about creator activation'
            )}
            <ArrowUpRight aria-hidden />
          </Button>
        </section>
      </div>
    </main>
  )
}
