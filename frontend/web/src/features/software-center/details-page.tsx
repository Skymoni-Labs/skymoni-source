import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Monitor,
  Package,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ProductImages } from '@/features/shop-preview/components/product-images'

import { loadPublicSoftware } from './api'
import { SoftwareArtwork } from './artwork'
import { softwareDownloadHeading, softwareDownloadNote } from './download-links'
import { SoftwareAction, SoftwareStoreAction } from './software-card'
import type { SoftwareEntry } from './types'

import '@/styles/software-center.css'
import '@/styles/software-details.css'

export function SoftwareDetailsPage(props: { softwareId: string }) {
  const { t } = useTranslation()
  const catalog = useQuery({
    queryKey: ['software', 'public'],
    queryFn: ({ signal }) => loadPublicSoftware(signal),
    staleTime: 0,
    meta: { errorToast: false },
  })
  const entry = catalog.data?.items.find(
    (item) => item.id === props.softwareId && item.published
  )
  const back = (
    <Button variant='ghost' role='link' render={<Link to='/software' />}>
      <ArrowLeft aria-hidden />
      {t('Back to Software Center')}
    </Button>
  )
  return (
    <main className='sc-main sd-main'>
      <div className='sd-shell'>
        <nav
          className='sd-breadcrumb'
          aria-label={t('Software Center navigation')}
        >
          {back}
        </nav>
        {catalog.isPending && <LoadingState />}
        {catalog.isError && (
          <ErrorState onRetry={() => void catalog.refetch()} />
        )}
        {!catalog.isPending && !catalog.isError && !entry && (
          <EmptyState
            icon={Package}
            title={t('Software not available')}
            description={t(
              'This item may have been unpublished. Explore other apps in the Software Center.'
            )}
            action={back}
          />
        )}
        {!catalog.isPending && !catalog.isError && entry && (
          <SoftwareDetailsContent
            key={entry.id}
            entry={entry}
            related={
              catalog.data?.items
                .filter((item) => item.id !== entry.id && item.published)
                .slice(0, 5) ?? []
            }
          />
        )}
      </div>
    </main>
  )
}

