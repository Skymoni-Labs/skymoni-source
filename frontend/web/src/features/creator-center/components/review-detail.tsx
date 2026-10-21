import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import '@/styles/creator-center.css'

import { downloadFile } from '../lib/files'
import { canReview, type ReviewDecision, type ReviewItem } from '../lib/review'
import { isSafeProjectUrl } from '../lib/schema'
import { ProjectContent } from './project-content'

export function ReviewDetail(props: {
  item?: ReviewItem
  busy: boolean
  onClose: () => void
  onDecision: (item: ReviewItem, decision: ReviewDecision) => void
}) {
  const { t } = useTranslation()
  const item = props.item
  const release = item?.release
  const file = release?.package
  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={item?.title ?? t('Review details')}
      description={`${item?.author ?? ''}${item?.handle ? ` · @${item.handle}` : ''}${item?.ownerId ? ` · UID ${item.ownerId}` : ''}`}
      contentClassName='sm:max-w-5xl'
      contentHeight='min(65vh, 720px)'
      footer={
        item && (
          <>
            <Button variant='outline' onClick={props.onClose}>
              {t('Close')}
            </Button>
            {(['approve', 'reject', 'unpublish'] as const)
              .filter((decision) => canReview(item, decision))
              .map((decision) => (
                <Button
                  key={decision}
                  disabled={props.busy}
                  variant={decision === 'approve' ? 'default' : 'outline'}
                  onClick={() => props.onDecision(item, decision)}
                >
                  {t(
                    {
                      approve: 'Approve',
                      reject: 'Return for changes',
                      unpublish: 'Unpublish',
                    }[decision]
                  )}
                </Button>
              ))}
          </>
        )
      }
    >
      {item?.reviewNote && (
        <div className='bg-muted mb-4 rounded-lg p-3 text-sm whitespace-pre-wrap'>
          <strong>{t('Review note')}</strong>
          <p>{item.reviewNote}</p>
        </div>
      )}
      {release ? (
        <div className='space-y-5'>
          <div className='flex flex-wrap gap-2'>
            <Badge>{release.platform}</Badge>
            <Badge variant='outline'>{release.version}</Badge>
          </div>
          <section>
            <h3 className='mb-2 font-semibold'>{t('Release notes')}</h3>
            <p className='text-sm whitespace-pre-wrap'>{release.notes}</p>
          </section>
          <dl className='grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-2'>
            <div>
              <dt className='text-muted-foreground'>{t('Source & rights')}</dt>
              <dd>
                {t(
                  {
                    original: 'Original work',
                    authorized: 'Authorized distribution',
                    'open-source': 'Open source',
                  }[release.provenance]
                )}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>{t('License')}</dt>
              <dd>{release.license || '—'}</dd>
            </div>
            {[
              [t('Download link'), release.downloadUrl],
              [t('Source URL'), release.sourceUrl],
              [t('Store link'), release.storeUrl],
            ].map(
              ([label, url]) =>
                url && (
                  <div key={label} className='sm:col-span-2'>
                    <dt className='text-muted-foreground'>{label}</dt>
                    <dd className='break-all'>
                      {isSafeProjectUrl(url) ? (
                        <a
                          className='text-primary underline'
                          href={url}
                          target='_blank'
                          rel='noopener noreferrer'
                        >
                          {url}
                        </a>
                      ) : (
                        url
                      )}
                    </dd>
                  </div>
                )
            )}
          </dl>
          {file && (
            <Button
              variant='outline'
              onClick={() => void downloadFile(file.id, file.name)}
            >
              {t('Download')} · {file.name}
            </Button>
          )}
          {item.work?.status !== 'published' && (
            <p className='rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100'>
              {t(
                'Approve the parent project before approving this software release.'
              )}
            </p>
          )}
        </div>
      ) : (
        item?.work && (
          <>
            <p className='text-muted-foreground mb-4 text-sm'>
              {item.work.summary}
            </p>
            {isSafeProjectUrl(item.work.url) && (
              <a
                className='text-primary mb-4 inline-block text-sm underline'
                href={item.work.url}
                target='_blank'
                rel='noopener noreferrer'
              >
                {t('Visit project')} ↗
              </a>
            )}
            <div
              className='cc-page'
              style={{ padding: 0, background: 'transparent' }}
            >
              <ProjectContent work={item.work} />
            </div>
          </>
        )
      )}
    </Dialog>
  )
}
