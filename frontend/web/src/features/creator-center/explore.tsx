import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Compass,
  Filter,
  LayoutGrid,
  List,
  Search,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useCreatorStore } from '@/stores/creator-store'

import { ProjectRows } from './components/project-rows'
import { WorkCard } from './components/shared'
import { filterProjects, type ProjectFilter } from './lib/hub'
import { publicShowcaseWorks } from './lib/showcase'
import { categories } from './types'

const initial: ProjectFilter = {
  search: '',
  category: 'all',
  source: 'all',
  linked: false,
  attached: false,
  sort: 'selected',
}
export function CreatorExplore() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState(initial)
  const [display, setDisplay] = useState('list')
  const published = useCreatorStore((state) => state.published)
  const all = useMemo(() => publicShowcaseWorks(published), [published])
  const results = useMemo(
    () => filterProjects(all, filter, t),
    [all, filter, t]
  )
  function update<K extends keyof ProjectFilter>(
    key: K,
    value: ProjectFilter[K]
  ) {
    setFilter((current) => ({ ...current, [key]: value }))
  }
  const active =
    filter.category !== 'all' ||
    filter.source !== 'all' ||
    filter.linked ||
    filter.attached ||
    Boolean(filter.search)
  function renderResults() {
    if (!results.length) {
      return (
        <EmptyState
          icon={Search}
          title={t('No matching projects')}
          description={t(
            'Try another keyword or explore a different category.'
          )}
          action={
            <Button variant='outline' onClick={() => setFilter(initial)}>
              {t('Reset filters')}
            </Button>
          }
        />
      )
    }
    if (display === 'list') return <ProjectRows works={results} />
    return (
      <div className='ch-explore-card-grid'>
        {results.map((work) => (
          <WorkCard key={work.id} work={work} />
        ))}
      </div>
    )
  }
  return (
    <main className='cc-main ch-main'>
      <div className='cc-shell ch-shell'>
        <header className='ch-explore-header'>
          <div>
            <span className='cc-eyebrow'>DISCOVER SOMETHING GOOD</span>
            <h1>{t('Find your next inspiration.')}</h1>
            <p>
              {t(
                'A clearer way to explore websites, software, resources and ideas.'
              )}
            </p>
          </div>
          <label className='ch-search ch-explore-search'>
            <Search aria-hidden />
            <Input
              aria-label={t('Search projects, tags or creators')}
              placeholder={t('Search projects, tags or creators')}
              value={filter.search}
              onChange={(e) => update('search', e.target.value)}
            />
            {filter.search && (
              <Button
                variant='ghost'
                size='icon-xs'
                aria-label={t('Clear search')}
                onClick={() => update('search', '')}
              >
                <X aria-hidden />
              </Button>
            )}
          </label>
        </header>
        <div className='ch-explore-layout'>
          <aside className='ch-filter-sidebar'>
            <h2>
              <Filter aria-hidden />
              {t('Filter projects')}
            </h2>
            <div className='ch-filter-group'>
              <h3>{t('Project category')}</h3>
              {categories.map((category) => (
                <button
                  type='button'
                  key={category.id}
                  aria-pressed={filter.category === category.id}
                  onClick={() => update('category', category.id)}
                >
                  <i className={`ch-category-dot ch-dot-${category.id}`} />
                  <span>{t(category.label)}</span>
                  <small>
                    {
                      all.filter(
                        (work) =>
                          work.settings?.listed !== false &&
                          (category.id === 'all' ||
                            work.category === category.id)
                      ).length
                    }
                  </small>
                </button>
              ))}
            </div>
            <div className='ch-filter-group ch-filter-checks'>
              <h3>{t('Project includes')}</h3>
              <label>
                <input
                  type='checkbox'
                  checked={filter.linked}
                  onChange={(e) => update('linked', e.target.checked)}
                />
                {t('A visit link')}
              </label>
              <label>
                <input
                  type='checkbox'
                  checked={filter.attached}
                  onChange={(e) => update('attached', e.target.checked)}
                />
                {t('A downloadable attachment')}
              </label>
            </div>
            {active && (
              <Button variant='ghost' onClick={() => setFilter(initial)}>
                <X aria-hidden />
                {t('Reset filters')}
              </Button>
            )}
          </aside>
          <section
            className='ch-explore-results'
            aria-label={t('Project search results')}
          >
            <div className='ch-results-toolbar'>
              <span aria-live='polite'>
                <strong>{results.length}</strong> {t('projects found')}
              </span>
              <div>
                <NativeSelect
                  aria-label={t('Sort projects')}
                  value={filter.sort}
                  onChange={(e) => update('sort', e.target.value)}
                >
                  <option value='selected'>{t('Curated order')}</option>
                  <option value='recent'>{t('Recently updated')}</option>
                  <option value='title'>{t('Project name')}</option>
                </NativeSelect>
                <div
                  className='ch-view-toggle'
                  aria-label={t('Results display')}
                >
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('List view')}
                    aria-pressed={display === 'list'}
                    onClick={() => setDisplay('list')}
                  >
                    <List aria-hidden />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('Card view')}
                    aria-pressed={display === 'cards'}
                    onClick={() => setDisplay('cards')}
                  >
                    <LayoutGrid aria-hidden />
                  </Button>
                </div>
              </div>
            </div>
            <p className='ch-muted'>
              {t(
                'Public projects only. Drafts and pending submissions stay in the creative workspace.'
              )}
            </p>
            {renderResults()}
          </section>
          <aside className='ch-explore-rail'>
            <section className='ch-panel ch-discover-tip'>
              <Compass aria-hidden />
              <h2>{t('Small discoveries, new possibilities.')}</h2>
              <p>
                {t(
                  'Look for a practical tool, a beautiful detail, or a different way to make something.'
                )}
              </p>
              <div className='ch-topic-links'>
                {['Web', 'UI', 'AI', 'Workflow'].map((term) => (
                  <button
                    key={term}
                    type='button'
                    onClick={() => update('search', term)}
                  >
                    #{term}
                  </button>
                ))}
              </div>
            </section>
            <section className='ch-panel'>
              <h2>{t('Prefer a visual browse?')}</h2>
              <p>
                {t(
                  'The project showcase keeps the larger covers and editorial layout you already know.'
                )}
              </p>
              <Link to='/creators'>
                {t('Open project showcase')}
                <ArrowRight aria-hidden />
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
