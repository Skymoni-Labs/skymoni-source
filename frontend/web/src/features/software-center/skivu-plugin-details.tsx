import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight, Puzzle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

import { SkivuPluginInstall } from './skivu-plugin-install'
import {
  loadSkivuPlugins,
  skivuPluginCategory,
  skivuPluginQueryKey,
  type SkivuPluginEntry,
} from './skivu-plugins'

const permissionLabels: Record<string, string> = {
  storage: 'Plugin storage',
  files: 'Plugin files',
  secrets: 'Secure credentials',
  network: 'Network access',
  'network.local': 'Local network access',
  'ai.generate': 'AI generation',
  'chat.read': 'Read conversations',
  'chat.write': 'Write conversations',
  'external.open': 'Open external links',
  'chat.tools': 'Conversation tools',
}

export function SkivuPluginDetailsPage({ softwareId }: { softwareId: string }) {
  const { t } = useTranslation()
  const catalog = useQuery({
    queryKey: skivuPluginQueryKey,
    queryFn: ({ signal }) => loadSkivuPlugins(signal),
    staleTime: 60_000,
    retry: 1,
    meta: { errorToast: false },
  })
  const entry = catalog.data?.items.find((item) => item.id === softwareId)
  const incomplete = Boolean(
    catalog.data?.unavailableSources.length || catalog.data?.rejectedItems
  )
  return (
    <main className='sc-main sd-main'>
      <div className='sd-shell'>
        <nav
          className='sd-breadcrumb'
          aria-label={t('Software Center navigation')}
        >
          <Button variant='ghost' role='link' render={<Link to='/software' />}>
            <ArrowLeft aria-hidden />
            {t('Back to Software Center')}
          </Button>
        </nav>
        {catalog.isPending && <LoadingState />}
        {(catalog.isError || (!entry && incomplete)) && (
          <ErrorState onRetry={() => void catalog.refetch()} />
        )}
        {catalog.isSuccess && !entry && !incomplete && (
          <EmptyState
            icon={Puzzle}
            title={t('Plugin not available')}
            description={t(
              'This plugin may have been removed from the Skivu catalog.'
            )}
          />
        )}
        {entry && <SkivuPluginDetails entry={entry} />}
      </div>
    </main>
  )
}

function SkivuPluginDetails({ entry }: { entry: SkivuPluginEntry }) {
  const { t } = useTranslation()
  const info = [
    [t('Publisher'), entry.author],
    [t('Version'), entry.version],
    [t('License'), entry.license],
    [t('System requirements'), `Skivu ≥ ${entry.minHostVersion} · Android`],
    [t('Plugin ID'), entry.pluginId],
  ]
  return (
    <>
      <header className='sd-hero'>
        <div className='sd-hero-orbit' aria-hidden />
        <div className='sd-hero-copy'>
          <span className='sc-title-eyebrow'>SKIVU PLUGINS</span>
          <div className='sd-identity'>
            <div className='sc-artwork sc-artwork-generic'>
              <Puzzle aria-hidden />
            </div>
            <div>
              <h1>{entry.name}</h1>
              <p className='sd-publisher'>{entry.author}</p>
              <div className='sd-badges'>
                <Badge variant='outline'>{t(skivuPluginCategory(entry))}</Badge>
                <Badge variant='outline'>v{entry.version}</Badge>
              </div>
            </div>
          </div>
          <p className='sd-summary'>{entry.description}</p>
          <p className='sd-platform'>
            {t('Requires Skivu {{version}} or later on Android.', {
              version: entry.minHostVersion,
            })}
          </p>
        </div>
        <Card className='sd-download'>
          <CardContent>
            <h2>{t('Install in Skivu')}</h2>
            <SkivuPluginInstall entry={entry} />
            <p>
              {t(
                'Install and enable this plugin from the Skivu plugin market.'
              )}
            </p>
          </CardContent>
        </Card>
      </header>
      <div className='sd-body'>
        <div className='sd-sections'>
          <Card className='sd-panel'>
            <CardHeader>
              <h2>{t('Plugin introduction')}</h2>
            </CardHeader>
            <CardContent>
              <p className='sd-prose'>{entry.description}</p>
            </CardContent>
          </Card>
          <Card className='sd-panel'>
            <CardHeader>
              <h2>{t('Requested permissions')}</h2>
            </CardHeader>
            <CardContent>
              {entry.permissions.length ? (
                <ul className='sc-plugin-permissions'>
                  {entry.permissions.map((permission) => (
                    <li key={permission}>
                      {t(permissionLabels[permission] || permission)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='sd-prose'>
                  {t('No additional host permissions declared.')}
                </p>
              )}
              {entry.networkDomains.length > 0 && (
                <p className='sd-prose'>
                  {t('Network domains')}:{' '}
                  {entry.networkDomains.includes('*')
                    ? t('All domains')
                    : entry.networkDomains.join(', ')}
                </p>
              )}
              <p className='sd-prose'>
                {t('Review the permission request in Skivu before installing.')}
              </p>
            </CardContent>
          </Card>
          <Card className='sd-panel'>
            <CardHeader>
              <h2>{t('Plugin source')}</h2>
            </CardHeader>
            <CardContent>
              <Button
                variant='link'
                role='link'
                className='sd-project-link'
                render={
                  <a
                    href={entry.sourceUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                {t('View source repository')}
                <ArrowUpRight aria-hidden />
              </Button>
              <p className='sd-prose'>SHA-256</p>
              <code className='sc-plugin-checksum'>{entry.packageSha256}</code>
              <CopyButton
                size='sm'
                variant='outline'
                value={entry.packageSha256}
                aria-label={t('Copy checksum')}
              >
                {t('Copy checksum')}
              </CopyButton>
            </CardContent>
          </Card>
        </div>
        <aside aria-label={t('Additional information')}>
          <Card className='sd-panel'>
            <CardHeader>
              <h2>{t('Additional information')}</h2>
            </CardHeader>
            <CardContent>
              <dl className='sc-plugin-info'>
                {info.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  )
}
