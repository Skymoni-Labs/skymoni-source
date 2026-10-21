import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Sparkles } from 'lucide-react'
import { useMemo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { useCreatorAccessStore } from '@/stores/creator-access-store'
import { useCreatorStore } from '@/stores/creator-store'

import { CreatorActivation } from './access'
import { loadCreatorWork } from './api'
import {
  ProjectAccessLinks,
  ProjectContent,
} from './components/project-content'
import { SaveWorkButton, WorkCard } from './components/shared'
import { WorkAuthor } from './components/work-author'
import { projectSchema } from './lib/schema'
import { randomRelatedWorks } from './lib/showcase'
import { PublishedVersions } from './releases'
import { categoryLabel, settingsFor } from './types'
import { WorkComments } from './work-comments'

export function CreatorDetails(props: { workId: string }) {
  const { t } = useTranslation()
  const local = useCreatorStore((state) => state.works)
  const published = useCreatorStore((state) => state.published)
  const isCreator = useCreatorAccessStore((state) => state.mode === 'creator')
  const related = useMemo(
    () => randomRelatedWorks(published, props.workId),
    [published, props.workId]
  )
  const localWork = local.find(
    (item) => !item.sample && item.id === props.workId
  )
  const detail = useQuery({
    queryKey: ['creator-project', props.workId],
    queryFn: ({ signal }) => loadCreatorWork(props.workId, signal),
    enabled: !localWork,
    retry: false,
    staleTime: 30_000,
  })
  const work = localWork ?? detail.data?.work
  const back = (
    <Button variant='ghost' render={<Link to='/creators/projects' />}>
      <ArrowLeft aria-hidden />
      {t('Back to projects')}
    </Button>
  )
  if (!localWork && detail.isPending) {
    return (
      <main className='cc-main cc-shell' role='status'>
        {t('Loading...')}
      </main>
    )
  }
  if (!localWork && detail.isError) {
    const missing =
      (detail.error as { response?: { status?: number } }).response?.status ===
      404
    return (
      <main className='cc-main cc-shell'>
        <EmptyState
          title={t(missing ? 'Project not found' : 'Failed to load')}
          action={
            missing ? (
              back
            ) : (
              <Button onClick={() => void detail.refetch()}>
                {t('Retry')}
              </Button>
            )
          }
        />
      </main>
    )
  }
  if (!work) {
    return (
      <main className='cc-main cc-shell'>
        <EmptyState title={t('Project not found')} action={back} />
      </main>
    )
  }
  if (!work.sample && work.status !== 'published' && !isCreator) {
    return <CreatorActivation gated />
  }
  const settings = settingsFor(work)
  const title = work.sample ? t(work.title) : work.title
  const accessUrl = projectSchema.shape.url.safeParse(work.url).success
    ? work.url
    : ''
  return (
    <main className='cc-main'>
      <div
        className='cc-shell cc-detail-shell'
        style={{ '--cc-project-accent': settings.accent } as CSSProperties}
      >
        <div className='cc-detail-breadcrumb'>
          {back}
          <span>{t(work.sample ? 'Example project' : 'Creator project')}</span>
        </div>
        <header className='cc-detail-heading'>
          <span className={`cc-category cc-category-${work.category}`}>
            {settings.categoryName || t(categoryLabel(work.category))}
          </span>
          <h1>{title || t('Untitled project')}</h1>
          <p>{work.sample ? t(work.summary) : work.summary}</p>
          <div className='cc-detail-meta'>
            <WorkAuthor work={work} />
            <SaveWorkButton id={work.id} />
            {!work.sample && work.status === 'published' && (
              <a href='#work-comments' className='sf-work-comment-jump'>
                评论作品 ↓
              </a>
            )}
          </div>
        </header>
        <div className='cc-detail-columns'>
          <div className='cc-detail-body'>
            <ProjectContent work={work} />
            {work.status === 'published' && <PublishedVersions id={work.id} />}
            {work.reviewNote && <p role='status'>{work.reviewNote}</p>}
          </div>
          <aside className='cc-detail-aside'>
            <section className='cc-author-panel'>
              <WorkAuthor work={work} panel />
              <p>{t(work.sample ? 'Example creator' : 'Creator')}</p>
              <div className='cc-aside-divider' />
              <ProjectAccessLinks work={work} />
              {!accessUrl && (
                <p className='cc-aside-note'>
                  {t(
                    work.sample
                      ? 'This is a layout example. No live website or download is attached.'
                      : 'Add a link or attachment in the editor to share access to your work.'
                  )}
                </p>
              )}
              {!work.sample && local.some((item) => item.id === work.id) && (
                <Button
                  variant='outline'
                  render={
                    <Link to='/creators/studio' search={{ edit: work.id }} />
                  }
                >
                  <Pencil aria-hidden />
                  {t('Edit project')}
                </Button>
              )}
              <div className='cc-tags'>
                {work.tags
                  .split(',')
                  .filter(Boolean)
                  .map((tag) => (
                    <span key={tag}>{tag.trim()}</span>
                  ))}
              </div>
            </section>
            <section className='cc-small-note'>
              <Sparkles aria-hidden />
              <p>
                {t(
                  'The work is yours. Share the finished creation; source code is optional.'
                )}
              </p>
            </section>
          </aside>
        </div>
        {!work.sample && work.status === 'published' && (
          <WorkComments key={work.id} workId={work.id} />
        )}
        {settings.showRelated && related.length > 0 && (
          <section className='cc-related'>
            <h2>{t('Keep exploring')}</h2>
            <div className='cc-work-grid'>
              {related.map((item) => (
                <WorkCard key={item.id} work={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
