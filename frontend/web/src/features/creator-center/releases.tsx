import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { loadCreatorWork } from './api'
import { downloadFile } from './lib/files'

export function PublishedVersions({ id }: { id: string }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['creator-project', id],
    queryFn: ({ signal }) => loadCreatorWork(id, signal),
    retry: false,
  })
  if (!query.data?.releases.length) return null
  return (
    <section className='cc-content-section'>
      <h2>{t('Published versions')}</h2>
      {query.data.releases.map((release) => (
        <div className='mb-3 space-y-3 rounded-xl border p-4' key={release.id}>
          <strong>
            {release.version} · {release.platform}
          </strong>
          <p className='whitespace-pre-wrap'>{release.notes}</p>
          <div className='flex flex-wrap gap-2'>
            {release.package ? (
              <Button
                onClick={() =>
                  void downloadFile(
                    release.package?.id ?? '',
                    release.package?.name ?? ''
                  )
                }
              >
                {t('Download')}
              </Button>
            ) : (
              <Button
                render={
                  <a
                    href={release.downloadUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                {t('Download')}
              </Button>
            )}
            {release.storeUrl && (
              <Button
                variant='outline'
                render={
                  <a
                    href={release.storeUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                {t('Store')}
              </Button>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}
