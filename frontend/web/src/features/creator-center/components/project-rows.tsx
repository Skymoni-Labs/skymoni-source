import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Clock3,
  Link2,
  Paperclip,
  Pencil,
  Pin,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { handleServerError } from '@/lib/handle-server-error'
import { useCreatorHubStore } from '@/stores/creator-hub-store'

import { isSafeProjectUrl } from '../lib/schema'
import { categoryLabel, type Work } from '../types'
import { CoverArt } from './cover-art'
import { SaveWorkButton } from './shared'

function statusLabel(work: Work) {
  if (work.sample) return 'Example project'
  if (work.status === 'published') return 'Published'
  if (work.status === 'review') return 'Pending review'
  return 'Draft'
}

export function ProjectRows(props: {
  works: Work[]
  editable?: boolean
  pinnable?: boolean
}) {
  const { t, i18n } = useTranslation()
  const pinned = useCreatorHubStore((state) => state.pinned)
  const togglePinned = useCreatorHubStore((state) => state.togglePinned)
  return (
    <div className='ch-project-rows'>
      {props.works.map((work) => (
        <article key={work.id} className='ch-project-row'>
          <Link
            to='/creators/works/$workId'
            params={{ workId: work.id }}
            className='ch-row-hit'
            tabIndex={-1}
            aria-hidden='true'
          />
          <div className='ch-row-cover' aria-hidden>
            <CoverArt work={work} />
          </div>
          <div className='ch-row-body'>
            <div className='ch-row-title'>
              <Link to='/creators/works/$workId' params={{ workId: work.id }}>
                {work.sample
                  ? t(work.title)
                  : work.title || t('Untitled project')}
              </Link>
              <span className='ch-outline-badge'>{t(statusLabel(work))}</span>
            </div>
            <p>
              {work.sample
                ? t(work.summary)
                : work.summary ||
                  t('Add a short introduction to your project.')}
            </p>
            <div className='ch-row-tags'>
              {[
                ...new Set(
                  work.tags
                    .split(/[,，]/)
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                ),
              ]
                .slice(0, 4)
                .map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
            </div>
            <div className='ch-row-meta'>
              <span>
                <i className={`ch-category-dot ch-dot-${work.category}`} />
                {work.settings?.categoryName || t(categoryLabel(work.category))}
              </span>
              <span>{work.sample ? work.author : t('My project')}</span>
              <span>
                <Clock3 aria-hidden />
                {new Date(work.updatedAt).toLocaleDateString(
                  toIntlLocale(i18n.language)
                )}
              </span>
              {isSafeProjectUrl(work.url) && (
                <span>
                  <Link2 aria-hidden />
                  {t('Link included')}
                </span>
              )}
              {work.attachment && (
                <span>
                  <Paperclip aria-hidden />
                  {t('Attachment included')}
                </span>
              )}
            </div>
          </div>
          <div className='ch-row-actions'>
            {props.editable ? (
              <Button
                variant='outline'
                size='sm'
                render={
                  <Link to='/creators/studio' search={{ edit: work.id }} />
                }
              >
                <Pencil aria-hidden />
                {t('Edit project')}
              </Button>
            ) : (
              <SaveWorkButton id={work.id} compact />
            )}
            {props.pinnable && (
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t(
                  pinned.includes(work.id) ? 'Unpin project' : 'Pin project'
                )}
                aria-pressed={pinned.includes(work.id)}
                onClick={async () => {
                  try {
                    await togglePinned(work.id)
                  } catch (error) {
                    handleServerError(error)
                    toast.error(t('Pin up to six projects'))
                  }
                }}
              >
                <Pin
                  aria-hidden
                  fill={pinned.includes(work.id) ? 'currentColor' : 'none'}
                />
              </Button>
            )}
            <Link
              to='/creators/works/$workId'
              params={{ workId: work.id }}
              className='ch-row-open'
              aria-label={t('Open project details')}
            >
              <ArrowUpRight aria-hidden />
            </Link>
          </div>
        </article>
      ))}
    </div>
  )
}