function SoftwareDetailsContent(props: {
  entry: SoftwareEntry
  related: SoftwareEntry[]
}) {
  const { t } = useTranslation()
  const entry = props.entry
  const details = entry.details
  const features = [
    ...new Set(
      details?.features
        ?.split('\n')
        .map((value) => value.trim())
        .filter(Boolean) ?? []
    ),
  ]
  const overview =
    details?.overview ||
    t(entry.description, { defaultValue: entry.description })
  const info = [
    ['Publisher', details?.publisher],
    ['Version', entry.version ? `v${entry.version}` : undefined],
    ['Supported platforms', entry.platform],
    ['Software category', details?.category],
    ['Last updated', details?.updatedAt],
    ['License', details?.license],
  ].filter(([, value]) => value)
  return (
    <>
      <header className='sd-hero' data-appearance={entry.appearance}>
        <div className='sd-hero-orbit' aria-hidden />
        <div className='sd-hero-copy'>
          <span className='sc-title-eyebrow'>SKYMONI COLLECTION</span>
          <div className='sd-identity'>
            <SoftwareArtwork entry={entry} />
            <div>
              <h1>{t(entry.name, { defaultValue: entry.name })}</h1>
              {details?.publisher && (
                <p className='sd-publisher'>{details.publisher}</p>
              )}
              <div className='sd-badges'>
                <Badge variant='outline'>
                  {t(entry.kind === 'tool' ? 'Companion tools' : 'Software')}
                </Badge>
                {details?.category && (
                  <Badge variant='outline'>{details.category}</Badge>
                )}
                {entry.version && (
                  <Badge variant='outline'>v{entry.version}</Badge>
                )}
              </div>
            </div>
          </div>
          <p className='sd-summary'>
            {t(entry.description, { defaultValue: entry.description })}
          </p>
          {entry.platform && (
            <span className='sd-platform'>
              <Monitor aria-hidden />
              {entry.platform}
            </span>
          )}
        </div>
        <Card className='sd-download'>
          <CardContent>
            <span className='sd-download-kicker'>
              <Sparkles aria-hidden />
              {t('Ready when you are')}
            </span>
            <h2>{t(softwareDownloadHeading(entry))}</h2>
            <SoftwareAction entry={entry} featured />
            <SoftwareStoreAction entry={entry} />
            {entry.detailUrl.startsWith('https://') &&
              Boolean(entry.downloadUrl || entry.downloads?.length) && (
                <Button
                  variant='outline'
                  role='link'
                  render={
                    <a
                      href={entry.detailUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                    />
                  }
                >
                  {t('Official website')}
                  <ArrowUpRight aria-hidden />
                </Button>
              )}
            <p className='sd-version-note'>
              {entry.version
                ? `${t('Listed version')} v${entry.version}。`
                : t('Version: refer to the official website')}{' '}
              {t(
                'Listed versions may not be the latest. Check the official website for updates; cloud drive contents determine the available version.'
              )}
            </p>
            <p>
              <Check aria-hidden />
              {t(softwareDownloadNote(entry))}
            </p>
            <CopyButton
              value={
                new URL(
                  `/software/${encodeURIComponent(entry.id)}`,
                  window.location.origin
                ).href
              }
              size='sm'
              aria-label={t('Copy detail page link')}
            >
              {t('Share this app')}
            </CopyButton>
          </CardContent>
        </Card>
      </header>

      <div className='sd-body'>
        <div className='sd-sections'>
          {details?.screenshotsEnabled !== false &&
            Boolean(details?.screenshots?.length) && (
              <Card
                className='sd-panel sd-screenshots'
                data-layout={details?.imageLayout ?? 'landscape'}
              >
                <CardHeader>
                  <h2>{t('Screenshots')}</h2>
                  <p>{t('Take a closer look before downloading.')}</p>
                </CardHeader>
                <CardContent>
                  <ProductImages
                    enabled
                    hideHeading
                    label={t('Screenshots')}
                    images={details?.screenshots}
                    name={entry.name}
                    imageLayout={details?.imageLayout ?? 'landscape'}
                  />
                </CardContent>
              </Card>
            )}
          {overview && (
            <Card className='sd-panel'>
              <CardHeader>
                <h2>{t('Software introduction')}</h2>
              </CardHeader>
              <CardContent>
                <p className='sd-prose'>{overview}</p>
              </CardContent>
            </Card>
          )}
          {features.length > 0 && (
            <Card className='sd-panel'>
              <CardHeader>
                <h2>{t('Key features')}</h2>
              </CardHeader>
              <CardContent>
                <ul className='sd-features'>
                  {features.map((feature) => (
                    <li key={feature}>
                      <span>
                        <Check aria-hidden />
                      </span>
                      <p>{feature}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {details?.changelog && (
            <Card className='sd-panel'>
              <CardHeader>
                <h2>{t("What's new in this version")}</h2>
                {entry.version && (
                  <Badge variant='secondary'>v{entry.version}</Badge>
                )}
              </CardHeader>
              <CardContent>
                <p className='sd-prose'>{details.changelog}</p>
              </CardContent>
            </Card>
          )}
          <Card className='sd-panel'>
            <CardHeader>
              <h2>{t('System requirements')}</h2>
            </CardHeader>
            <CardContent>
              <p className='sd-prose'>
                {details?.requirements ||
                  entry.platform ||
                  t('Refer to the official website for device requirements.')}
              </p>
            </CardContent>
          </Card>
          <Card className='sd-panel'>
            <CardHeader>
              <h2>{t('Additional information')}</h2>
            </CardHeader>
            <CardContent>
              <dl className='sd-info'>
                {info.map(([label, value]) => (
                  <div key={label}>
                    <dt>{t(label ?? '')}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {entry.detailUrl && (
                <Button
                  variant='link'
                  role='link'
                  className='sd-project-link'
                  render={
                    <a
                      href={
                        entry.detailUrl === '#installation'
                          ? '/software#installation'
                          : entry.detailUrl
                      }
                      target={
                        entry.detailUrl.startsWith('https://')
                          ? '_blank'
                          : undefined
                      }
                      rel={
                        entry.detailUrl.startsWith('https://')
                          ? 'noopener noreferrer'
                          : undefined
                      }
                    />
                  }
                >
                  {t(
                    entry.detailUrl === '#installation'
                      ? 'Installation notes'
                      : 'Official website'
                  )}
                  <ArrowUpRight aria-hidden />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
        {props.related.length > 0 && (
          <aside className='sd-related' aria-labelledby='sd-related-title'>
            <div className='sd-related-heading'>
              <h2 id='sd-related-title'>{t('Discover more')}</h2>
              <ArrowRight aria-hidden />
            </div>
            <div className='sd-related-list'>
              {props.related.map((item) => (
                <Link
                  key={item.id}
                  to='/software/$softwareId'
                  params={{ softwareId: item.id }}
                  className='sd-related-item'
                >
                  <SoftwareArtwork entry={item} />
                  <div>
                    <h3>{t(item.name, { defaultValue: item.name })}</h3>
                    <p>{item.platform}</p>
                    <span>{t(softwareDownloadHeading(item, 'Tool'))}</span>
                  </div>
                  <ArrowRight aria-hidden />
                </Link>
              ))}
            </div>
            <div className='sd-related-note'>
              <img
                src='/branding/skymoni-cloud-friend-transparent.png'
                alt=''
                width={64}
                height={64}
              />
              <p>{t('Find your next everyday companion.')}</p>
              <Link to='/software'>
                {t('All apps')}
                <ArrowRight aria-hidden />
              </Link>
            </div>
          </aside>
        )}
      </div>
    </>
  )
}
