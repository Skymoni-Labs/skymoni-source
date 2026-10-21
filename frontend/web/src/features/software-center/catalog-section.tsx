import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { getPageNumbers } from '@/lib/utils'

import { SoftwareEntryCard } from './entry-card'
import type { SoftwareEntry } from './types'

const previewSize = 6
const pageSize = 12

export function SoftwareCatalogSection(props: {
  kind: SoftwareEntry['kind']
  entries: SoftwareEntry[]
  preview: boolean
  onViewAll: (kind: SoftwareEntry['kind']) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [requestedPage, setPage] = useState(1)
  const heading = useRef<HTMLHeadingElement>(null)
  const totalPages = Math.max(1, Math.ceil(props.entries.length / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const start = props.preview ? 0 : (page - 1) * pageSize
  const visible = props.entries.slice(
    start,
    start + (props.preview ? previewSize : pageSize)
  )
  const sectionId =
    props.kind === 'software' ? 'skymoni-software' : 'community-tools'
  const title = props.kind === 'software' ? t('Software') : t('Companion tools')
  const goToPage = (next: number) => {
    setPage(next)
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'start' })
  }
  return (
    <section
      id={sectionId}
      aria-labelledby={`${sectionId}-title`}
      className='sc-catalog-section'
    >
      <div className='sc-section-heading'>
        <div className='sc-section-title'>
          <h2 id={`${sectionId}-title`} ref={heading} tabIndex={-1}>
            {props.preview && props.entries.length > 0 ? (
              <Button
                variant='ghost'
                className='sc-section-more'
                aria-label={t('View all {{name}}', { name: title })}
                onClick={() => props.onViewAll(props.kind)}
              >
                {title}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  data-icon='inline-end'
                  aria-hidden
                />
              </Button>
            ) : (
              title
            )}
          </h2>
          <span className='sc-section-count'>
            {formatNumber(props.entries.length, locale)}
          </span>
        </div>
        <span>
          {props.kind === 'software'
            ? t('Download and make it yours.')
            : t('AI clients, coding assistants and everyday tools.')}
        </span>
      </div>
      {visible.length > 0 ? (
        <div className='sc-app-grid'>
          {visible.map((entry) => (
            <SoftwareEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            props.kind === 'software'
              ? t('No software published yet')
              : t('No tools published yet')
          }
        />
      )}
      {props.preview && props.entries.length > previewSize && (
        <Button
          variant='ghost'
          className='sc-view-all'
          onClick={() => props.onViewAll(props.kind)}
        >
          {t('View all {{total}} items', {
            total: formatNumber(props.entries.length, locale),
          })}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            data-icon='inline-end'
            aria-hidden
          />
        </Button>
      )}
      {!props.preview && props.entries.length > 0 && (
        <div className='sc-catalog-pagination'>
          <span aria-live='polite'>
            {t('Showing {{start}}–{{end}} of {{total}}', {
              start: formatNumber(start + 1, locale),
              end: formatNumber(start + visible.length, locale),
              total: formatNumber(props.entries.length, locale),
            })}
          </span>
          {totalPages > 1 && (
            <Pagination
              aria-label={t('Pagination for {{name}}', { name: title })}
            >
              <PaginationContent>
                <PaginationItem>
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label={t('Go to previous page')}
                    disabled={page === 1}
                    onClick={() => goToPage(page - 1)}
                  >
                    <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden />
                  </Button>
                </PaginationItem>
                {getPageNumbers(page, totalPages).map((number, index) => (
                  <PaginationItem
                    key={number === '...' ? `gap-${index}` : number}
                  >
                    {typeof number === 'number' ? (
                      <Button
                        variant={page === number ? 'outline' : 'ghost'}
                        size='icon'
                        aria-label={t('Go to page {{page}}', {
                          page: formatNumber(number, locale),
                        })}
                        aria-current={page === number ? 'page' : undefined}
                        onClick={() => goToPage(number)}
                      >
                        {formatNumber(number, locale)}
                      </Button>
                    ) : (
                      <span className='sc-page-gap' aria-hidden>
                        …
                      </span>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label={t('Go to next page')}
                    disabled={page === totalPages}
                    onClick={() => goToPage(page + 1)}
                  >
                    <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden />
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}
    </section>
  )
}
