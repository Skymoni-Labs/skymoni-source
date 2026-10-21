import { Link } from '@tanstack/react-router'
import {
  ArrowDownToLine,
  ArrowUpRight,
  ChevronDown,
  ShoppingBag,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import { getForwardedDownload } from './download-forwarding'
import { isCloudDriveDownload } from './download-links'
import { SoftwareHistory } from './software-history'
import type { SoftwareEntry } from './types'

function SoftwarePlatformDownloads(props: {
  entry: SoftwareEntry
  featured?: boolean
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={props.featured ? 'default' : 'secondary'}
            className={cn('sc-get', props.featured && 'sc-feature-action')}
          />
        }
        aria-label={t('Choose a platform for {{name}}', {
          name: props.entry.name,
        })}
      >
        {props.entry.downloadUrl
          ? t('Choose platform')
          : t('Download software')}
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='max-h-[min(70vh,var(--available-height,70vh))] w-[min(30rem,calc(100vw-2rem))] min-w-64 overflow-y-auto'
      >
        {props.entry.downloads?.map((item) => {
          const forwarded =
            item.kind === 'installer'
              ? getForwardedDownload(item.url)
              : undefined
          return (
            <div
              className='flex items-stretch gap-1'
              key={`${item.platform}:${item.label}:${item.url}`}
            >
              <DropdownMenuItem
                className='min-w-0 flex-1'
                render={
                  <a
                    href={forwarded || item.url}
                    download={
                      item.kind === 'installer'
                        ? item.filename || undefined
                        : undefined
                    }
                    target={item.kind === 'installer' ? undefined : '_blank'}
                    rel={
                      item.kind === 'installer'
                        ? undefined
                        : 'noopener noreferrer'
                    }
                  />
                }
              >
                {item.kind === 'installer' ? (
                  <ArrowDownToLine aria-hidden />
                ) : (
                  <ArrowUpRight aria-hidden />
                )}
                <span className='flex-1'>
                  <span className='block'>
                    {item.platform} · {t(item.label)}
                  </span>
                  {forwarded && (
                    <span className='text-muted-foreground text-[11px]'>
                      {t('Site relay')}
                    </span>
                  )}
                </span>
                {item.version && (
                  <span className='text-muted-foreground text-xs'>
                    v{item.version}
                  </span>
                )}
              </DropdownMenuItem>
              {forwarded && (
                <DropdownMenuItem
                  className='text-muted-foreground shrink-0 text-xs'
                  aria-label={t('Original download for {{name}}', {
                    name: `${props.entry.name} · ${item.platform} · ${item.label}`,
                  })}
                  render={
                    <a
                      href={item.url}
                      target='_blank'
                      rel='noopener noreferrer'
                    />
                  }
                >
                  {t('Original source')}
                  <ArrowUpRight aria-hidden />
                </DropdownMenuItem>
              )}
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// The Mac build is a separately managed catalog entry.
const storeSoftwareIds = new Set([
  'drip',
  '96b2ad63-7355-4fe9-b7e8-92a8ac85abd8',
  'skymoni-mail',
])

export function SoftwareCardDetailsLink(props: { entry: SoftwareEntry }) {
  const { t } = useTranslation()
  return (
    <Link
      className='sc-card-link'
      to='/software/$softwareId'
      params={{ softwareId: props.entry.id }}
      aria-label={t(props.entry.name, { defaultValue: props.entry.name })}
    />
  )
}

export function SoftwareStoreAction(props: { entry: SoftwareEntry }) {
  const { t } = useTranslation()
  if (
    props.entry.kind !== 'software' ||
    !storeSoftwareIds.has(props.entry.id)
  ) {
    return null
  }
  return (
    <Button
      variant='outline'
      size='sm'
      role='link'
      className='sc-store-action'
      render={<Link to='/store' />}
    >
      <ShoppingBag aria-hidden='true' />
      {t('Visit the store')}
    </Button>
  )
}

export function SoftwareAction(props: {
  entry: SoftwareEntry
  featured?: boolean
}) {
  return <><SoftwarePrimaryAction {...props} /><SoftwareHistory entry={props.entry} /></>
}

function SoftwarePrimaryAction(props: {
  entry: SoftwareEntry
  featured?: boolean
}) {
  const { t } = useTranslation()
  const entry = props.entry
  if (isCloudDriveDownload(entry.downloadUrl)) {
    return (
      <>
        <Button
          variant={props.featured ? 'default' : 'secondary'}
          role='link'
          className={cn('sc-get', props.featured && 'sc-feature-action')}
          render={
            <a
              href={entry.downloadUrl}
              target='_blank'
              rel='noopener noreferrer'
            />
          }
          aria-label={t('Cloud drive download for {{name}}', {
            name: entry.name,
          })}
        >
          {t('Cloud drive download')}
          <ArrowUpRight aria-hidden='true' />
        </Button>
        {Boolean(entry.downloads?.length) && (
          <SoftwarePlatformDownloads {...props} />
        )}
      </>
    )
  }
  if (entry.downloads?.length) {
    return (
      <>
        {!entry.downloadUrl && entry.detailUrl && (
          <Button
            variant='outline'
            role='link'
            className={cn('sc-get', props.featured && 'sc-feature-action')}
            render={
              <a
                href={entry.detailUrl}
                target='_blank'
                rel='noopener noreferrer'
              />
            }
            aria-label={t('Visit {{name}} website', { name: entry.name })}
          >
            {t('Official website')}
            <ArrowUpRight aria-hidden='true' />
          </Button>
        )}
        <SoftwarePlatformDownloads {...props} />
      </>
    )
  }
  if (!entry.downloadUrl) {
    if (!entry.detailUrl) return null
    return (
      <Button
        variant='outline'
        role='link'
        className={cn('sc-get', props.featured && 'sc-feature-action')}
        render={
          <a href={entry.detailUrl} target='_blank' rel='noopener noreferrer' />
        }
        aria-label={t('Visit {{name}} website', { name: entry.name })}
      >
        {t('Official website')}
        <ArrowUpRight aria-hidden='true' />
      </Button>
    )
  }
  let label = t('Download software')
  const forwarded = getForwardedDownload(entry.downloadUrl)
  if (entry.platform.includes('Windows')) label = t('Download for Windows')
  else if (entry.platform.includes('Android')) label = t('Download for Android')
  return (
    <>
      <Button
        variant={props.featured ? 'default' : 'secondary'}
        role='link'
        className={cn('sc-get', props.featured && 'sc-feature-action')}
        render={
          <a href={forwarded || entry.downloadUrl} download={entry.filename} />
        }
        aria-label={label}
      >
        {props.featured ? (
          <>
            <ArrowDownToLine aria-hidden='true' />
            {t('Free download')}
          </>
        ) : forwarded ? (
          t('Site relay')
        ) : (
          t('Get app')
        )}
      </Button>
      {forwarded && (
        <Button
          variant='outline'
          role='link'
          className='sc-get'
          render={
            <a
              href={entry.downloadUrl}
              target='_blank'
              rel='noopener noreferrer'
            />
          }
        >
          {t('Original source')}
          <ArrowUpRight aria-hidden />
        </Button>
      )}
    </>
  )
}
