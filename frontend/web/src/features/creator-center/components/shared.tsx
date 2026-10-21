import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Bookmark } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useCreatorStore } from '@/stores/creator-store'

import { categoryLabel, settingsFor, type Work } from '../types'
import { CoverArt } from './cover-art'
import { WorkAuthor } from './work-author'

export function SaveWorkButton(props: { id: string; compact?: boolean }) {
  const { t } = useTranslation()
  const selected = useCreatorStore((state) => state.saved.includes(props.id))
  const toggle = useCreatorStore((state) => state.toggleSaved)
  return (
    <Button
      variant='outline'
      size={props.compact ? 'icon' : 'default'}
      className={props.compact ? 'cc-save-compact' : 'cc-save'}
      aria-label={t(selected ? 'Remove from saved projects' : 'Save project')}
      aria-pressed={selected}
      onClick={() => {
        try {
          toggle(props.id)
        } catch {
          toast.error(
            t(
              'Unable to save. Please retry or refresh if the content has changed.'
            )
          )
        }
      }}
    >
      <Bookmark aria-hidden fill={selected ? 'currentColor' : 'none'} />
      {!props.compact && t(selected ? 'Saved' : 'Save project')}
    </Button>
  )
}

export function WorkCard(props: { work: Work; showTags?: boolean }) {
  const { t } = useTranslation()
  const work = props.work
  const title = work.sample ? t(work.title) : work.title
  const settings = settingsFor(work)
  return (
    <article
      className='cc-work-card'
      style={{ '--cc-project-accent': settings.accent } as CSSProperties}
    >
      <Link
        to='/creators/works/$workId'
        params={{ workId: work.id }}
        className='cc-work-hitarea'
        tabIndex={-1}
        aria-hidden='true'
      />
      <Link
        to='/creators/works/$workId'
        params={{ workId: work.id }}
        aria-label={title}
        className='cc-cover-link'
      >
        <CoverArt work={work} />
        <span className='cc-cover-badge'>
          {t(work.sample ? 'Example project' : 'Creator project')}
        </span>
        <span className='cc-cover-open'>
          <ArrowUpRight aria-hidden />
        </span>
      </Link>
      <div className='cc-card-info'>
        <span className={`cc-category cc-category-${work.category}`}>
          {settings.categoryName || t(categoryLabel(work.category))}
        </span>
        <SaveWorkButton compact id={work.id} />
        <h3>
          <Link to='/creators/works/$workId' params={{ workId: work.id }}>
            {title}
          </Link>
        </h3>
        <p>{work.sample ? t(work.summary) : work.summary}</p>
        {props.showTags && (
          <div className='cs-card-tags'>
            {work.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, 3)
              .map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
          </div>
        )}
        <div className='cc-card-author'>
          <WorkAuthor work={work} />
        </div>
      </div>
    </article>
  )
}
