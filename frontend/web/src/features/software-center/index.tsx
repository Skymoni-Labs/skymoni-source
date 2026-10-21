import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  Info,
  LayoutGrid,
  Search,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { loadPublicSoftware } from './api'
import {
  defaultCatalogFilters,
  softwareTopic,
  type CatalogFilters,
} from './catalog-browsing'
import { SoftwareCatalogFilters } from './catalog-filters'
import { SoftwareCatalogSection } from './catalog-section'
import { SoftwareFeatured } from './featured'
import type { SoftwareEntry } from './types'

import '@/styles/software-center.css'

export function SoftwareCenter() {
  const { t, i18n } = useTranslation()
  const [filters, setFilters] = useState<CatalogFilters>(defaultCatalogFilters)
  const browse = useRef<HTMLDivElement>(null)
  const catalog = useQuery({
    queryKey: ['software', 'public'],
    queryFn: ({ signal }) => loadPublicSoftware(signal),
    staleTime: 0,
    refetchOnWindowFocus: true,
    meta: { errorToast: false },
  })
  const entries = catalog.data?.items ?? []
  const query = filters.search.trim().toLocaleLowerCase()
  const filtered = entries.filter((entry) => {
    const kindMatches = filters.kind === 'all' || entry.kind === filters.kind
    const platformMatches =
      filters.platform === 'all' ||
      entry.platform.toLowerCase().includes(filters.platform.toLowerCase())
    const topicMatches =
      filters.topic === 'all' || softwareTopic(entry) === filters.topic
    const text = [
      entry.name,
      t(entry.name),
      entry.description,
      t(entry.description),
      entry.platform,
      entry.details?.category,
      t(entry.details?.category || ''),
    ]
      .join(' ')
      .toLocaleLowerCase()
    return (
      kindMatches &&
      platformMatches &&
      topicMatches &&
      (!query || text.includes(query))
    )
  })
  const isFiltered =
    Boolean(query) ||
    filters.kind !== 'all' ||
    filters.platform !== 'all' ||
    filters.topic !== 'all'
  const viewAll = (kind: SoftwareEntry['kind']) => {
    setFilters({ ...defaultCatalogFilters, kind })
    requestAnimationFrame(() => {
      browse.current?.focus({ preventScroll: true })
      browse.current?.scrollIntoView({ block: 'start' })
    })
  }
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  return (
    <main className='sc-main'>
      <div className='sc-store-shell'>
        <nav className='sc-rail' aria-label={t('Software Center navigation')}>
          {[
            {
              label: 'Discover',
              icon: Sparkles,
              href: '#software-featured',
              filter: 'all' as const,
            },
            {
              label: 'Software',
              icon: LayoutGrid,
              href: '#skymoni-software',
              filter: 'software' as const,
            },
            {
              label: 'Tool',
              icon: Wrench,
              href: '#community-tools',
              filter: 'tool' as const,
            },
          ].map((item) => (
            <Button
              key={item.filter}
              variant='ghost'
              role='link'
              render={<a href={item.href} />}
              aria-current={filters.kind === item.filter ? 'page' : undefined}
              onClick={() => {
                setFilters({ ...defaultCatalogFilters, kind: item.filter })
              }}
            >
              <item.icon aria-hidden='true' />
              {t(item.label)}
            </Button>
          ))}
          <Button
            variant='ghost'
            role='link'
            render={<a href='#installation' />}
          >
            <Info aria-hidden='true' />
            {t('Help')}
          </Button>
        </nav>

        <div className='sc-store-content'>
          <header className='sc-toolbar'>
            <div className='sc-store-title'>
              <span className='sc-store-mark' aria-hidden='true'>
                <span className='sc-brand-orbit' />
                <span className='sc-brand-cloud'>
                  <img
                    src='/branding/skymoni-cloud-friend-transparent.png'
                    width={96}
                    height={96}
                    alt=''
                  />
                </span>
                <Sparkles className='sc-brand-sparkle' />
              </span>
              <div>
                <span className='sc-title-eyebrow'>SKYMONI COLLECTION</span>
                <h1>{t('Software Center')}</h1>
                <p>{t('Find your next everyday companion.')}</p>
              </div>
            </div>
            <InputGroup className='sc-search' role='search'>
              <InputGroupAddon>
                <Search aria-hidden='true' />
              </InputGroupAddon>
              <InputGroupInput
                type='search'
                aria-label={t('Search apps and tools')}
                placeholder={t('Search apps and tools')}
                value={filters.search}
                onChange={(event) =>
                  setFilters({ ...filters, search: event.target.value })
                }
              />
              {filters.search && (
                <InputGroupAddon align='inline-end'>
                  <InputGroupButton
                    size='icon-xs'
                    aria-label={t('Clear search')}
                    onClick={() => setFilters({ ...filters, search: '' })}
                  >
                    <X aria-hidden='true' />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
          </header>

          {!catalog.isPending &&
            !catalog.isError &&
            !isFiltered &&
            entries.length > 0 && (
              <SoftwareFeatured
                entries={entries}
                config={catalog.data?.featured}
              />
            )}

          <div id='software-browse' ref={browse} tabIndex={-1}>
            <SoftwareCatalogFilters
              entries={entries}
              filters={filters}
              onChange={setFilters}
            />
          </div>

          <div className='sc-catalog-status' aria-live='polite'>
            <span>{t('Official downloads and web apps, in one place.')}</span>
            {isFiltered && (
              <span>
                {t('Results: {{total}}', {
                  total: formatNumber(filtered.length, locale),
                })}
              </span>
            )}
          </div>
          <p className='sc-version-note'>
            <Info aria-hidden />
            {t(
              'Listed versions may not be the latest. Check the official website for updates; cloud drive contents determine the available version.'
            )}
          </p>

          {catalog.isPending && <LoadingState />}
          {catalog.isError && (
            <ErrorState onRetry={() => void catalog.refetch()} />
          )}
          {!catalog.isPending &&
            !catalog.isError &&
            isFiltered &&
            !filtered.length && (
              <EmptyState
                icon={Search}
                title={t('No matching apps')}
                description={t(
                  'Try another name or choose a different category.'
                )}
                action={
                  <Button
                    variant='outline'
                    onClick={() => {
                      setFilters(defaultCatalogFilters)
                    }}
                  >
                    {t('Clear filters')}
                  </Button>
                }
              />
            )}

          {!catalog.isPending && !catalog.isError && (
            <div className='sc-catalog'>
              {(['software', 'tool'] as const).map((kind) => {
                const matches = filtered.filter((entry) => entry.kind === kind)
                if (!matches.length && (isFiltered || entries.length > 0)) {
                  return null
                }
                return (
                  <SoftwareCatalogSection
                    key={`${kind}:${filters.kind}:${filters.platform}:${filters.topic}:${query}`}
                    kind={kind}
                    entries={matches}
                    preview={!isFiltered}
                    onViewAll={viewAll}
                  />
                )
              })}
            </div>
          )}

          <div className='sc-bottom-note'>
            <Check aria-hidden='true' />
            <span>
              {t(
                'Software downloads are free. Line packages and mailbox registration codes are available in the store.'
              )}
            </span>
            <a href='/store'>
              {t('Visit the store')}
              <ArrowRight aria-hidden='true' />
            </a>
          </div>
          <aside
            id='installation'
            className='sc-installation'
            aria-labelledby='installation-title'
          >
            <Info aria-hidden='true' />
            <div>
              <h2 id='installation-title'>{t('Installation notes')}</h2>
              <p>
                {t(
                  'The Windows installer is not yet code-signed. If Windows shows an unknown publisher, confirm that the download came from skymoni.com.'
                )}
              </p>
              <p>
                {t(
                  'On Android, download the APK and follow the system prompt to allow installation from your download source.'
                )}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
