import { ArrowDownToLine, ExternalLink, Puzzle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import type { SkivuPluginEntry } from './skivu-plugins'

export function SkivuPluginInstall({ entry }: { entry: SkivuPluginEntry }) {
  const { t } = useTranslation()
  return (
    <Dialog>
      <DialogTrigger render={<Button size='sm' className='sc-get' />}>
        <Puzzle aria-hidden />
        {t('Install in Skivu')}
      </DialogTrigger>
      <DialogContent className='sc-plugin-install'>
        <DialogTitle>
          {entry.name} · {t('Installation guide')}
        </DialogTitle>
        <DialogDescription>
          {t('Requires Skivu {{version}} or later on Android.', {
            version: entry.minHostVersion,
          })}
        </DialogDescription>
        <ol className='sc-plugin-steps'>
          <li>{t('Open Skivu and enter its plugin market.')}</li>
          <li>
            {t('Search for the plugin name and check its author and version.')}
          </li>
          <li>
            {t(
              'Confirm the requested permissions in Skivu, then install and enable it.'
            )}
          </li>
        </ol>
        <CopyButton
          size='sm'
          variant='outline'
          value={entry.name}
          aria-label={t('Copy plugin name')}
        >
          {t('Copy plugin name')}
        </CopyButton>
        {entry.format === 'web-plugin' && (
          <>
            <p>
              {t(
                'You can also download this package and use Import plugin in Skivu.'
              )}
            </p>
            <Button
              variant='outline'
              role='link'
              render={
                <a
                  href={entry.packageUrl}
                  download={`${entry.pluginId}-${entry.version}.skivu.json`}
                />
              }
            >
              <ArrowDownToLine aria-hidden />
              {t('Download plugin package')}
            </Button>
          </>
        )}
        <Button
          variant='outline'
          role='link'
          render={
            <a href='/skivu/' target='_blank' rel='noopener noreferrer' />
          }
        >
          {t('Get Skivu')}
          <ExternalLink aria-hidden />
        </Button>
        <p className='sc-plugin-note'>
          {t(
            'Opening this guide does not install a plugin. Installation and permissions are managed in Skivu.'
          )}
        </p>
      </DialogContent>
    </Dialog>
  )
}
